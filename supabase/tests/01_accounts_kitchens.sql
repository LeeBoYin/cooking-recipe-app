-- 帳號與廚房的權限測試（16 第四節）
begin;
select plan(31);

-- 準備：三個使用者，alice、bob 有自己的廚房，carol 沒有
select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select tests.create_user('carol@zhusha.test', false) as carol \gset
select tests.kitchen_of(:'alice') as alice_kitchen \gset
select tests.kitchen_of(:'bob') as bob_kitchen \gset

---------------------------------------------------------------------------
-- 註冊時建立的資料
---------------------------------------------------------------------------
select is((select count(*)::int from public.user_profiles where user_id = :'alice' and status = 'active'), 1, '註冊後帳號是啟用中');
select is((select display_name from public.user_identities where user_id = :'alice'), 'alice', '註冊後有暱稱');
select is((select current_kitchen_id from public.user_settings where user_id = :'alice'), :'alice_kitchen'::uuid, '目前所在的廚房是自己的廚房');
select is((select role from public.kitchen_members where user_id = :'alice'), 'admin', '自己的廚房，自己是管理者');
select ok(private.is_uuid_v7(:'alice_kitchen'), '後端產生的 ID 是 UUID v7');
select is(public.setup_new_user(:'alice'), :'alice_kitchen'::uuid, '重複呼叫回傳同一個廚房');
select is((select count(*)::int from public.kitchen_members where user_id = :'alice'), 1, '重複呼叫不會多一個廚房');
select is((select count(*)::int from public.kitchen_members where user_id = :'carol'), 0, '不建廚房的選項（加入家人的廚房時用）');

---------------------------------------------------------------------------
-- 只看得到自己的、自己廚房的
---------------------------------------------------------------------------
select tests.login_as(:'alice');

select is((select count(*)::int from public.kitchens), 1, '只看得到自己所在的廚房');
select is((select count(*)::int from public.user_settings), 1, '只看得到自己的設定');
select is((select count(*)::int from public.user_identities where user_id = :'bob'), 0, '看不到不相關的人的暱稱');
select throws_ok('select * from public.user_profiles', '42501', null, '帳號狀態不開放給 App');

---------------------------------------------------------------------------
-- 能改的、不能改的
---------------------------------------------------------------------------
update public.user_identities set display_name = '愛麗絲' where user_id = :'alice';
update public.user_identities set display_name = '被改了' where user_id = :'bob';
update public.kitchens set name = '我家廚房' where id = :'alice_kitchen';
update public.kitchens set name = '被改了' where id = :'bob_kitchen';
update public.kitchen_members set expiry_alerts = false where user_id = :'alice';

select is((select display_name from public.user_identities where user_id = :'alice'), '愛麗絲', '可以改自己的暱稱');
select is((select name from public.kitchens where id = :'alice_kitchen'), '我家廚房', '管理者可以改廚房名稱');
select is((select expiry_alerts from public.kitchen_members where user_id = :'alice'), false, '可以改自己的提醒設定');

select throws_ok(format('insert into public.kitchens (id, name, timezone, region) values (%L, %L, %L, %L)', private.uuid_v7(), '偷建', 'Asia/Taipei', 'TW'), '42501', null, '不能直接建立廚房');
select throws_ok(format('update public.kitchens set created_by = %L where id = %L', :'bob', :'alice_kitchen'), '42501', null, '不能改廚房的建立者');
select throws_ok(format('update public.kitchen_members set role = %L where user_id = %L', 'member', :'alice'), '42501', null, '不能直接改角色');
select throws_ok(format('update public.user_settings set current_kitchen_id = %L', :'bob_kitchen'), '42501', null, '不能直接改目前所在的廚房');
select throws_ok(format('select public.set_current_kitchen(%L)', :'bob_kitchen'), '42501', null, '不能切換到別人的廚房');
select throws_ok(format('select public.setup_new_user(%L)', :'carol'), '42501', null, 'App 不能呼叫註冊流程');
select throws_ok(format('update public.kitchens set timezone = %L where id = %L', 'Mars/Olympus', :'alice_kitchen'), '22023', null, '時區要是有效的 IANA 時區');

select tests.logout();
select is((select name from public.kitchens where id = :'bob_kitchen'), '我家', '改不到別人的廚房');
select is((select display_name from public.user_identities where user_id = :'bob'), 'bob', '改不到別人的暱稱');

---------------------------------------------------------------------------
-- 同一個廚房的家人（M2 的加入流程完成前，先直接加成員來測）
---------------------------------------------------------------------------
insert into public.kitchen_members (id, kitchen_id, user_id, role)
  values (private.uuid_v7(), :'alice_kitchen', :'bob', 'member');

select tests.login_as(:'bob');
select is((select count(*)::int from public.kitchens), 2, '加入後看得到家人的廚房');
select is((select display_name from public.user_identities where user_id = :'alice'), '愛麗絲', '看得到家人的暱稱');
select lives_ok(format('select public.set_current_kitchen(%L)', :'alice_kitchen'), '可以切換到加入的廚房');
update public.kitchens set name = '成員改的' where id = :'alice_kitchen';
select tests.logout();
select is((select name from public.kitchens where id = :'alice_kitchen'), '我家廚房', '一般成員不能改廚房設定');

-- bob 離開後
update public.kitchen_members set left_at = now() where kitchen_id = :'alice_kitchen' and user_id = :'bob';
select tests.login_as(:'bob');
select is((select count(*)::int from public.kitchens where id = :'alice_kitchen'), 0, '離開後立即看不到那個廚房');
select tests.login_as(:'alice');
select is((select count(*)::int from public.user_identities where user_id = :'bob'), 1, '還看得到前成員的暱稱（顯示誰加的食材）');
select tests.logout();

---------------------------------------------------------------------------
-- 停用的帳號不能寫入
---------------------------------------------------------------------------
update public.user_profiles set status = 'suspended' where user_id = :'alice';
select tests.login_as(:'alice');
select throws_ok(format('update public.user_identities set display_name = %L where user_id = %L', '停用後', :'alice'), '42501', null, '停用的帳號不能改資料');
select tests.logout();

select * from finish();
rollback;
