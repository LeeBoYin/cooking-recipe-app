-- 食材（廚房有什麼）：只記「有沒有」，不記數量。
-- 新增只經 add_pantry_items，移除與復原只經 remove_pantry_item、restore_pantry_item；
-- 成員可以直接改的只有放哪裡、想先用掉、期限、備註。

create table public.pantry_items (
  id uuid primary key check (private.is_uuid_v7(id)),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 對應到字典；對應不到時為空（限制：有資料時字典項目不能刪）
  ingredient_id text references public.dict_ingredients (id) on delete restrict,
  -- 使用者原本輸入的名稱，永遠保留
  raw_name text not null check (char_length(btrim(raw_name)) between 1 and 60),
  zone text not null check (zone in ('seasoning', 'fridge', 'freezer', 'pantry')),
  -- 加入的日期，以廚房時區解讀；再加入同一種食材時更新，重新算「最近買的」
  added_on date not null,
  want_to_use_soon boolean not null default false,
  -- 使用者自己設定的期限（廚房時區）；有值才會提醒
  expires_at date,
  date_type text check (date_type in ('use-by', 'best-before')),
  -- 設定期限的那天，由資料庫填；計算提醒比例用
  expiry_set_on date,
  status text not null default 'active' check (status in ('active', 'removed')),
  removed_at timestamptz,
  removed_by uuid references auth.users (id) on delete set null,
  -- 到期提醒已經通知到哪一級（05 的 alertNotified 攤平成兩欄）；改期限時清空
  alert_tier text check (alert_tier in ('soon', 'expiring', 'expired', 'past_best')),
  alert_on date,
  -- 上次問「還在嗎？」的日期
  still_there_asked_on date,
  -- 因為記錄食譜而移除時，是哪一篇食譜；recipes 表建好後再補外鍵（刪除時改成空值）
  removed_with_recipe_id uuid,
  note text check (char_length(note) <= 200),
  check ((status = 'removed') = (removed_at is not null)),
  check (status = 'removed' or removed_by is null),
  check ((expires_at is null) = (expiry_set_on is null)),
  check (expires_at is not null or date_type is null),
  check ((alert_tier is null) = (alert_on is null))
);

-- 同一個廚房的同一種食材只有一筆「有」
create unique index pantry_items_one_active
  on public.pantry_items (kitchen_id, ingredient_id)
  where status = 'active' and ingredient_id is not null;
-- 食材有哪些、最近買的、快到期的
create index pantry_items_kitchen_status on public.pantry_items (kitchen_id, status);
-- 最近移除（可復原）
create index pantry_items_removed on public.pantry_items (kitchen_id, removed_at)
  where status = 'removed';
-- 常買清單
create index pantry_items_frequent on public.pantry_items (kitchen_id, ingredient_id, added_on)
  where ingredient_id is not null;

-- 寫入前：記下誰改的；期限變動時填「設定那天」並清空提醒。
-- SECURITY DEFINER：要讀廚房的時區，不受呼叫者權限影響。
create function private.pantry_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
begin
  new.updated_by := (select auth.uid());
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if new.expires_at is null then
    new.date_type := null;
    new.expiry_set_on := null;
  end if;

  if new.expires_at is not null and (tg_op = 'INSERT' or new.expires_at is distinct from old.expires_at) then
    select timezone into v_timezone from public.kitchens where id = new.kitchen_id;
    new.expiry_set_on := (now() at time zone coalesce(v_timezone, 'UTC'))::date;
  end if;

  if tg_op = 'UPDATE' and new.expires_at is distinct from old.expires_at then
    new.alert_tier := null;
    new.alert_on := null;
  end if;
  return new;
end;
$$;

create trigger pantry_before_write before insert or update on public.pantry_items
  for each row execute function private.pantry_before_write();

---------------------------------------------------------------------------
-- 權限（RLS）與欄位授權
---------------------------------------------------------------------------

alter table public.pantry_items enable row level security;

-- 成員讀；成員改 zone、want_to_use_soon、expires_at、date_type、note（只能改「有」的）；
-- 新增、移除、復原只經資料庫函式，所以不開 INSERT 與 DELETE
revoke all on public.pantry_items from anon, authenticated;
grant select on public.pantry_items to authenticated;
grant update (zone, want_to_use_soon, expires_at, date_type, note) on public.pantry_items to authenticated;

create policy "成員可以讀食材" on public.pantry_items
  for select to authenticated
  using (private.is_kitchen_member(kitchen_id));
create policy "成員可以改食材" on public.pantry_items
  for update to authenticated
  using (private.is_kitchen_member(kitchen_id) and status = 'active')
  with check (private.is_kitchen_member(kitchen_id) and private.is_active_user());

-- 同廚房的成員即時看到彼此的變動（Realtime 會套用上面的讀取權限）
alter publication supabase_realtime add table public.pantry_items;

---------------------------------------------------------------------------
-- 資料庫函式
---------------------------------------------------------------------------

