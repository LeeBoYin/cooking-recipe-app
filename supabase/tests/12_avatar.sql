-- 大頭貼：Storage 路徑 users/{userId}/avatar/、photos 的讀取、set_avatar（16 第三、四節）
begin;
select plan(19);

create function tests.row_count(p_sql text)
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
grant execute on function tests.row_count(text) to authenticated;

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('mate@zhusha.test') as mate \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset
select tests.kitchen_of(:'owner') as k1 \gset
insert into public.kitchen_members (id, kitchen_id, user_id, role)
  values (private.uuid_v7(), :'k1', :'mate', 'member');

select private.uuid_v7() as a1 \gset
select private.uuid_v7() as a2 \gset
select private.uuid_v7() as a3 \gset

---------------------------------------------------------------------------
-- Storage：本人才能寫；路徑格式不對一律拒絕
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/avatar/%s.webp')$$, :'owner', :'a1'),
  '本人可以上傳自己的大頭貼');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/avatar/%s.webp')$$, :'stranger', :'a3'),
  '42501', null, '不能上傳到別人的大頭貼路徑');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/avatar/x.webp')$$, :'owner'),
  '42501', null, '大頭貼的檔名要是照片 ID');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/avatar/%s_thumb.webp')$$, :'owner', :'a3'),
  '42501', null, '大頭貼只有一個檔，不接受尺寸後綴');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/other/%s.webp')$$, :'owner', :'a3'),
  '42501', null, '子資料夾只開放 avatar');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('photos', 'users/%s/avatar/deep/%s.webp')$$, :'owner', :'a3'),
  '42501', null, '路徑層數不對拒絕');
select tests.logout();

---------------------------------------------------------------------------
-- set_avatar：檔案要已經在 Storage、只有本人
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select throws_ok(format($$select public.set_avatar('%s')$$, :'a2'),
  '23503', null, '檔案還沒上傳不能建立資料列');
select lives_ok(format($$select public.set_avatar('%s')$$, :'a1'), '設定大頭貼');
select is((select count(*)::int from public.photos where owner_type = 'avatar' and user_id = :'owner'), 1, '有一筆頭像資料列');
select is((select owner_id from public.photos where id = :'a1'), :'owner'::uuid, '頭像的擁有者是本人');
select throws_ok(format($$insert into public.photos (id, user_id, owner_type, owner_id, storage_path, feed_path, thumb_path, width, height)
  values ('%1$s', '%2$s', 'avatar', '%2$s', 'users/%2$s/avatar/%1$s.webp', 'users/%2$s/avatar/%1$s.webp', 'users/%2$s/avatar/%1$s.webp', 400, 400)$$, :'a1', :'owner'),
  '42501', null, '手機不能直接寫頭像資料列');
select tests.logout();

-- 換新的：舊的資料列一起刪
insert into storage.objects (bucket_id, name) values ('photos', format('users/%s/avatar/%s.webp', :'owner', :'a2'));
select tests.login_as(:'owner');
select lives_ok(format($$select public.set_avatar('%s')$$, :'a2'), '換新的大頭貼');
select is((select array_agg(id) from public.photos where owner_type = 'avatar'), array[:'a2'::uuid], '舊的資料列刪掉、每人一張');
select tests.logout();

-- 別人的路徑不能拿來設
select tests.login_as(:'stranger');
select throws_ok(format($$select public.set_avatar('%s')$$, :'a2'),
  '23503', null, '拿別人的檔案設不起來（路徑依自己的 ID 決定）');
select tests.logout();

---------------------------------------------------------------------------
-- 讀：本人與同廚房成員；外人不行
---------------------------------------------------------------------------
select tests.login_as(:'mate');
select is((select count(*)::int from public.photos where owner_type = 'avatar'), 1, '同廚房的成員讀得到資料列');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like 'users/%/avatar/%'), 2, '同廚房的成員讀得到檔案（舊檔還在，等孤兒掃描）');
select tests.logout();

select tests.login_as(:'stranger');
select is((select count(*)::int from public.photos where owner_type = 'avatar'), 0, '外人讀不到資料列');
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like 'users/%/avatar/%'), 0, '外人讀不到檔案');
select tests.logout();

-- 傳 null 拿掉大頭貼
select tests.login_as(:'owner');
select public.set_avatar(null);
select is((select count(*)::int from public.photos where owner_type = 'avatar'), 0, '傳 null 拿掉大頭貼');
select tests.logout();

select * from finish();
rollback;
