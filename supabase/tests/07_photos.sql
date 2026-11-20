-- 照片：Storage 依路徑的存取、photos 表的權限與限制、廚具刪除時一起清掉（16 第三、四節）
begin;
select plan(23);

create function tests.updated_rows(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function tests.updated_rows(text) to authenticated;

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('mate@zhusha.test') as mate \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select tests.kitchen_of(:'owner') as k1 \gset
select tests.kitchen_of(:'stranger') as k2 \gset
insert into public.kitchen_members (id, kitchen_id, user_id, role)
  values (private.uuid_v7(), :'k1', :'mate', 'member');

select private.uuid_v7() as eq1 \gset
select private.uuid_v7() as eq2 \gset
select private.uuid_v7() as p1 \gset
select private.uuid_v7() as p2 \gset
select private.uuid_v7() as p3 \gset
select private.uuid_v7() as p4 \gset
insert into public.kitchen_equipment (id, kitchen_id, raw_name) values (:'eq1', :'k1', '電鍋'), (:'eq2', :'k1', '平底鍋');

---------------------------------------------------------------------------
-- Storage：依路徑前綴
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'kitchens/%s/%s.webp')$$, :'k1', :'p1'),
  '成員可以上傳到自己廚房的路徑');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'kitchens/%s/%s.webp')$$, :'k2', :'p2'),
  '42501', null, '不能上傳到別人廚房的路徑');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/%s.webp')$$, :'stranger', :'p2'),
  '42501', null, '不能上傳到別人的個人路徑');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/%s.webp')$$, :'owner', :'p2'),
  '可以上傳到自己的個人路徑');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('photos', 'kitchens/not-a-uuid/x.webp')$$,
  '42501', null, '路徑格式不對一律拒絕');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'kitchens/%s/%s.jpg')$$, :'k1', :'p3'),
  '42501', null, '不是 .webp 的檔名拒絕');
select tests.logout();

select tests.login_as(:'mate');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like 'kitchens/%'), 1, '同廚房的成員讀得到');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like 'users/%'), 0, '看不到別人的個人檔案');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from storage.objects where bucket_id = 'photos'), 0, '外人讀不到');
select tests.logout();

-- 補齊另外兩個尺寸（用超級使用者，模擬上傳完成）
insert into storage.objects (bucket_id, name) values
  ('photos', format('kitchens/%s/%s_feed.webp', :'k1', :'p1')),
  ('photos', format('kitchens/%s/%s_thumb.webp', :'k1', :'p1')),
  ('photos', format('kitchens/%s/%s.webp', :'k1', :'p3')),
  ('photos', format('kitchens/%s/%s_feed.webp', :'k1', :'p3')),
  ('photos', format('kitchens/%s/%s_thumb.webp', :'k1', :'p3')),
  ('photos', format('kitchens/%s/other.webp', :'k1'));

---------------------------------------------------------------------------
-- photos 表
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select lives_ok(format(
  $$insert into public.photos (id, kitchen_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
    values ('%1$s', '%2$s', 'equipment', '%3$s', 'kitchens/%2$s/%1$s.webp', 'kitchens/%2$s/%1$s_feed.webp', 'kitchens/%2$s/%1$s_thumb.webp', 1200, 1200)$$,
  :'p1', :'k1', :'eq1'), '成員可以建立廚具照片');
select is((select created_by from public.photos where id = :'p1'), :'owner'::uuid, '由資料庫記下上傳的人');

select throws_ok(format(
  $$insert into public.photos (id, kitchen_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
    values ('%1$s', '%2$s', 'equipment', '%3$s', 'kitchens/%2$s/%1$s.webp', 'kitchens/%2$s/%1$s_feed.webp', 'kitchens/%2$s/%1$s_thumb.webp', 1200, 1200)$$,
  :'p4', :'k1', :'eq2'), '23503', null, '檔案還沒上傳完不能建立資料列');
select throws_ok(format(
  $$insert into public.photos (id, kitchen_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
    values ('%1$s', '%2$s', 'equipment', '%3$s', 'kitchens/%2$s/other.webp', 'kitchens/%2$s/%1$s_feed.webp', 'kitchens/%2$s/%1$s_thumb.webp', 1200, 1200)$$,
  :'p3', :'k1', :'eq2'), '23514', null, '路徑要符合 ID 與擁有者');
select throws_ok(format(
  $$insert into public.photos (id, kitchen_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
    values ('%1$s', '%2$s', 'equipment', '%3$s', 'kitchens/%2$s/%1$s.webp', 'kitchens/%2$s/%1$s_feed.webp', 'kitchens/%2$s/%1$s_thumb.webp', 1200, 1200)$$,
  :'p3', :'k1', :'eq1'), '23505', null, '一件廚具只能有一張照片');
select throws_ok(format(
  $$insert into public.photos (id, kitchen_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
    values ('%1$s', '%2$s', 'recipe', '%3$s', 'kitchens/%2$s/%1$s.webp', 'kitchens/%2$s/%1$s_feed.webp', 'kitchens/%2$s/%1$s_thumb.webp', 1200, 1200)$$,
  :'p3', :'k1', :'eq2'), '23503', null, '食譜照片要掛在自己的食譜上（食譜的照片另外在 08_recipes 測）');
select tests.logout();

-- 另一個廚房的廚具，不能掛照片
select tests.login_as(:'stranger');
select is((select count(*)::int from public.photos), 0, '外人看不到別的廚房的照片');
select throws_ok(format(
  $$insert into public.photos (id, kitchen_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
    values ('%1$s', '%2$s', 'equipment', '%3$s', 'kitchens/%2$s/%1$s.webp', 'kitchens/%2$s/%1$s_feed.webp', 'kitchens/%2$s/%1$s_thumb.webp', 1200, 1200)$$,
  :'p3', :'k1', :'eq2'), '42501', null, '外人不能對別人的廚具建立照片');
select is(tests.updated_rows(format($$delete from public.photos where id = '%s'$$, :'p1')), 0, '外人刪不掉');
select tests.logout();

select tests.login_as(:'mate');
select is((select count(*)::int from public.photos), 1, '同廚房的成員看得到');
select throws_ok(format($$update public.photos set storage_path = 'x' where id = '%s'$$, :'p1'),
  '42501', null, '不能改路徑');
select tests.logout();

---------------------------------------------------------------------------
-- 廚具刪除時照片資料列一起刪；停用帳號不能上傳
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select is(tests.updated_rows(format($$delete from public.kitchen_equipment where id = '%s'$$, :'eq1')), 1, '刪除廚具');
select is((select count(*)::int from public.photos), 0, '照片資料列跟著刪掉');
select tests.logout();

update public.user_profiles set status = 'suspended' where user_id = :'owner';
select tests.login_as(:'owner');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'kitchens/%s/%s.webp')$$, :'k1', :'p3'),
  '42501', null, '停用的帳號不能上傳');
select tests.logout();

select * from finish();
rollback;
