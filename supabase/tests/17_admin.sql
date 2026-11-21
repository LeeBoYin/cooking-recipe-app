-- 管理後台：操作紀錄只能新增、admin_* 只給服務權限、各個操作與紀錄、is_system_admin 要 aal2
begin;
select plan(48);

select tests.create_user('admin@zhusha.test');
select tests.create_user('admin2@zhusha.test');
select tests.create_user('someone@zhusha.test');
update public.user_profiles set role = 'system_admin'
  where user_id in (select id from auth.users where email in ('admin@zhusha.test', 'admin2@zhusha.test'));

create temp table u as select
  (select id from auth.users where email = 'admin@zhusha.test') as admin,
  (select id from auth.users where email = 'admin2@zhusha.test') as admin2,
  (select id from auth.users where email = 'someone@zhusha.test') as someone;
grant select on u to public;

-- 沒有 aal2 的管理員不算系統管理員（create_invite 的管理員路徑也被擋下）
select tests.login_as((select admin from u));
select throws_ok($$select * from public.create_invite(private.uuid_v7(), 'a@zhusha.test')$$, '42501', null, 'aal1 的管理員不能發邀請');
select tests.logout();
select tests.login_as((select admin from u), 'aal2');
select lives_ok($$select * from public.create_invite(private.uuid_v7(), 'a@zhusha.test')$$, 'aal2 的管理員可以發邀請');
select tests.logout();

-- admin_* 一般使用者、管理員本人、匿名都不能直接呼叫；只有服務權限
select tests.login_as((select admin from u), 'aal2');
select throws_ok($$select public.admin_list_users((select admin from u))$$, '42501', null, '管理員本人（aal2）也不能直接呼叫 admin_list_users');
select throws_ok($$select public.admin_update_config((select admin from u), 10)$$, '42501', null, '管理員本人不能直接改設定');
select tests.logout();
set local role anon;
select throws_ok($$select public.admin_list_audit_logs((select admin from u))$$, '42501', null, '匿名不能讀操作紀錄');
reset role;

-- 操作紀錄表：任何 API 角色都不能直接讀寫
select tests.login_as((select admin from u), 'aal2');
select throws_ok($$select * from public.admin_audit_logs$$, '42501', null, '管理員不能直接讀操作紀錄表');
select throws_ok($$insert into public.admin_audit_logs (admin_user_id, action) values (private.uuid_v7(), 'x.y')$$, '42501', null, '管理員不能直接寫操作紀錄表');
select tests.logout();
set local role service_role;
select throws_ok($$delete from public.admin_audit_logs$$, '42501', null, '服務權限不能直接刪操作紀錄');
select throws_ok($$update public.admin_audit_logs set action = 'a.b'$$, '42501', null, '服務權限不能直接改操作紀錄');
reset role;

-- 呼叫者不是系統管理員
set local role service_role;
select throws_ok($$select public.admin_list_users((select someone from u))$$, '42501', 'forbidden', '一般使用者的 ID 不能當管理員');
select throws_ok($$select public.admin_list_users(null)$$, '42501', 'forbidden', '沒有管理員 ID 不行');
reset role;
update public.user_profiles set status = 'suspended' where user_id = (select admin2 from u);
set local role service_role;
select throws_ok($$select public.admin_list_users((select admin2 from u))$$, '42501', 'forbidden', '已停用的管理員不行');
reset role;
update public.user_profiles set status = 'active' where user_id = (select admin2 from u);

-- 產生邀請
set local role service_role;
create temp table made as
  select * from public.admin_create_invite((select admin from u), private.uuid_v7(), 'Friend@Zhusha.Test', '小美', 'plus', false);
grant select on made to public;
reset role;
select is((select befriend_inviter from public.invites where email = 'friend@zhusha.test'), false, '好友旗標存下來');
select is((select invited_by from public.invites where email = 'friend@zhusha.test'), (select admin from u), '邀請者是管理員');
select is((select action || ':' || target_id from public.admin_audit_logs where action = 'invite.send'),
  'invite.send:' || (select invite_id from made), '產生邀請寫了紀錄');
select is((select detail from public.admin_audit_logs where action = 'invite.send'), '{"plan":"plus","befriend_inviter":false}'::jsonb, '紀錄只有方案與旗標，沒有 email');

-- 重複的 email 擋下，而且沒有多寫紀錄
set local role service_role;
select throws_ok($$select * from public.admin_create_invite((select admin from u), private.uuid_v7(), 'friend@zhusha.test')$$, '23505', 'invite_pending_exists', '重複的 email 擋下');
reset role;
select is((select count(*)::int from public.admin_audit_logs where action = 'invite.send'), 1, '失敗的操作不留紀錄');

-- 重新產生連結：舊的失效、新的有效
create temp table old_hash as select token_hash h from public.invites where email = 'friend@zhusha.test';
grant select on old_hash to public;
update public.invites set code_hash = repeat('b', 64), code_expires_at = now() + interval '1 hour' where email = 'friend@zhusha.test';
set local role service_role;
create temp table regen as select * from public.admin_regenerate_invite((select admin from u), (select invite_id from made));
grant select on regen to public;
reset role;
select isnt((select token_hash from public.invites where email = 'friend@zhusha.test'), (select h from old_hash), '重新產生後 token 雜湊換了');
select is((select token_hash from public.invites where email = 'friend@zhusha.test'), encode(extensions.digest((select token from regen), 'sha256'), 'hex'), '只存新 token 的雜湊');
select is((select code_hash from public.invites where email = 'friend@zhusha.test'), null, '舊的邀請碼一起失效');

