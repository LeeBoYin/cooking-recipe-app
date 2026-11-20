-- 帳號與廚房（05 Kitchen、KitchenMember、UserIdentity、UserSettings、UserProfile；16 第三、四、七、八節）
-- 刪除帳號時，「誰建立的」這類欄位改成空值，畫面顯示「已刪除的使用者」。

---------------------------------------------------------------------------
-- 資料表
---------------------------------------------------------------------------

-- 帳號狀態，只有後端讀寫
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'system_admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  ai_paused boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 公開身分：暱稱只存在這裡
create table public.user_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '我' check (char_length(btrim(display_name)) between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kitchens (
  id uuid primary key check (private.is_uuid_v7(id)),
  name text not null check (char_length(btrim(name)) between 1 and 20),
  timezone text not null,
  region text not null check (region ~ '^[A-Z]{2}$'),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 每一段成員關係一筆；離開後再加入會新增一筆，保留歷史
create table public.kitchen_members (
  id uuid primary key check (private.is_uuid_v7(id)),
  kitchen_id uuid not null references public.kitchens (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  share_dietary_info boolean not null default true,
  expiry_alerts boolean not null default true,
  default_diners_all boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index kitchen_members_one_active
  on public.kitchen_members (kitchen_id, user_id)
  where left_at is null;
create index kitchen_members_user_active
  on public.kitchen_members (user_id)
  where left_at is null;

-- 個人設定。05 的巢狀物件（units、notifications、onboarding）在這裡攤平成欄位
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'zh-TW' check (locale in ('zh-TW')),
  chef_persona text not null default 'warm' check (chef_persona in ('warm', 'coach', 'punny', 'minimal')),
  current_kitchen_id uuid references public.kitchens (id) on delete set null,
  household_size smallint not null default 2 check (household_size between 1 and 20),
  temperature_unit text not null default 'C' check (temperature_unit in ('C', 'F', 'C+F', 'F+C')),
  measure_unit text not null default 'metric' check (measure_unit in ('metric', 'us', 'metric+us', 'us+metric')),
  expiring_alert boolean not null default true,
  alert_time time not null default '17:00',
  weekend_inspiration boolean not null default false,
  sound boolean not null default true,
  haptics boolean not null default true,
  analytics_opt_out boolean not null default false,
  onboarding_completed_steps text[] not null default '{}',
  onboarding_completed_at timestamptz,
  seen_hints text[] not null default '{}',
  last_survey_shown_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

---------------------------------------------------------------------------
-- 權限用的判斷（SECURITY DEFINER，避免權限規則互相遞迴）
---------------------------------------------------------------------------

-- 目前登入的人是啟用中的帳號
create function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;

-- 目前登入的人是這個廚房的成員（還沒離開，廚房也沒刪除）
create function private.is_kitchen_member(p_kitchen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kitchen_members m
    join public.kitchens k on k.id = m.kitchen_id
    where m.kitchen_id = p_kitchen_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and k.deleted_at is null
  );
$$;

create function private.is_kitchen_admin(p_kitchen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kitchen_members m
    join public.kitchens k on k.id = m.kitchen_id
    where m.kitchen_id = p_kitchen_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
      and m.left_at is null
      and k.deleted_at is null
  );
$$;

-- 兩人現在同屬任一個廚房（「家人」）
create function private.shares_kitchen(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kitchen_members ma
    join public.kitchen_members mb on mb.kitchen_id = ma.kitchen_id
    join public.kitchens k on k.id = ma.kitchen_id
    where ma.user_id = a and ma.left_at is null
      and mb.user_id = b and mb.left_at is null
      and k.deleted_at is null
  );
$$;

-- 看得到某人的暱稱：本人；或我所在的廚房裡，他是成員或前成員（顯示誰加的食材）。好友在 M2 加上
create function private.can_see_identity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or exists (
      select 1
      from public.kitchen_members mine
      join public.kitchen_members theirs on theirs.kitchen_id = mine.kitchen_id
      join public.kitchens k on k.id = mine.kitchen_id
      where mine.user_id = (select auth.uid()) and mine.left_at is null
        and theirs.user_id = p_user_id
        and k.deleted_at is null
    );
$$;

grant execute on function
  private.is_active_user(),
  private.is_kitchen_member(uuid),
  private.is_kitchen_admin(uuid),
  private.shares_kitchen(uuid, uuid),
  private.can_see_identity(uuid)
to authenticated, service_role;

---------------------------------------------------------------------------
-- 觸發器
---------------------------------------------------------------------------

create trigger set_timestamps before update on public.user_profiles
  for each row execute function private.set_timestamps();
create trigger set_timestamps before update on public.user_identities
  for each row execute function private.set_timestamps();
create trigger set_timestamps before update on public.user_settings
  for each row execute function private.set_timestamps();
create trigger set_timestamps before update on public.kitchens
  for each row execute function private.set_timestamps();
create trigger set_updated_at before update on public.kitchen_members
  for each row execute function private.set_updated_at();

-- 廚房：時區要是有效的 IANA 時區；記下最後修改的人
create function private.check_kitchen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.updated_by := coalesce((select auth.uid()), old.updated_by);
  end if;
  return new;
end;
$$;

create trigger check_kitchen before insert or update on public.kitchens
  for each row execute function private.check_kitchen();

-- 成員：每人最多 5 個廚房、每個廚房最多 10 人
create function private.check_member_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.left_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.left_at is null then
    return new;
  end if;
  if (select count(*) from public.kitchen_members
      where user_id = new.user_id and left_at is null and id <> new.id) >= 5 then
    raise exception 'too_many_kitchens' using errcode = 'P0001';
  end if;
  if (select count(*) from public.kitchen_members
      where kitchen_id = new.kitchen_id and left_at is null and id <> new.id) >= 10 then
    raise exception 'kitchen_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_member_limits before insert or update on public.kitchen_members
  for each row execute function private.check_member_limits();

-- 成員：還有人的廚房至少要有一位管理者
create function private.check_kitchen_has_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kitchen_id uuid := coalesce(new.kitchen_id, old.kitchen_id);
begin
  if exists (select 1 from public.kitchen_members where kitchen_id = v_kitchen_id and left_at is null)
     and not exists (
       select 1 from public.kitchen_members
       where kitchen_id = v_kitchen_id and left_at is null and role = 'admin'
     ) then
    raise exception 'kitchen_needs_admin' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger check_kitchen_has_admin
  after insert or update or delete on public.kitchen_members
  deferrable initially deferred
  for each row execute function private.check_kitchen_has_admin();

-- 設定：目前所在的廚房必須是自己還在的廚房
create function private.check_current_kitchen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_kitchen_id is not null
     and new.current_kitchen_id is distinct from old.current_kitchen_id
     and not exists (
       select 1 from public.kitchen_members
       where kitchen_id = new.current_kitchen_id and user_id = new.user_id and left_at is null
     ) then
    raise exception 'not_a_kitchen_member' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_current_kitchen before update on public.user_settings
  for each row execute function private.check_current_kitchen();

---------------------------------------------------------------------------
-- 權限（RLS）與欄位授權
---------------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.user_identities enable row level security;
alter table public.kitchens enable row level security;
alter table public.kitchen_members enable row level security;
alter table public.user_settings enable row level security;

-- 帳號狀態只有後端（service_role）讀寫，不開放給 API 角色
revoke all on public.user_profiles from anon, authenticated;

-- 暱稱：本人、同廚房的人讀；本人改
revoke all on public.user_identities from anon, authenticated;
grant select on public.user_identities to authenticated;
grant update (display_name) on public.user_identities to authenticated;

create policy "看得到的人可以讀暱稱" on public.user_identities
  for select to authenticated
  using (private.can_see_identity(user_id));
create policy "本人改自己的暱稱" on public.user_identities
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_active_user());

-- 廚房：成員讀；管理者改名稱、時區、地區；新增與刪除只經資料庫函式
revoke all on public.kitchens from anon, authenticated;
grant select on public.kitchens to authenticated;
grant update (name, timezone, region) on public.kitchens to authenticated;

create policy "成員可以讀廚房" on public.kitchens
  for select to authenticated
  using (private.is_kitchen_member(id));
create policy "管理者可以改廚房設定" on public.kitchens
  for update to authenticated
  using (private.is_kitchen_admin(id))
  with check (private.is_kitchen_admin(id) and private.is_active_user());

-- 成員名單：同廚房的人讀（含前成員的紀錄）；本人改自己的提醒與分享設定；加入、離開、改角色只經資料庫函式
revoke all on public.kitchen_members from anon, authenticated;
grant select on public.kitchen_members to authenticated;
grant update (share_dietary_info, expiry_alerts, default_diners_all) on public.kitchen_members to authenticated;

create policy "同廚房的人可以讀成員名單" on public.kitchen_members
  for select to authenticated
  using (private.is_kitchen_member(kitchen_id));
create policy "本人改自己的成員設定" on public.kitchen_members
  for update to authenticated
  using (user_id = (select auth.uid()) and left_at is null)
  with check (user_id = (select auth.uid()) and private.is_active_user());

-- 設定：只有本人；目前所在的廚房經 set_current_kitchen 切換
revoke all on public.user_settings from anon, authenticated;
grant select on public.user_settings to authenticated;
grant update (
  locale, chef_persona, household_size, temperature_unit, measure_unit,
  expiring_alert, alert_time, weekend_inspiration, sound, haptics, analytics_opt_out,
  onboarding_completed_steps, onboarding_completed_at, seen_hints
) on public.user_settings to authenticated;

create policy "本人讀自己的設定" on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "本人改自己的設定" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_active_user());

---------------------------------------------------------------------------
-- 資料庫函式
---------------------------------------------------------------------------

-- 註冊時建立的資料（16 第八節）。只給後端呼叫：M0 的初始化腳本、M1a 起的 accept-invite。
-- 回傳建立的廚房 ID（沒有建廚房時回傳 null）。重複呼叫不會產生第二份。
create function public.setup_new_user(
  p_user_id uuid,
  p_display_name text default '我',
  p_create_kitchen boolean default true,
  p_kitchen_name text default '我家',
  p_timezone text default 'Asia/Taipei',
  p_region text default 'TW'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kitchen_id uuid;
begin
  insert into public.user_profiles (user_id) values (p_user_id) on conflict do nothing;
  insert into public.user_identities (user_id, display_name)
    values (p_user_id, coalesce(nullif(btrim(p_display_name), ''), '我'))
    on conflict do nothing;
  insert into public.user_settings (user_id) values (p_user_id) on conflict do nothing;

  select kitchen_id into v_kitchen_id
  from public.kitchen_members
  where user_id = p_user_id and left_at is null
  order by joined_at
  limit 1;

  if v_kitchen_id is null and p_create_kitchen then
    v_kitchen_id := private.uuid_v7();
    insert into public.kitchens (id, name, timezone, region, created_by, updated_by)
      values (v_kitchen_id, p_kitchen_name, p_timezone, p_region, p_user_id, p_user_id);
    insert into public.kitchen_members (id, kitchen_id, user_id, role)
      values (private.uuid_v7(), v_kitchen_id, p_user_id, 'admin');
  end if;

  update public.user_settings
    set current_kitchen_id = v_kitchen_id
    where user_id = p_user_id and current_kitchen_id is null and v_kitchen_id is not null;

  return v_kitchen_id;
end;
$$;

revoke execute on function public.setup_new_user(uuid, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.setup_new_user(uuid, text, boolean, text, text, text) to service_role;

-- 切換目前所在的廚房
create function public.set_current_kitchen(p_kitchen_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if not private.is_kitchen_member(p_kitchen_id) then
    raise exception 'not_a_kitchen_member' using errcode = '42501';
  end if;
  update public.user_settings
    set current_kitchen_id = p_kitchen_id
    where user_id = (select auth.uid());
end;
$$;

revoke execute on function public.set_current_kitchen(uuid) from public, anon;
grant execute on function public.set_current_kitchen(uuid) to authenticated;
