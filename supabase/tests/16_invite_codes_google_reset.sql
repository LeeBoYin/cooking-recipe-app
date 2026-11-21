-- 邀請碼、Google 登入 hook 與 complete_google_signup、重設密碼連結
begin;
select plan(58);

select tests.create_user('admin@zhusha.test');
select tests.create_user('someone@zhusha.test');
update public.user_profiles set role = 'system_admin'
  where user_id = (select id from auth.users where email = 'admin@zhusha.test');

create temp table u as select (select id from auth.users where email = 'admin@zhusha.test') as admin, (select id from auth.users where email = 'someone@zhusha.test') as someone;
grant select on u to public;
create temp table made as
  select * from public.create_invite(private.uuid_v7(), 'Friend@Zhusha.Test');
grant select on made to public;

---------------------------------------------------------------------------
-- 資料表權限
---------------------------------------------------------------------------
select tests.login_as((select id from auth.users where email = 'someone@zhusha.test'));
select throws_ok($$select * from public.invite_code_attempts$$, '42501', null, '一般使用者讀不到錯誤紀錄');
select throws_ok($$select * from public.password_reset_links$$, '42501', null, '一般使用者讀不到重設連結');
select throws_ok($$insert into public.password_reset_links (id, user_id, token_hash) values (private.uuid_v7(), (select auth.uid()), repeat('a', 64))$$, '42501', null, '一般使用者寫不了重設連結');
select throws_ok($$select public.set_invite_code((select invite_id from made), repeat('a', 64))$$, '42501', null, '一般使用者不能產生邀請碼');
select throws_ok($$select * from public.redeem_invite_code(repeat('a', 64), repeat('b', 64))$$, '42501', null, '一般使用者不能兌換邀請碼');
select throws_ok($$select * from public.create_password_reset_link(private.uuid_v7(), (select auth.uid()))$$, '42501', null, '一般使用者不能產生重設連結');
select throws_ok($$select public.claim_password_reset_link(repeat('a', 64))$$, '42501', null, '一般使用者不能用掉重設連結');
select tests.logout();
set local role anon;
select throws_ok($$select public.complete_google_signup()$$, '42501', null, '匿名不能完成 Google 註冊');
select throws_ok($$select public.hook_before_user_created('{}'::jsonb)$$, '42501', null, '匿名不能呼叫 hook');
reset role;

---------------------------------------------------------------------------
-- 邀請碼
---------------------------------------------------------------------------
set local role service_role;
select isnt(public.set_invite_code((select invite_id from made), encode(extensions.digest('K7Q2MX', 'sha256'), 'hex')), null, '產生邀請碼');
reset role;
select ok((select code_expires_at between now() + interval '59 minutes' and now() + interval '61 minutes' from public.invites), '邀請碼 1 小時有效');