-- 延長期限
update public.invites set expires_at = now() + interval '2 days' where email = 'friend@zhusha.test';
set local role service_role;
select lives_ok($$select public.admin_extend_invite((select admin from u), (select invite_id from made), 7)$$, '延長 7 天');
select throws_ok($$select public.admin_extend_invite((select admin from u), (select invite_id from made), 0)$$, '22023', null, '延長天數要在 1～60');
reset role;
select ok((select expires_at between now() + interval '8 days 23 hours' and now() + interval '9 days 1 hour' from public.invites where email = 'friend@zhusha.test'), '從原本期限往後加');

-- 修改 email
set local role service_role;
select throws_ok($$select public.admin_update_invite_email((select admin from u), (select invite_id from made), 'someone@zhusha.test')$$, '23505', 'already_registered', '不能改成已註冊的 email');
select lives_ok($$select public.admin_update_invite_email((select admin from u), (select invite_id from made), ' New@Zhusha.Test ')$$, '修改 email');
reset role;
select is((select email from public.invites where id = (select invite_id from made)), 'new@zhusha.test', 'email 存小寫');
select ok(not exists (select 1 from public.admin_audit_logs where detail::text ilike '%zhusha.test%'), '紀錄裡沒有任何 email');

-- 撤銷；撤銷後不能再重新產生、延長、改 email
set local role service_role;
select lives_ok($$select public.admin_revoke_invite((select admin from u), (select invite_id from made))$$, '撤銷邀請');
select throws_ok($$select * from public.admin_regenerate_invite((select admin from u), (select invite_id from made))$$, 'P0001', 'invite_not_usable', '已撤銷的不能重新產生');
select throws_ok($$select public.admin_revoke_invite((select admin from u), (select invite_id from made))$$, 'P0001', 'invite_not_usable', '不能重複撤銷');
reset role;

-- 人數上限：滿了就不能產生（含過期後要重新產生的）
update public.app_config set max_users = (select count(*) from public.user_profiles)
  + (select count(*) from public.invites where status = 'pending' and expires_at > now()) + 1;
create temp table cap as select max_users from public.app_config;
grant select on cap to public;
set local role service_role;
select lives_ok($$select * from public.admin_create_invite((select admin from u), private.uuid_v7(), 'cap1@zhusha.test')$$, '還有一個名額');
select throws_ok($$select * from public.admin_create_invite((select admin from u), private.uuid_v7(), 'cap2@zhusha.test')$$, '53400', 'invite_capacity', '額滿不能再產生');
reset role;

-- 停用與恢復
set local role service_role;
select lives_ok($$select public.admin_set_user_status((select admin from u), (select someone from u), 'suspended')$$, '停用帳號');
reset role;
select is((select status from public.user_profiles where user_id = (select someone from u)), 'suspended', '狀態是停用');
set local role service_role;
select throws_ok($$select public.admin_set_user_status((select admin from u), (select admin from u), 'suspended')$$, '22023', 'cannot_target_self', '不能停用自己');
select throws_ok($$select public.admin_set_user_status((select admin from u), (select admin2 from u), 'suspended')$$, '22023', 'cannot_target_admin', '不能停用另一位管理員');
select lives_ok($$select public.admin_set_user_status((select admin from u), (select someone from u), 'active')$$, '恢復帳號');
select lives_ok($$select * from public.admin_create_reset_link((select admin from u), private.uuid_v7(), (select someone from u))$$, '產生重設密碼連結');
reset role;
select is((select array_agg(action order by action)::text from public.admin_audit_logs where action in ('user.suspend', 'user.restore', 'user.reset_link')), '{user.reset_link,user.restore,user.suspend}', '停用、恢復、重設連結都有紀錄');

-- 系統設定
set local role service_role;
select is((select public.admin_update_config((select admin from u), 50, null)), '{"max_users":50,"soft_delete_retention_days":30,"ai_enabled":true,"ai_monthly_budget_usd":18.00}'::jsonb, '改人數上限');
select throws_ok($$select public.admin_update_config((select admin from u), 0)$$, '22023', null, '人數上限至少 1');
reset role;
select is((select detail -> 'before' ->> 'max_users' from public.admin_audit_logs where action = 'config.update'),
  (select max_users from cap)::text, '紀錄有修改前的值');

-- 讀取與只能新增：連擁有者都不能改刪
set local role service_role;
select is((select jsonb_array_length(public.admin_list_audit_logs((select admin from u), 2))), 2, '操作紀錄可以限制筆數');
select is((select (public.admin_list_audit_logs((select admin from u), 1)) -> 0 ->> 'action'), 'config.update', '新的在前');
reset role;
select throws_ok($$update public.admin_audit_logs set action = 'a.b'$$, '42501', 'admin_audit_logs_append_only', '擁有者也不能改操作紀錄');
select throws_ok($$delete from public.admin_audit_logs$$, '42501', 'admin_audit_logs_append_only', '擁有者也不能刪操作紀錄');
select throws_ok($$truncate public.admin_audit_logs$$, '42501', 'admin_audit_logs_append_only', '擁有者也不能清空操作紀錄');

select * from finish();
rollback;
