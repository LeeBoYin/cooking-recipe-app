-- 照片：私有 bucket、photos 表、Storage 存取規則（05 Photo、04 ADR-06）。
-- 這一版只開放廚具照片（廚房成員）；食譜、步驟、頭像、近況的 owner_type 先放進檢查，
-- 寫入與讀取規則等食譜表、好友關係建好後再補。
-- 擁有者：個人的照片記在 user_id（帳號刪除時連動）、廚具照片記在 kitchen_id（上傳的人刪除帳號時保留，
-- 所以上傳者另存在 created_by，刪除帳號時設為空）。

---------------------------------------------------------------------------
-- Storage：私有 bucket，只收 WebP
---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 路徑前綴決定誰能存取：users/{userId}/… 給本人；kitchens/{kitchenId}/… 給廚房成員。
-- 路徑不合格式（不是 UUID）一律拒絕，不讓轉型錯誤變成 500。
create function private.can_access_photo_path(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := split_part(p_name, '/', 1);
  v_id text := split_part(p_name, '/', 2);
begin
  if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or split_part(p_name, '/', 3) !~ '^[0-9a-f-]{36}(_feed|_thumb)?\.webp$'
     or split_part(p_name, '/', 4) <> '' then
    return false;
  end if;
  if p_write and not private.is_active_user() then
    return false;
  end if;
  if v_scope = 'users' then
    return v_id::uuid = (select auth.uid());
  elsif v_scope = 'kitchens' then
    return private.is_kitchen_member(v_id::uuid);
  end if;
  return false;
end;
$$;

revoke execute on function private.can_access_photo_path(text, boolean) from public;
grant execute on function private.can_access_photo_path(text, boolean) to authenticated;

create policy "照片：依路徑讀" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and private.can_access_photo_path(name, false));
create policy "照片：依路徑上傳" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and private.can_access_photo_path(name, true));
create policy "照片：依路徑覆寫" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and private.can_access_photo_path(name, true))
  with check (bucket_id = 'photos' and private.can_access_photo_path(name, true));
create policy "照片：依路徑刪除" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and private.can_access_photo_path(name, true));

---------------------------------------------------------------------------
-- photos 表
---------------------------------------------------------------------------

create table public.photos (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid references auth.users (id) on delete cascade,
  kitchen_id uuid references public.kitchens (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_type text not null check (owner_type in ('recipe', 'recipe_step', 'equipment', 'avatar', 'status')),
  -- 對應的食譜、步驟、廚具、使用者、近況（多種資料表，沒有外鍵；廚具由觸發器檢查）
  owner_id uuid not null,
  cook_note_id uuid,
  recipe_id uuid,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  -- 原圖（長邊 1600px）、動態圖（1080px）、縮圖（400px）；路徑由 id 與擁有者決定，不接受別的值
  storage_path text not null,
  feed_path text not null,
  thumb_path text not null,
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  taken_at timestamptz,
  -- 廚具照片屬於廚房，其他屬於個人
  check ((owner_type = 'equipment') = (kitchen_id is not null)),
  check ((kitchen_id is null) = (user_id is not null)),
  check (cook_note_id is null or owner_type = 'recipe'),
  check (recipe_id is null or owner_type = 'recipe_step'),
  check (
    storage_path = coalesce('kitchens/' || kitchen_id, 'users/' || user_id) || '/' || id || '.webp'
    and feed_path = coalesce('kitchens/' || kitchen_id, 'users/' || user_id) || '/' || id || '_feed.webp'
    and thumb_path = coalesce('kitchens/' || kitchen_id, 'users/' || user_id) || '/' || id || '_thumb.webp'
  )
);

create index photos_kitchen on public.photos (kitchen_id) where kitchen_id is not null;
create index photos_owner on public.photos (owner_type, owner_id);
-- 一件廚具一張照片（要換照片時先刪舊的）
create unique index photos_one_per_equipment on public.photos (owner_id) where owner_type = 'equipment';

create function private.photos_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    return new;
  end if;

  new.created_by := (select auth.uid());

  if new.owner_type = 'equipment' then
    if not exists (
      select 1 from public.kitchen_equipment e where e.id = new.owner_id and e.kitchen_id = new.kitchen_id
    ) then
      raise exception 'photo_owner_not_found' using errcode = '23503',
        hint = '廚具不存在，或不在這個廚房';
    end if;
  end if;

  -- 上傳完成才建立資料列：三個檔案都要已經在 Storage 裡
  foreach v_path in array array[new.storage_path, new.feed_path, new.thumb_path] loop
    if not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = v_path) then
      raise exception 'photo_file_missing: %', v_path using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

create trigger photos_before_write before insert or update on public.photos
  for each row execute function private.photos_before_write();

-- 廚具刪除時，照片資料列一起刪（檔案由維護工作清掉孤兒檔）
create function private.equipment_delete_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.photos where owner_type = 'equipment' and owner_id = old.id;
  return old;
end;
$$;

create trigger kitchen_equipment_delete_photos after delete on public.kitchen_equipment
  for each row execute function private.equipment_delete_photos();

---------------------------------------------------------------------------
-- 權限（RLS）：廚具照片給廚房成員；個人照片給本人讀（寫入等食譜、頭像功能建好再開）
---------------------------------------------------------------------------

alter table public.photos enable row level security;

revoke all on public.photos from anon, authenticated;
grant select, delete on public.photos to authenticated;
grant insert (
  id, kitchen_id, owner_type, owner_id, sort_order, is_cover,
  storage_path, feed_path, thumb_path, width, height, taken_at
) on public.photos to authenticated;
grant update (sort_order, is_cover) on public.photos to authenticated;

create policy "讀照片" on public.photos
  for select to authenticated
  using (
    (kitchen_id is not null and private.is_kitchen_member(kitchen_id))
    or user_id = (select auth.uid())
  );
create policy "成員可以新增廚具照片" on public.photos
  for insert to authenticated
  with check (
    owner_type = 'equipment' and kitchen_id is not null
    and private.is_kitchen_member(kitchen_id) and private.is_active_user()
  );
create policy "成員可以改廚具照片" on public.photos
  for update to authenticated
  using (owner_type = 'equipment' and private.is_kitchen_member(kitchen_id))
  with check (owner_type = 'equipment' and private.is_kitchen_member(kitchen_id) and private.is_active_user());
create policy "成員可以刪廚具照片" on public.photos
  for delete to authenticated
  using (owner_type = 'equipment' and private.is_kitchen_member(kitchen_id) and private.is_active_user());

alter publication supabase_realtime add table public.photos;
