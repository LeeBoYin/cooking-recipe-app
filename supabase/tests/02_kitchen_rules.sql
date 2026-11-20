-- 廚房的一致性規則（04 ADR-17）：每人最多 5 個廚房、每廚房最多 10 人、至少一位管理者
begin;
select plan(3);

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.kitchen_of(:'owner') as owner_kitchen \gset

-- 每人最多 5 個廚房：再建 4 個人的廚房讓 owner 加入（共 5 個），第 6 個要擋下
do $$
declare
  v_owner uuid := (select user_id from public.user_identities where display_name = 'owner');
  i int;
begin
  for i in 1..4 loop
    insert into public.kitchen_members (id, kitchen_id, user_id, role)
      values (private.uuid_v7(), tests.kitchen_of(tests.create_user('k' || i || '@zhusha.test')), v_owner, 'member');
  end loop;
end;
$$;
select throws_ok(
  format('insert into public.kitchen_members (id, kitchen_id, user_id, role) values (%L, %L, %L, %L)',
    private.uuid_v7(), tests.kitchen_of(tests.create_user('k6@zhusha.test')), :'owner', 'member'),
  'P0001', 'too_many_kitchens', '每人最多 5 個廚房');

-- 每個廚房最多 10 人：owner 的廚房再加 9 人（共 10 人），第 11 人要擋下
do $$
declare
  v_kitchen uuid := tests.kitchen_of((select user_id from public.user_identities where display_name = 'owner'));
  i int;
begin
  for i in 1..9 loop
    insert into public.kitchen_members (id, kitchen_id, user_id, role)
      values (private.uuid_v7(), v_kitchen, tests.create_user('m' || i || '@zhusha.test', false), 'member');
  end loop;
end;
$$;
select throws_ok(
  format('insert into public.kitchen_members (id, kitchen_id, user_id, role) values (%L, %L, %L, %L)',
    private.uuid_v7(), :'owner_kitchen', tests.create_user('m10@zhusha.test', false), 'member'),
  'P0001', 'kitchen_full', '每個廚房最多 10 人');

-- 至少一位管理者：把唯一的管理者降級要擋下
set constraints all immediate;
select throws_ok(
  format('update public.kitchen_members set role = %L where kitchen_id = %L and user_id = %L', 'member', :'owner_kitchen', :'owner'),
  'P0001', 'kitchen_needs_admin', '廚房至少要有一位管理者');

select * from finish();
rollback;
