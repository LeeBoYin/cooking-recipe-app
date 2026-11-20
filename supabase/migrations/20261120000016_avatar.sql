-- 大頭貼：Storage 路徑 users/{userId}/avatar/{照片ID}.webp、photos 的頭像讀取規則、set_avatar。
-- 頭像只存 400px 一種尺寸：storage_path、feed_path、thumb_path 三個欄位指向同一個檔案。
-- 資料列只經 set_avatar 建立（手機不能直接寫）；每人一張，換新的就刪掉舊的資料列，舊檔交給每週的孤兒照片檔掃描。

---------------------------------------------------------------------------
-- photos：路徑檢查加入頭像、每人一張
---------------------------------------------------------------------------

do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.photos'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%_feed.webp%';
  execute format('alter table public.photos drop constraint %I', v_name);
end;
$$;

alter table public.photos add constraint photos_paths_match check (
  case when owner_type = 'avatar' then
    owner_id = user_id
    and storage_path = 'users/' || user_id || '/avatar/' || id || '.webp'
    and feed_path = storage_path
    and thumb_path = storage_path
  else
    storage_path = coalesce('kitchens/' || kitchen_id, 'users/' || user_id) || '/' || id || '.webp'
    and feed_path = coalesce('kitchens/' || kitchen_id, 'users/' || user_id) || '/' || id || '_feed.webp'
    and thumb_path = coalesce('kitchens/' || kitchen_id, 'users/' || user_id) || '/' || id || '_thumb.webp'
  end
);

create unique index photos_one_per_avatar on public.photos (owner_id) where owner_type = 'avatar';

-- 頭像：同廚房的成員讀得到（好友在 M2 加上）
create policy "同廚房的成員可以讀頭像" on public.photos
  for select to authenticated
  using (owner_type = 'avatar' and private.shares_kitchen(user_id, (select auth.uid())));

---------------------------------------------------------------------------
-- 觸發器：頭像的檔案只有一個，要已經在 Storage 裡
-- （其他類型維持原樣；頭像的三個路徑相同，原本的逐一檢查本來就涵蓋）
---------------------------------------------------------------------------

