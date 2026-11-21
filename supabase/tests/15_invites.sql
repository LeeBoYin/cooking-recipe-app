-- 邀請：資料表權限、create_invite、complete_invite_signup
begin;
select plan(30);

select tests.create_user('admin@zhusha.test');
select tests.create_user('someone@zhusha.test');
select tests.create_user('existing@zhusha.test');
update public.user_profiles set role = 'system_admin'
  where user_id = (select id from auth.users where email = 'admin@zhusha.test');

-- 一般使用者讀不到、寫不了邀請表，也不能發邀請
select tests.login_as((select id from auth.users where email = 'someone@zhusha.test'));
select throws_ok($$select * from public.invites$$, '42501', null, '一般使用者不能讀邀請表');
select throws_ok($$insert into public.invites (id, email, token_hash) values (private.uuid_v7(), 'x@zhusha.test', repeat('a', 64))$$, '42501', null, '一般使用者不能寫邀請表');
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'friend@zhusha.test')$$, '42501', null, '一般使用者不能發邀請');
select tests.logout();

-- 匿名不能呼叫
set local role anon;
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'friend@zhusha.test')$$, '42501', null, '匿名不能發邀請');
select throws_ok($$select public.complete_invite_signup(private.uuid_v7(), private.uuid_v7())$$, '42501', null, '匿名不能完成註冊');
reset role;

-- 系統管理員可以發；email 存小寫、邀請者是他、14 天有效、只存雜湊
select tests.login_as((select id from auth.users where email = 'admin@zhusha.test'), 'aal2');
create temp table made as
  select * from public.create_invite(private.uuid_v7(), '  Friend@Zhusha.Test ', ' 小美，大學同學 ');
grant select on made to public;
select tests.logout();

select is((select email from public.invites), 'friend@zhusha.test', 'email 存小寫並去掉空白');
select is((select note from public.invites), '小美，大學同學', '備註去掉空白');
select is((select invited_by from public.invites), (select id from auth.users where email = 'admin@zhusha.test'), '邀請者是系統管理員');
select is((select token_hash from public.invites), encode(extensions.digest((select token from made), 'sha256'), 'hex'), '只存 token 的雜湊');
select isnt((select token_hash from public.invites), (select token from made), '不存原始 token');
select ok((select expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour' from public.invites), '14 天有效');
select is((select befriend_inviter from public.invites), true, '預設和邀請者成為好友（旗標）');
select is((select status from public.invites), 'pending', '狀態是待接受');

-- 服務權限（沒有登入身分）可以發，邀請者可指定或留空
create temp table made2 as
  select * from public.create_invite(private.uuid_v7(), 'second@zhusha.test', null, 'plus', 'account', null, false);
grant select on made2 to public;
select is((select plan from public.invites where email = 'second@zhusha.test'), 'plus', '服務權限可以發，方案 plus');
select is((select befriend_inviter from public.invites where email = 'second@zhusha.test'), false, '可以取消好友旗標');

-- 擋下的情況
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'FRIEND@zhusha.test')$$, '23505', 'invite_pending_exists', '同一個 email 不能有兩筆待接受（不分大小寫）');
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'existing@zhusha.test')$$, '23505', 'already_registered', '已經註冊的 email 不能邀請');
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'k@zhusha.test', null, 'free', 'kitchen', private.uuid_v7())$$, '0A000', 'invite_type_unsupported', 'M1a 不發廚房邀請');
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'not-an-email')$$, '22023', 'invalid_invite_input', 'email 格式不對');

-- 過期的待接受邀請讓出位置（舊的變成已撤銷）
update public.invites set expires_at = now() - interval '1 minute' where email = 'friend@zhusha.test';
select lives_ok($$select * from public.create_invite(private.uuid_v7(), 'friend@zhusha.test')$$, '舊邀請過期後可以重發');
select is((select count(*)::int from public.invites where email = 'friend@zhusha.test' and status = 'revoked'), 1, '過期的舊邀請標成已撤銷');

-- 人數上限：已註冊的人加上還沒過期的待接受邀請
update public.app_config set max_users = (select count(*) from public.user_profiles) + (select count(*) from public.invites where status = 'pending' and expires_at > now());
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'full@zhusha.test')$$, '53400', 'invite_capacity', '額滿時不能再邀請');
update public.app_config set max_users = max_users + 1;
select lives_ok($$select * from public.create_invite(private.uuid_v7(), 'full@zhusha.test')$$, '放寬上限後可以邀請');

-- 雲端的服務權限對資料表沒有預設的讀寫權限（本機比較寬鬆），這裡收回來模擬；
-- 延後檢查「至少一位管理者」的觸發器要用函式擁有者的權限，註冊才跑得完
revoke all on public.kitchen_members, public.invites from service_role;
select is((select prosecdef from pg_proc where proname = 'check_kitchen_has_admin'), true, '管理者檢查用函式擁有者的權限執行');
grant select on public.invites to service_role;

-- complete_invite_signup：只有服務權限；認領邀請並建立註冊資料
select tests.login_as((select id from auth.users where email = 'someone@zhusha.test'));
select throws_ok($$select public.complete_invite_signup(private.uuid_v7(), private.uuid_v7())$$, '42501', null, '一般使用者不能完成註冊');
select tests.logout();

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '019a9f00-0000-7000-8000-0000000000aa', 'authenticated', 'authenticated', 'second@zhusha.test', '{}', '{}', now(), now());
set local role service_role;
select isnt(public.complete_invite_signup((select invite_id from made2), '019a9f00-0000-7000-8000-0000000000aa', '小美'), null, '註冊完成並建立自己的廚房');
select lives_ok($$set constraints all immediate$$, '以服務權限提交時，管理者檢查不會缺權限');
reset role;
select is((select status from public.invites where id = (select invite_id from made2)), 'accepted', '邀請變成已接受');
select is((select invite_id from public.user_profiles where user_id = '019a9f00-0000-7000-8000-0000000000aa'), (select invite_id from made2), '帳號記下是哪一筆邀請');
select throws_ok($$select public.complete_invite_signup((select invite_id from made2), '019a9f00-0000-7000-8000-0000000000aa')$$, 'P0001', 'invite_not_usable', '邀請不能用第二次');

select * from finish();
rollback;
