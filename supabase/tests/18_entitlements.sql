-- 方案（entitlements）與 AI 設定：RLS、註冊時建立、後台調整、ai_get_context
begin;
select plan(26);

select tests.create_user('admin@zhusha.test');
select tests.create_user('a@zhusha.test');
select tests.create_user('b@zhusha.test');
update public.user_profiles set role = 'system_admin' where user_id = (select id from auth.users where email = 'admin@zhusha.test');
create temp table u as select
  (select id from auth.users where email = 'admin@zhusha.test') as admin,
  (select id from auth.users where email = 'a@zhusha.test') as a,
  (select id from auth.users where email = 'b@zhusha.test') as b;
grant select on u to public;

-- 註冊時建立免費方案
select is((select plan from public.entitlements where user_id = (select a from u)), 'free', 'setup_new_user 建立免費方案');
select is((select count(*)::int from public.entitlements), (select count(*)::int from public.user_profiles), '每個帳號一列');

-- RLS：本人只能讀自己的，不能寫
select tests.login_as((select a from u));
select is((select count(*)::int from public.entitlements), 1, '只看得到自己的一列');
select is((select user_id from public.entitlements), (select a from u), '那一列是自己的');
select throws_ok($$update public.entitlements set plan = 'plus'$$, '42501', null, '本人不能改方案');
select throws_ok($$insert into public.entitlements (user_id) values (private.uuid_v7())$$, '42501', null, '本人不能新增');
select throws_ok($$delete from public.entitlements$$, '42501', null, '本人不能刪除');
select tests.logout();
set local role anon;
select throws_ok($$select * from public.entitlements$$, '42501', null, '匿名不能讀');
reset role;

-- CHECK
select throws_ok($$update public.entitlements set plan = 'vip'$$, '23514', null, '方案只能是 free 或 plus');
select throws_ok($$update public.entitlements set fair_use_override = '{"daily_usd": -1}'$$, '23514', null, '個別上限不能是負的');
select lives_ok($$update public.entitlements set fair_use_override = '{"daily_usd": 1.5, "monthly_usd": 9}' where user_id = (select b from u)$$, '個別上限的格式');

-- 邀請的方案帶進註冊（密碼與 Google 共用 accept_invite）
set local role service_role;
create temp table inv as
  select * from public.admin_create_invite((select admin from u), private.uuid_v7(), 'plus@zhusha.test', null, 'plus', false);
grant select on inv to public;
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '019a9f00-0000-7000-8000-0000000000bb', 'authenticated', 'authenticated', 'plus@zhusha.test', '{}', '{}', now(), now());
set local role service_role;
select isnt(public.complete_invite_signup((select invite_id from inv), '019a9f00-0000-7000-8000-0000000000bb', '小加'), null, '用 plus 邀請註冊');
reset role;
select is((select plan from public.entitlements where user_id = '019a9f00-0000-7000-8000-0000000000bb'), 'plus', '方案跟著邀請走');

-- 後台調整方案
set local role service_role;
select lives_ok($$select public.admin_set_user_plan((select admin from u), (select a from u), 'plus')$$, '管理員調整方案');
select throws_ok($$select public.admin_set_user_plan((select a from u), (select b from u), 'plus')$$, '42501', 'forbidden', '一般使用者不能調整');
select throws_ok($$select public.admin_set_user_plan((select admin from u), (select a from u), 'vip')$$, '22023', 'invalid_input', '方案值不合法');
reset role;
select is((select plan from public.entitlements where user_id = (select a from u)), 'plus', '方案改了');
select is((select detail from public.admin_audit_logs where action = 'user.plan'), '{"before":"free","after":"plus"}'::jsonb, '紀錄有前後值');
select is((select (u ->> 'plan') from jsonb_array_elements(
  (select public.admin_list_users((select admin from u)))) u where u ->> 'user_id' = (select a::text from u)), 'plus', '使用者清單有方案');

-- ai_get_context：只給服務權限
select tests.login_as((select a from u));
select throws_ok($$select public.ai_get_context((select a from u))$$, '42501', null, '一般使用者不能呼叫 ai_get_context');
select tests.logout();
set local role service_role;
select is((public.ai_get_context((select a from u)) ->> 'plan') || (public.ai_get_context((select a from u)) ->> 'ai_enabled'), 'plustrue', 'ai_get_context 回傳方案與總開關');
reset role;

-- AI 設定：預設值、後台修改（寫紀錄）、不合法的值
select is((select ai_enabled from public.app_config), true, 'AI 總開關預設開');
select is((select ai_monthly_budget_usd from public.app_config), 18.00, '每月預算預設 18');
set local role service_role;
select lives_ok($$select public.admin_update_config((select admin from u), null, null, false, 12.5)$$, '管理員關 AI、改預算');
select throws_ok($$select public.admin_update_config((select admin from u), null, null, null, -1)$$, '22023', 'invalid_input', '預算不能是負的');
reset role;
select is((select detail -> 'after' ->> 'ai_enabled' from public.admin_audit_logs where action = 'config.update'), 'false', '設定紀錄有 AI 開關的新值');

select * from finish();
rollback;