-- 重新產生時舊的作廢
set local role service_role;
select public.set_invite_code((select invite_id from made), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'));
select is((select result from public.redeem_invite_code(repeat('1', 64), encode(extensions.digest('K7Q2MX', 'sha256'), 'hex'))), 'invalid', '舊的邀請碼作廢');
select is((select result from public.redeem_invite_code(repeat('2', 64), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'))), 'ok', '新的邀請碼可以兌換');
select is((select email from public.redeem_invite_code(repeat('2', 64), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'))), 'friend@zhusha.test', '換回邀請的 email');

-- 錯 5 次暫停：第 5 次回 locked，之後連對的碼也不收
select is((select result from public.redeem_invite_code(repeat('3', 64), repeat('f', 64))), 'invalid', '第 1 次錯');
select is((select result from public.redeem_invite_code(repeat('3', 64), repeat('f', 64))), 'invalid', '第 2 次錯');
select is((select result from public.redeem_invite_code(repeat('3', 64), repeat('f', 64))), 'invalid', '第 3 次錯');
select is((select result from public.redeem_invite_code(repeat('3', 64), repeat('f', 64))), 'invalid', '第 4 次錯');
select is((select result from public.redeem_invite_code(repeat('3', 64), repeat('f', 64))), 'locked', '第 5 次錯開始暫停');
select is((select result from public.redeem_invite_code(repeat('3', 64), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'))), 'locked', '暫停中連對的碼也不收');
select is((select result from public.redeem_invite_code(repeat('4', 64), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'))), 'ok', '別的來源不受影響');
reset role;
select ok((select locked_until between now() + interval '14 minutes' and now() + interval '16 minutes' from public.invite_code_attempts where source_hash = repeat('3', 64)), '暫停 15 分鐘');

-- 暫停到期後可以再試；上一輪失敗超過 15 分鐘就重新計
update public.invite_code_attempts set locked_until = now() - interval '1 minute', last_failed_at = now() - interval '16 minutes' where source_hash = repeat('3', 64);
set local role service_role;
select is((select result from public.redeem_invite_code(repeat('3', 64), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'))), 'ok', '暫停到期後可以再兌換');
select is((select result from public.redeem_invite_code(repeat('3', 64), repeat('f', 64))), 'invalid', '重新計：又錯 1 次不會馬上暫停');
reset role;
select is((select failed_count from public.invite_code_attempts where source_hash = repeat('3', 64)), 1, '失敗次數從 1 重算');

-- 邀請碼過期、邀請用掉或撤銷時一起失效
update public.invites set code_expires_at = now() - interval '1 second';
set local role service_role;
select is((select result from public.redeem_invite_code(repeat('5', 64), encode(extensions.digest('AAAAAA', 'sha256'), 'hex'))), 'invalid', '邀請碼過期');
select public.set_invite_code((select invite_id from made), encode(extensions.digest('BBBBBB', 'sha256'), 'hex'));
reset role;
update public.invites set status = 'revoked';
set local role service_role;
select is((select result from public.redeem_invite_code(repeat('5', 64), encode(extensions.digest('BBBBBB', 'sha256'), 'hex'))), 'invalid', '邀請撤銷後邀請碼失效');
select throws_ok($$select public.set_invite_code((select invite_id from made), repeat('a', 64))$$, 'P0001', 'invite_not_usable', '失效的邀請不能產生邀請碼');
reset role;
update public.invites set status = 'pending';

---------------------------------------------------------------------------
-- Auth「建立使用者前」hook
---------------------------------------------------------------------------
create function pg_temp.ev(p_provider text, p_email text, p_flag boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('user', jsonb_build_object(
    'email', p_email,
    'app_metadata', jsonb_build_object('provider', p_provider) || case when p_flag then '{"invite_signup": true}'::jsonb else '{}'::jsonb end));
$$;
grant execute on function pg_temp.ev(text, text, boolean) to public;

select is(public.hook_before_user_created(pg_temp.ev('google', 'FRIEND@zhusha.test')), '{}'::jsonb, 'Google：有對應的邀請就放行（不分大小寫）');
select is(public.hook_before_user_created(pg_temp.ev('google', 'nobody@zhusha.test')) #>> '{error,message}', 'invite_required', 'Google：沒有邀請就拒絕');
select is(public.hook_before_user_created(pg_temp.ev('google', null)) #>> '{error,http_code}', '403', 'Google：沒有 email 就拒絕');
select is(public.hook_before_user_created(pg_temp.ev('email', 'friend@zhusha.test')) #>> '{error,message}', 'signup_requires_invite', '密碼：公開註冊就算有邀請也拒絕');
select is(public.hook_before_user_created(pg_temp.ev('email', 'friend@zhusha.test', true)), '{}'::jsonb, '密碼：accept-invite 建立的放行');
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), 'Auth 能執行 hook');
select ok(not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'), '一般使用者不能執行 hook');

update public.invites set expires_at = now() - interval '1 second';
select is(public.hook_before_user_created(pg_temp.ev('google', 'friend@zhusha.test')) #>> '{error,message}', 'invite_required', 'Google：邀請過期就拒絕');
update public.invites set expires_at = now() + interval '1 day', status = 'revoked';
select is(public.hook_before_user_created(pg_temp.ev('google', 'friend@zhusha.test')) #>> '{error,message}', 'invite_required', 'Google：邀請撤銷就拒絕');
update public.invites set status = 'pending';

---------------------------------------------------------------------------
-- complete_google_signup
---------------------------------------------------------------------------
-- 模擬 Google 建立的使用者：providers 含 google、email 已確認
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '019a9f00-0000-7000-8000-0000000000bb', 'authenticated', 'authenticated',
          'Friend@Zhusha.Test', now(), '{"provider":"google","providers":["google"]}', '{}', now(), now());
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '019a9f00-0000-7000-8000-0000000000cc', 'authenticated', 'authenticated',
          'nobody@zhusha.test', now(), '{"provider":"google","providers":["google"]}', '{}', now(), now());
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '019a9f00-0000-7000-8000-0000000000dd', 'authenticated', 'authenticated',
          'friend@zhusha.test', null, '{"provider":"google","providers":["google"]}', '{}', now(), now());

-- 沒有邀請：失敗
select tests.login_as('019a9f00-0000-7000-8000-0000000000cc');
select throws_ok($$select public.complete_google_signup('小美')$$, 'P0001', 'invite_not_usable', '沒有邀請不能註冊');
select tests.logout();
-- email 沒確認：失敗
select tests.login_as('019a9f00-0000-7000-8000-0000000000dd');
select throws_ok($$select public.complete_google_signup('小美')$$, '42501', 'not_google_user', 'email 沒有確認不能註冊');
select tests.logout();
-- 密碼註冊的人（沒有 google）：失敗
select tests.login_as((select id from auth.users where email = 'someone@zhusha.test'));
select lives_ok($$select public.complete_google_signup()$$, '已初始化的人重複呼叫不出錯');
select tests.logout();

-- 有邀請：整批成功
select tests.login_as('019a9f00-0000-7000-8000-0000000000bb');
create temp table g as select public.complete_google_signup('小美', 'Asia/Tokyo', 'JP') as kitchen_id;
grant select on g to public;
select is((select public.complete_google_signup('另一個名字')), (select kitchen_id from g), '重複呼叫回傳同一個廚房');
select tests.logout();
select is((select status from public.invites where id = (select invite_id from made)), 'accepted', '邀請變成已接受');
select is((select accepted_via from public.invites where id = (select invite_id from made)), 'google', 'accepted_via 是 google');
select is((select accepted_user_id from public.invites where id = (select invite_id from made)), '019a9f00-0000-7000-8000-0000000000bb'::uuid, '記下接受的使用者');
select is((select timezone from public.kitchens where id = (select kitchen_id from g)), 'Asia/Tokyo', '用手機送來的時區建立廚房');
select is((select invite_id from public.user_profiles where user_id = '019a9f00-0000-7000-8000-0000000000bb'), (select invite_id from made), '帳號記下是哪一筆邀請');
select is((select count(*)::int from public.kitchens k join public.kitchen_members m on m.kitchen_id = k.id where m.user_id = '019a9f00-0000-7000-8000-0000000000bb'), 1, '只建一個廚房');

---------------------------------------------------------------------------
-- 重設密碼連結
---------------------------------------------------------------------------
-- 系統管理員可以產生；只存雜湊、24 小時；啟用中的使用者才行
select tests.login_as((select admin from u), 'aal2');
create temp table r1 as select * from public.create_password_reset_link(private.uuid_v7(), (select someone from u));
grant select on r1 to public;
select tests.logout();
select is((select token_hash from public.password_reset_links where id = (select link_id from r1)), encode(extensions.digest((select token from r1), 'sha256'), 'hex'), '只存 token 的雜湊');
select is((select created_by from public.password_reset_links where id = (select link_id from r1)), (select admin from u), '記下產生的管理員');
select ok((select expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute' from r1), '24 小時有效');
select throws_ok($$select * from public.create_password_reset_link(private.uuid_v7(), private.uuid_v7())$$, 'P0002', 'user_not_found', '找不到使用者');

-- 再產生一條，舊的作廢
set local role service_role;
create temp table r2 as select * from public.create_password_reset_link(private.uuid_v7(), (select someone from u));
select is(public.claim_password_reset_link(encode(extensions.digest((select token from r1), 'sha256'), 'hex')), null, '重新產生後舊連結作廢');
-- 只能用一次
select is(public.claim_password_reset_link(encode(extensions.digest((select token from r2), 'sha256'), 'hex')), (select someone from u), '用掉連結，回傳使用者');
select is(public.claim_password_reset_link(encode(extensions.digest((select token from r2), 'sha256'), 'hex')), null, '只能用一次');
-- 改密碼失敗時還回去，可以再用
select public.release_password_reset_link(encode(extensions.digest((select token from r2), 'sha256'), 'hex'));
select isnt(public.claim_password_reset_link(encode(extensions.digest((select token from r2), 'sha256'), 'hex')), null, '還回去之後可以再用');
reset role;
-- 過期、停用的帳號不能用
update public.password_reset_links set used_at = null, expires_at = now() - interval '1 second' where id = (select link_id from r2);
set local role service_role;
select is(public.claim_password_reset_link(encode(extensions.digest((select token from r2), 'sha256'), 'hex')), null, '過期的連結不能用');
reset role;
update public.password_reset_links set expires_at = now() + interval '1 hour' where id = (select link_id from r2);
update public.user_profiles set status = 'suspended' where user_id = (select someone from u);
set local role service_role;
select is(public.claim_password_reset_link(encode(extensions.digest((select token from r2), 'sha256'), 'hex')), null, '停用的帳號不能重設');
select throws_ok($$select * from public.create_password_reset_link(private.uuid_v7(), (select someone from u))$$, 'P0002', 'user_not_found', '停用的帳號不能產生連結');
reset role;

select * from finish();
rollback;
