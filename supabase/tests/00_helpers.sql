-- 測試共用的輔助函式，放在 tests schema。
-- 這個檔案不復原（不包在 rollback 的交易裡），後面的測試檔才用得到；其他測試檔都在自己的交易裡執行並復原。
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to authenticated;

-- 建立一個使用者並跑註冊流程，回傳 user_id
create or replace function tests.create_user(p_email text, p_create_kitchen boolean default true)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := private.uuid_v7();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, '{}', '{}', now(), now());
  perform public.setup_new_user(v_id, split_part(p_email, '@', 1), p_create_kitchen);
  return v_id;
end;
$$;

-- 用某個使用者的身分執行後面的查詢（交易結束時自動恢復）
create or replace function tests.login_as(p_user_id uuid, p_aal text default 'aal1')
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.logout()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- 使用者自己的廚房（他是管理者的那一個）。同一個交易裡 joined_at 都一樣，不能只靠時間排序
create or replace function tests.kitchen_of(p_user_id uuid)
returns uuid
language sql
security definer
as $$
  select kitchen_id from public.kitchen_members
  where user_id = p_user_id and left_at is null
  order by (role = 'admin') desc, joined_at, id
  limit 1;
$$;

grant execute on all functions in schema tests to authenticated;

select plan(1);
select ok(true, '測試輔助函式就緒');
select * from finish();