-- 一次加入多樣食材。p_items 是 JSON 陣列，每一項：
--   id（必填，手機產生的 UUID v7）、raw_name（必填）、ingredient_id、zone、want_to_use_soon、
--   expires_at（YYYY-MM-DD）、date_type、note。
-- 已經有的食材（同廚房、同 ingredient_id、狀態為 active）只更新加入日期並保留較早的期限；沒有的新增。
-- zone 沒給時用字典的預設存放位置，沒對應到字典就放 pantry。
-- 同一個 id 重送（網路重試）不會重複新增。回傳實際寫入的每一筆。
create function public.add_pantry_items(p_kitchen_id uuid, p_items jsonb)
returns setof public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_ingredient_id text;
  v_zone text;
  v_timezone text;
  v_today date;
  v_user uuid := (select auth.uid());
  v_row public.pantry_items;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if not private.is_kitchen_member(p_kitchen_id) then
    raise exception 'not_a_kitchen_member' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  select timezone into v_timezone from public.kitchens where id = p_kitchen_id;
  v_today := (now() at time zone v_timezone)::date;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item ->> 'id')::uuid;
    if v_id is null then
      raise exception 'invalid_items' using errcode = '22023';
    end if;

    -- 同一個 id 已經寫入過（重送）：原樣回傳
    select * into v_row from public.pantry_items where id = v_id and kitchen_id = p_kitchen_id;
    if found then
      return next v_row;
      continue;
    end if;

    v_ingredient_id := nullif(v_item ->> 'ingredient_id', '');
    v_zone := nullif(v_item ->> 'zone', '');
    if v_zone is null then
      select default_storage into v_zone from public.dict_ingredients where id = v_ingredient_id;
      v_zone := coalesce(v_zone, 'pantry');
    end if;

    insert into public.pantry_items as p (
      id, kitchen_id, created_by, ingredient_id, raw_name, zone, added_on,
      want_to_use_soon, expires_at, date_type, note
    ) values (
      v_id, p_kitchen_id, v_user, v_ingredient_id, v_item ->> 'raw_name', v_zone, v_today,
      coalesce((v_item ->> 'want_to_use_soon')::boolean, false),
      (v_item ->> 'expires_at')::date, v_item ->> 'date_type', v_item ->> 'note'
    )
    on conflict (kitchen_id, ingredient_id) where status = 'active' and ingredient_id is not null
    do update set
      added_on = excluded.added_on,
      expires_at = case
        when excluded.expires_at is not null and (p.expires_at is null or excluded.expires_at < p.expires_at)
          then excluded.expires_at else p.expires_at end,
      date_type = case
        when excluded.expires_at is not null and (p.expires_at is null or excluded.expires_at < p.expires_at)
          then excluded.date_type else p.date_type end
    returning * into v_row;

    return next v_row;
  end loop;
end;
$$;

-- 移除一樣食材（不區分用掉或丟掉）。已經移除的重複呼叫沒有影響。
create function public.remove_pantry_item(p_id uuid)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pantry_items;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  select * into v_row from public.pantry_items where id = p_id;
  if not found or not private.is_kitchen_member(v_row.kitchen_id) then
    raise exception 'pantry_item_not_found' using errcode = 'P0002';
  end if;
  if v_row.status = 'removed' then
    return v_row;
  end if;
  update public.pantry_items
    set status = 'removed', removed_at = now(), removed_by = (select auth.uid())
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

-- 復原最近移除的食材。如果同一種食材已經又被加回來，就併進現有那一筆
-- （保留較早的加入日期與較早的期限），被復原的那一筆維持移除。回傳現在「有」的那一筆。
create function public.restore_pantry_item(p_id uuid)
returns public.pantry_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pantry_items;
  v_active public.pantry_items;
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  select * into v_row from public.pantry_items where id = p_id;
  if not found or not private.is_kitchen_member(v_row.kitchen_id) then
    raise exception 'pantry_item_not_found' using errcode = 'P0002';
  end if;
  if v_row.status = 'active' then
    return v_row;
  end if;

  if v_row.ingredient_id is not null then
    select * into v_active from public.pantry_items
      where kitchen_id = v_row.kitchen_id and ingredient_id = v_row.ingredient_id and status = 'active';
    if found then
      update public.pantry_items set
        added_on = least(added_on, v_row.added_on),
        expires_at = case
          when v_row.expires_at is not null and (expires_at is null or v_row.expires_at < expires_at)
            then v_row.expires_at else expires_at end,
        date_type = case
          when v_row.expires_at is not null and (expires_at is null or v_row.expires_at < expires_at)
            then v_row.date_type else date_type end
        where id = v_active.id
        returning * into v_active;
      return v_active;
    end if;
  end if;

  update public.pantry_items
    set status = 'active', removed_at = null, removed_by = null, removed_with_recipe_id = null
    where id = p_id
    returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.add_pantry_items(uuid, jsonb) from public, anon;
revoke execute on function public.remove_pantry_item(uuid) from public, anon;
revoke execute on function public.restore_pantry_item(uuid) from public, anon;
grant execute on function public.add_pantry_items(uuid, jsonb) to authenticated;
grant execute on function public.remove_pantry_item(uuid) to authenticated;
grant execute on function public.restore_pantry_item(uuid) to authenticated;

-- 每日維護用：刪除移除超過 30 天的食材，回傳刪除幾筆。
-- 排程（pg_cron）在每日維護那一階段一起建，這裡只先備好函式。
create function private.purge_removed_pantry_items()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.pantry_items
    where status = 'removed' and removed_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.purge_removed_pantry_items() from public, anon, authenticated;
