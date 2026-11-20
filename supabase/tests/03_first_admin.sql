-- 第一個帳號的初始化
begin;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', private.uuid_v7(), 'authenticated', 'authenticated', 'Owner@Zhusha.test', '{}', '{}', now(), now());

select isnt(private.init_first_admin('  owner@zhusha.test '), null, '建立自己的廚房（email 不分大小寫、忽略空白）');
select is((select p.role from public.user_profiles p join auth.users u on u.id = p.user_id where u.email = 'Owner@Zhusha.test'), 'system_admin', '設為系統管理員');
select is((select count(*)::int from public.kitchen_members m join auth.users u on u.id = m.user_id where u.email = 'Owner@Zhusha.test'), 1, '有一個自己的廚房');
select lives_ok($$select private.init_first_admin('owner@zhusha.test')$$, '重複執行不會出錯');
select throws_ok($$select private.init_first_admin('nobody@zhusha.test')$$, 'P0002', null, '帳號不存在時說明要先建立');

select * from finish();
rollback;