create or replace function private.photos_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_recipe_id uuid;
  v_recipe public.recipes;
  v_limits jsonb;
  v_count integer;
  v_limit integer;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    return new;
  end if;

  new.created_by := (select auth.uid());

  if new.owner_type = 'avatar' then
    null;  -- 擁有者與路徑由 photos_paths_match 檢查
  elsif new.owner_type = 'equipment' then
    if not exists (
      select 1 from public.kitchen_equipment e where e.id = new.owner_id and e.kitchen_id = new.kitchen_id
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503',
        hint = '廚具不存在，或不在這個廚房';
    end if;
  elsif new.owner_type in ('recipe', 'recipe_step') then
    v_recipe_id := case when new.owner_type = 'recipe' then new.owner_id else new.recipe_id end;
    select * into v_recipe from public.recipes r
      where r.id = v_recipe_id and r.user_id = new.user_id and r.deleted_at is null
      for update;
    if not found then
      raise exception 'photo_owner_not_found' using errcode = '23503',
        hint = '食譜不存在，或已經刪除';
    end if;
    if new.owner_type = 'recipe_step' and not exists (
      select 1 from jsonb_array_elements(v_recipe.steps) s where s->>'id' = new.owner_id::text
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503', hint = '步驟不存在';
    end if;
    if new.cook_note_id is not null and not exists (
      select 1 from jsonb_array_elements(v_recipe.cook_notes) n where n->>'id' = new.cook_note_id::text
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503', hint = '又做了一次的記錄不存在';
    end if;

    select photo_limits into v_limits from public.app_config;
    if new.cook_note_id is not null then
      v_limit := (v_limits->>'per_cook_note')::int;
      select count(*) into v_count from public.photos p
        where p.owner_type = 'recipe' and p.owner_id = v_recipe_id and p.cook_note_id = new.cook_note_id;
    elsif new.owner_type = 'recipe_step' then
      v_limit := (v_limits->>'per_step')::int;
      select count(*) into v_count from public.photos p
        where p.owner_type = 'recipe_step' and p.recipe_id = v_recipe_id and p.owner_id = new.owner_id;
    else
      v_limit := (v_limits->>'per_recipe')::int;
      select count(*) into v_count from public.photos p
        where p.owner_type = 'recipe' and p.owner_id = v_recipe_id and p.cook_note_id is null;
    end if;
    if v_count >= v_limit then
      raise exception 'photo_limit_reached' using errcode = '54000',
        hint = format('最多 %s 張', v_limit);
    end if;
  end if;

  -- 上傳完成才建立資料列：檔案都要已經在 Storage 裡
  foreach v_path in array array[new.storage_path, new.feed_path, new.thumb_path] loop
    if not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = v_path) then
      raise exception 'photo_file_missing: %', v_path using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

---------------------------------------------------------------------------
-- Storage：users/{userId}/avatar/{照片ID}.webp。寫入只有本人；
-- 讀取：本人、同廚房的成員。路徑格式不對一律拒絕
---------------------------------------------------------------------------

create or replace function private.can_access_photo_path(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := split_part(p_name, '/', 1);
  v_id text := split_part(p_name, '/', 2);
  v_third text := split_part(p_name, '/', 3);
  v_file text;
  v_is_avatar boolean := (v_scope = 'users' and v_third = 'avatar');
begin
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if v_is_avatar then
    -- users/{userId}/avatar/{照片ID}.webp：只有一個尺寸，沒有後綴
    v_file := split_part(p_name, '/', 4);
    if v_file !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
       or split_part(p_name, '/', 5) <> '' then
      return false;
    end if;
  else
    v_file := v_third;
    if v_file !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_feed|_thumb)?\.webp$'
       or split_part(p_name, '/', 4) <> '' then
      return false;
    end if;
  end if;
  if p_write and not private.is_active_user() then
    return false;
  end if;
  if v_scope = 'users' then
    if v_id::uuid = (select auth.uid()) then
      return true;
    end if;
    if p_write then
      return false;
    end if;
    if v_is_avatar then
      return private.shares_kitchen(v_id::uuid, (select auth.uid()));
    end if;
    return exists (
      select 1 from public.photos p
      where p.id = substr(v_file, 1, 36)::uuid
        and p.user_id = v_id::uuid
        and (
          (p.owner_type = 'recipe' and private.can_view_recipe((select auth.uid()), p.owner_id))
          or (p.owner_type = 'recipe_step' and private.can_view_recipe((select auth.uid()), p.recipe_id))
        )
    );
  elsif v_scope = 'kitchens' then
    return private.is_kitchen_member(v_id::uuid);
  end if;
  return false;
end;
$$;

---------------------------------------------------------------------------
-- set_avatar：換大頭貼。400px 的檔案要已經在 users/{userId}/avatar/ 底下才建立資料列；
-- 同一個交易刪掉舊的資料列（檔案由孤兒檔清理處理）。傳 null 代表拿掉大頭貼
---------------------------------------------------------------------------

create function public.set_avatar(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_path text;
begin
  if v_user is null or not private.is_active_user() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.photos where owner_type = 'avatar' and user_id = v_user;
  if p_photo_id is null then
    return;
  end if;

  v_path := 'users/' || v_user || '/avatar/' || p_photo_id || '.webp';
  insert into public.photos (
    id, user_id, owner_type, owner_id, sort_order, storage_path, feed_path, thumb_path, width, height
  ) values (
    p_photo_id, v_user, 'avatar', v_user, 0, v_path, v_path, v_path, 400, 400
  );
end;
$$;

revoke execute on function public.set_avatar(uuid) from public, anon;
grant execute on function public.set_avatar(uuid) to authenticated;
