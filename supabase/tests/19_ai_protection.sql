-- M1a-04：AI 用量保護——速率、合理使用上限、全站預算、異常偵測、後台函式
begin;
select plan(142);

select tests.create_user('admin@zhusha.test');
select tests.create_user('a@zhusha.test');
select tests.create_user('b@zhusha.test');
select tests.create_user('c@zhusha.test');
select tests.create_user('d@zhusha.test');
select tests.create_user('e@zhusha.test');
select tests.create_user('f@zhusha.test');
select tests.create_user('g@zhusha.test');
select tests.create_user('whale@zhusha.test');
update public.user_profiles set role = 'system_admin' where user_id = (select id from auth.users where email = 'admin@zhusha.test');
create temp table u as select
  (select id from auth.users where email = 'admin@zhusha.test') as admin,
  (select id from auth.users where email = 'a@zhusha.test') as a,
  (select id from auth.users where email = 'b@zhusha.test') as b,
  (select id from auth.users where email = 'c@zhusha.test') as c,
  (select id from auth.users where email = 'd@zhusha.test') as d,
  (select id from auth.users where email = 'e@zhusha.test') as e,
  (select id from auth.users where email = 'f@zhusha.test') as f,
  (select id from auth.users where email = 'g@zhusha.test') as g,
  (select id from auth.users where email = 'whale@zhusha.test') as whale;
grant select on u to public;

-- 方便呼叫的小函式：回傳判斷結果與寫一筆用量
create function pg_temp.guard(p_user uuid, p_now timestamptz, p_bg boolean default false) returns text
language sql as $$ select public.ai_guard_check(p_user, p_bg, p_now) ->> 'verdict' $$;
create function pg_temp.degraded(p_user uuid, p_now timestamptz) returns boolean
language sql as $$ select (public.ai_guard_check(p_user, true, p_now) ->> 'degraded')::boolean $$;
create function pg_temp.rec(p_user uuid, p_cost numeric, p_now timestamptz, p_hash text default null, p_ratio integer default null, p_session text default null)
returns void language sql as $$
  select public.ai_record_usage(p_user, 'chat', 'claude-sonnet-5-5', 100, 50, 0, 0, p_cost, true, 20, p_hash, p_ratio, p_session, p_now)
$$;
create function pg_temp.alerts(p_user uuid, p_kind text) returns integer
language sql as $$ select count(*)::int from public.ai_usage_alerts where user_id is not distinct from p_user and kind = p_kind $$;

---------------------------------------------------------------------------
-- 權限與設定格式
---------------------------------------------------------------------------
select is((select count(*)::int from public.app_config where private.ai_protection_valid(ai_protection)), 1, '預設的 ai_protection 通過格式檢查');
select is((select ai_protection ->> 'schemaVersion' from public.app_config), '1', '帶 schemaVersion');
select is((select (ai_protection #>> '{fairUse,free,dailyUsd}')::numeric from public.app_config), 1.5, '免費方案每日預設 1.5');
select throws_ok($$update public.app_config set ai_protection = '{}'$$, '23514', null, '格式不對的 ai_protection 寫不進去');
select throws_ok($$update public.app_config set ai_protection = jsonb_set(ai_protection, '{perHour}', '3')$$, '23514', null, '每小時不能低於每分鐘');
select throws_ok($$update public.app_config set ai_protection = jsonb_set(ai_protection, '{fairUse,free,monthlyUsd}', '1')$$, '23514', null, '每月不能低於每日');
select throws_ok($$update public.app_config set ai_protection = ai_protection || '{"x":1}'$$, '23514', null, '多的欄位不行');
select throws_ok($$update public.app_config set ai_protection = jsonb_set(ai_protection, '{schemaVersion}', '2')$$, '23514', null, 'schemaVersion 不認得');

set local role service_role;
select is(public.ai_guard_check((select a from u), false, '2026-03-10 10:00:00+00') ->> 'verdict', 'ok', '服務權限可以呼叫檢查');
select throws_ok($$select * from public.ai_usage_records$$, '42501', null, '服務權限不能直接讀用量紀錄');
select throws_ok($$select * from public.ai_usage_alerts$$, '42501', null, '服務權限不能直接讀異常清單');
reset role;
select tests.login_as((select a from u));
select throws_ok($$select * from public.ai_rate_counters$$, '42501', null, '使用者不能讀速率計數');
select throws_ok($$select * from public.ai_spend_monthly$$, '42501', null, '使用者不能讀每月累計');
select throws_ok($$select public.ai_guard_check((select a from u))$$, '42501', null, '使用者不能呼叫檢查');
select throws_ok($$select public.ai_record_usage((select a from u), 'chat', 'm', 1, 1, 0, 0, 0.1, true)$$, '42501', null, '使用者不能寫用量');
select tests.logout();

---------------------------------------------------------------------------
-- 速率：每分鐘 6、每小時 60
---------------------------------------------------------------------------
select is((select count(*)::int from generate_series(1, 6) where pg_temp.guard((select b from u), '2026-03-10 10:00:30+00') = 'ok'), 6, '一分鐘內前 6 次放行');
select is(pg_temp.guard((select b from u), '2026-03-10 10:00:45+00'), 'rate_limited', '第 7 次回速率限制');
select is((select count from public.ai_rate_counters where user_id = (select b from u) and bucket = 'minute' and window_start = '2026-03-10 10:00:00+00'), 6, '分鐘計數停在上限，被擋的不多算');
select is((select count from public.ai_rate_counters where user_id = (select b from u) and bucket = 'hour' and window_start = '2026-03-10 10:00:00+00'), 6, '分鐘被擋時，小時的計數有還回去');
select is((select blocked from public.ai_rate_counters where user_id = (select b from u) and bucket = 'hour'), 1, '被擋的次數記在小時那一列');
select is(pg_temp.guard((select b from u), '2026-03-10 10:00:50+00', true), 'ok', '背景任務不算速率');
select is((select count from public.ai_rate_counters where user_id = (select b from u) and bucket = 'minute'), 6, '背景任務沒有增加計數');
select is(pg_temp.guard((select b from u), '2026-03-10 10:01:00+00'), 'ok', '下一分鐘自動恢復');
select is(pg_temp.guard((select a from u), '2026-03-10 10:00:50+00'), 'ok', '別人不受影響');
-- 一小時 60 次：每分鐘 5 次，12 分鐘滿 60
select is((select count(*)::int from generate_series(0, 59) g
  where pg_temp.guard((select c from u), '2026-03-10 11:00:00+00'::timestamptz + make_interval(mins => g / 5, secs => g % 5)) = 'ok'), 60, '一小時內 60 次都放行');
select is(pg_temp.guard((select c from u), '2026-03-10 11:30:00+00'), 'rate_limited', '第 61 次回速率限制');
select is((select count from public.ai_rate_counters where user_id = (select c from u) and bucket = 'minute' and window_start = '2026-03-10 11:30:00+00'), null, '小時被擋時，沒有占用分鐘的計數');
select is(pg_temp.guard((select c from u), '2026-03-10 12:00:00+00'), 'ok', '下一小時自動恢復');
-- 被擋很多次才通知管理員
select is((select count(*)::int from generate_series(1, 8) where pg_temp.guard((select c from u), '2026-03-10 12:00:10+00'::timestamptz + make_interval(secs => 0)) = 'rate_limited'), 3, '12:00 這一分鐘已用 1 次，再 5 次放行、其餘 3 次被擋');
select is(pg_temp.alerts((select c from u), 'rate_limited'), 0, '才被擋幾次不通知');
select is((select count(*)::int from generate_series(1, 12) where pg_temp.guard((select c from u), '2026-03-10 12:00:20+00') = 'rate_limited'), 12, '一直連點');
select is(pg_temp.alerts((select c from u), 'rate_limited'), 1, '一小時內被擋滿 10 次通知一次');
select is(pg_temp.guard((select c from u), '2026-03-10 12:00:30+00'), 'rate_limited', '繼續被擋');
select is(pg_temp.alerts((select c from u), 'rate_limited'), 1, '同一小時不重複通知');

---------------------------------------------------------------------------
-- 合理使用上限：每日 1.5、每月 5（免費）；跨日、跨月
---------------------------------------------------------------------------
select pg_temp.rec((select d from u), 1.0, '2026-03-10 09:00:00+00');
select is(pg_temp.guard((select d from u), '2026-03-10 09:10:00+00'), 'ok', '今天用了 1.0，未達 1.5');
select pg_temp.rec((select d from u), 0.6, '2026-03-10 09:20:00+00');
select is(pg_temp.guard((select d from u), '2026-03-10 09:30:00+00'), 'over_limit', '今天累計 1.6 超過 1.5');
select is(pg_temp.alerts((select d from u), 'fair_use_daily'), 1, '通知管理員一次');
select is(pg_temp.guard((select d from u), '2026-03-10 23:59:59+00'), 'over_limit', '當天晚上還是擋');
select is(pg_temp.alerts((select d from u), 'fair_use_daily'), 1, '同一天不重複通知');
select is(pg_temp.guard((select d from u), '2026-03-11 00:00:00+00'), 'ok', '跨日恢復（UTC 零點）');
-- 每月：連續多天各用 1.4（不超過每日），第 4 天累計到 5.6
select pg_temp.rec((select e from u), 1.4, '2026-03-11 10:00:00+00');
select pg_temp.rec((select e from u), 1.4, '2026-03-12 10:00:00+00');
select pg_temp.rec((select e from u), 1.4, '2026-03-13 10:00:00+00');
select is(pg_temp.guard((select e from u), '2026-03-14 10:00:00+00'), 'ok', '累計 4.2，未達每月 5');
select pg_temp.rec((select e from u), 1.4, '2026-03-14 10:00:00+00');
select is(pg_temp.guard((select e from u), '2026-03-15 10:00:00+00'), 'over_limit', '累計 5.6 超過每月 5');
select is(pg_temp.alerts((select e from u), 'fair_use_monthly'), 1, '每月上限也通知');
select is(pg_temp.guard((select e from u), '2026-03-31 23:59:59+00'), 'over_limit', '月底還是擋');
select is(pg_temp.guard((select e from u), '2026-04-01 00:00:00+00'), 'ok', '跨月恢復');
select is((select total_usd from public.ai_spend_monthly where scope = 'user' and user_id = (select e from u) and month = '2026-03'), 5.6::numeric, '每月累計加總正確');

-- 個人覆寫優先於方案
select tests.create_user('x@zhusha.test');
select is(pg_temp.guard((select d from u), '2026-03-10 09:40:00+00'), 'over_limit', '（沒覆寫前）d 今天被擋');
update public.entitlements set fair_use_override = '{"daily_usd": 10}' where user_id = (select d from u);
select is(pg_temp.guard((select d from u), '2026-03-10 09:41:00+00'), 'ok', '覆寫每日 10：優先於方案的 1.5');
update public.entitlements set fair_use_override = '{"daily_usd": 0.5}' where user_id = (select a from u);
select pg_temp.rec((select a from u), 0.6, '2026-03-10 09:00:00+00');
select is(pg_temp.guard((select a from u), '2026-03-10 09:50:00+00'), 'over_limit', '覆寫比方案嚴格也算數（0.5）');
update public.entitlements set fair_use_override = '{"daily_usd": 10}' where user_id = (select e from u);
select is(pg_temp.guard((select e from u), '2026-03-15 10:00:00+00'), 'over_limit', '只覆寫每日時，每月仍用方案的值');
update public.entitlements set fair_use_override = '{"daily_usd": 10, "monthly_usd": 100}' where user_id = (select e from u);
select is(pg_temp.guard((select e from u), '2026-03-15 10:00:00+00'), 'ok', '兩個都覆寫');
update public.entitlements set fair_use_override = null where user_id = (select a from u);
select is(pg_temp.guard((select a from u), '2026-03-10 09:51:00+00'), 'ok', '清掉覆寫回到方案的值');
update public.entitlements set plan = 'plus' where user_id = (select f from u);
select pg_temp.rec((select f from u), 2.0, '2026-03-10 08:00:00+00');
select is(pg_temp.guard((select f from u), '2026-03-10 08:10:00+00'), 'ok', '付費方案每日 3：用了 2.0 還可以');
select pg_temp.rec((select f from u), 1.1, '2026-03-10 08:20:00+00');
select is(pg_temp.guard((select f from u), '2026-03-10 08:30:00+00'), 'over_limit', '付費方案累計 3.1 超過 3');

---------------------------------------------------------------------------
-- 全站每月預算：80% 降級並提醒一次、100% 擋下、調高預算立刻恢復、跨月重算
---------------------------------------------------------------------------
select is((select public.ai_budget_state()), 'ok', '一開始沒有用量時是 ok');
select pg_temp.rec((select whale from u), 14.0, '2026-05-02 10:00:00+00');
select is(pg_temp.degraded((select g from u), '2026-05-02 10:05:00+00'), false, '用了 14.0（77.8%）還沒降級');
select is(pg_temp.alerts(null, 'budget_80'), 0, '還沒有 80% 提醒');
select pg_temp.rec((select whale from u), 0.5, '2026-05-02 11:00:00+00');
select is(pg_temp.degraded((select g from u), '2026-05-02 11:05:00+00'), true, '用到 14.5（80.6%）降級');
select is(pg_temp.guard((select g from u), '2026-05-02 11:06:00+00'), 'ok', '降級時仍可呼叫（由 ai 函式換模型）');
select is(pg_temp.alerts(null, 'budget_80'), 1, '寫一筆 80% 提醒');
select pg_temp.rec((select whale from u), 0.3, '2026-05-02 12:00:00+00');
select pg_temp.rec((select whale from u), 0.3, '2026-05-03 12:00:00+00');
select is(pg_temp.alerts(null, 'budget_80'), 1, '同一個月只提醒一次');
select is(pg_temp.alerts(null, 'budget_100'), 0, '還沒到 100%');
select pg_temp.rec((select whale from u), 3.0, '2026-05-04 12:00:00+00');
select is(pg_temp.guard((select g from u), '2026-05-04 12:05:00+00'), 'budget_exhausted', '用到 100% 所有人都擋下');
select is(pg_temp.guard((select g from u), '2026-05-04 12:06:00+00', true), 'budget_exhausted', '背景任務也擋下（暫停排隊）');
select is((select public.ai_budget_state()), 'ok', '（現在的月份不同，所以 ai_budget_state 是 ok）');
select is(pg_temp.alerts(null, 'budget_100'), 1, '寫一筆 100% 提醒');
select is(pg_temp.guard((select g from u), '2026-05-04 12:07:00+00'), 'budget_exhausted', '再擋也不重複提醒');
select is(pg_temp.alerts(null, 'budget_100'), 1, '100% 提醒只有一筆');
select public.admin_update_config((select admin from u), null, null, null, 30);
select is(pg_temp.guard((select g from u), '2026-05-04 12:08:00+00'), 'ok', '調高預算立刻恢復');
select is(pg_temp.degraded((select g from u), '2026-05-04 12:08:30+00'), false, '預算 30：用了 18.1 沒有降級');
select public.admin_update_config((select admin from u), null, null, null, 18);
select is(pg_temp.guard((select g from u), '2026-06-01 00:00:00+00'), 'ok', '跨月：新的一個月從 0 開始');
select pg_temp.rec((select whale from u), 14.5, '2026-06-02 00:00:00+00');
select is(pg_temp.alerts(null, 'budget_80'), 2, '新的月份再用到 80%，再提醒一次');
select public.admin_update_config((select admin from u), null, null, null, 0);
select is(pg_temp.guard((select g from u), '2026-06-03 00:00:00+00'), 'budget_exhausted', '預算 0 等於全部擋下');
select public.admin_update_config((select admin from u), null, null, null, 18);

---------------------------------------------------------------------------
-- 異常偵測：只標記，不擋人
---------------------------------------------------------------------------
-- 重複的輸入：同一個雜湊一小時內 10 次
select is((select count(*)::int from generate_series(0, 8) g, lateral pg_temp.rec((select a from u), 0.001, '2026-07-01 10:00:00+00'::timestamptz + make_interval(mins => g), repeat('a', 32))), 9, '寫了 9 次同樣的輸入');
select is(pg_temp.alerts((select a from u), 'repeated_input'), 0, '9 次還不算');
select pg_temp.rec((select a from u), 0.001, '2026-07-01 10:09:00+00', repeat('a', 32));
select is(pg_temp.alerts((select a from u), 'repeated_input'), 1, '第 10 次標記重複輸入');
select pg_temp.rec((select a from u), 0.001, '2026-07-01 10:10:00+00', repeat('a', 32));
select is(pg_temp.alerts((select a from u), 'repeated_input'), 1, '同一小時不重複標記');
select is(pg_temp.guard((select a from u), '2026-07-01 10:11:00+00'), 'ok', '標記之後仍然不擋人');
-- 不同的輸入不算重複
select is((select count(*)::int from generate_series(0, 14) g, lateral pg_temp.rec((select b from u), 0.001, '2026-07-01 10:00:00+00'::timestamptz + make_interval(mins => g), lpad(g::text, 32, '0'))), 15, '15 次各不相同的輸入');
select is(pg_temp.alerts((select b from u), 'repeated_input'), 0, '不同的輸入不標記');

-- 輸入長度一直貼著上限：連續 10 次 ≥ 95%
select is((select count(*)::int from generate_series(0, 8) g, lateral pg_temp.rec((select c from u), 0.001, '2026-07-02 10:00:00+00'::timestamptz + make_interval(mins => g), lpad(g::text, 32, '1'), 100)), 9, '連續 9 次貼著上限');
select is(pg_temp.alerts((select c from u), 'oversized_input'), 0, '9 次還不算');
select pg_temp.rec((select c from u), 0.001, '2026-07-02 10:09:00+00', lpad('9', 32, '1'), 97);
select is(pg_temp.alerts((select c from u), 'oversized_input'), 1, '連續 10 次標記輸入過長');
select is((select count(*)::int from generate_series(0, 4) g, lateral pg_temp.rec((select e from u), 0.001, '2026-07-02 10:00:00+00'::timestamptz + make_interval(mins => g), lpad(g::text, 32, '2'), 100)), 5, 'e：前 5 次貼著上限');
select pg_temp.rec((select e from u), 0.001, '2026-07-02 10:05:00+00', lpad('a', 32, '3'), 20);
select is((select count(*)::int from generate_series(6, 14) g, lateral pg_temp.rec((select e from u), 0.001, '2026-07-02 10:00:00+00'::timestamptz + make_interval(mins => g), lpad(g::text, 32, '4'), 100)), 9, 'e：中間夾一次正常長度，之後又 9 次');
select is(pg_temp.alerts((select e from u), 'oversized_input'), 0, '中間夾了正常的就不算連續');

-- 多個裝置同時大量呼叫：10 分鐘內 20 次、3 個以上 session
select is((select count(*)::int from generate_series(0, 18) g, lateral pg_temp.rec((select f from u), 0.001, '2026-07-03 10:00:00+00'::timestamptz + make_interval(secs => g * 10), lpad(g::text, 32, '5'), 10, 's' || (g % 3))), 19, 'f：19 次、3 個裝置');
select is(pg_temp.alerts((select f from u), 'multi_device_burst'), 0, '19 次還不算');
select pg_temp.rec((select f from u), 0.001, '2026-07-03 10:03:10+00', lpad('a', 32, '5'), 10, 's0');
select is(pg_temp.alerts((select f from u), 'multi_device_burst'), 1, '20 次、3 個裝置標記');
select is((select count(*)::int from generate_series(0, 24) g, lateral pg_temp.rec((select g from u), 0.001, '2026-07-03 10:00:00+00'::timestamptz + make_interval(secs => g * 10), lpad(g::text, 32, '6'), 10, 's' || (g % 2))), 25, 'g：25 次但只有 2 個裝置');
select is(pg_temp.alerts((select g from u), 'multi_device_burst'), 0, '同一人只用兩個裝置不標記');

---------------------------------------------------------------------------
-- 後台函式
---------------------------------------------------------------------------
select throws_ok($$select public.admin_get_ai_usage((select a from u))$$, '42501', 'forbidden', '一般使用者不能看用量');
select throws_ok($$select public.admin_update_ai_protection((select a from u), (select ai_protection from public.app_config))$$, '42501', 'forbidden', '一般使用者不能改保護數值');
select throws_ok($$select public.admin_set_user_ai_paused((select a from u), (select b from u), true)$$, '42501', 'forbidden', '一般使用者不能暫停別人');

select is((public.admin_get_ai_protection((select admin from u)) #>> '{console,hard_cap_usd}')::numeric, 20::numeric, '讀取資料有 Console 硬上限 20');
select is((public.admin_get_ai_protection((select admin from u)) #>> '{console,margin_usd}')::numeric, 2::numeric, '和預算 18 的差距 2');
select is((public.admin_get_ai_protection((select admin from u)) #>> '{console,budget_within_cap}')::boolean, true, '預算在硬上限之內');

select throws_ok($$select public.admin_update_ai_protection((select admin from u), '{"schemaVersion":1}')$$, '22023', 'invalid_input', '格式不對的保護數值被拒絕');
select throws_ok($$select public.admin_update_ai_protection((select admin from u), jsonb_set((select ai_protection from public.app_config), '{perHour}', '2'))$$, '22023', 'invalid_input', '每小時低於每分鐘被拒絕');
select lives_ok($$select public.admin_update_ai_protection((select admin from u), jsonb_set((select ai_protection from public.app_config), '{perMinute}', '10'))$$, '管理員改每分鐘上限');
select is((select (ai_protection ->> 'perMinute')::int from public.app_config), 10, '設定已更新');
select is((select detail -> 'before' ->> 'perMinute' from public.admin_audit_logs where action = 'ai_protection.update'), '6', '操作紀錄有修改前的值');
select public.admin_update_ai_protection((select admin from u), jsonb_set((select ai_protection from public.app_config), '{perMinute}', '6'));

select is(public.admin_set_user_fair_use((select admin from u), (select b from u), 4, null) ->> 'daily_usd', '4', '設個人每日上限');
select is(public.admin_set_user_fair_use((select admin from u), (select b from u), null, 9) ->> 'monthly_usd', '9', '只改每月，每日保留');
select is((select fair_use_override ->> 'daily_usd' from public.entitlements where user_id = (select b from u)), '4', '每日沒有被蓋掉');
select is((select detail ->> 'after' from public.admin_audit_logs where action = 'user.fair_use' order by id desc limit 1) is not null, true, '操作紀錄有寫');
select is(public.admin_set_user_fair_use((select admin from u), (select b from u), null, null, true), null, '清除個人覆寫');
select throws_ok($$select public.admin_set_user_fair_use((select admin from u), (select b from u))$$, '22023', 'invalid_input', '什麼都沒改被拒絕');
select throws_ok($$select public.admin_set_user_fair_use((select admin from u), (select b from u), -1)$$, '22023', 'invalid_input', '負數被拒絕');
select throws_ok($$select public.admin_set_user_fair_use((select admin from u), private.uuid_v7(), 1)$$, 'P0002', 'user_not_found', '找不到使用者');

select public.admin_set_user_ai_paused((select admin from u), (select b from u), true);
select is((select ai_paused from public.user_profiles where user_id = (select b from u)), true, '暫停 AI');
select is((public.ai_get_context((select b from u)) ->> 'ai_paused')::boolean, true, 'ai 函式讀得到暫停');
select is((select count(*)::int from public.admin_audit_logs where action = 'user.ai_pause' and target_id = (select b::text from u)), 1, '暫停有操作紀錄');
select public.admin_set_user_ai_paused((select admin from u), (select b from u), false);
select is((select count(*)::int from public.admin_audit_logs where action = 'user.ai_resume'), 1, '恢復有操作紀錄');

select is((select jsonb_array_length(public.admin_list_ai_alerts((select admin from u)))), (select count(*)::int from public.ai_usage_alerts where resolved_at is null), '未處理的清單');
select is((select (public.admin_list_ai_alerts((select admin from u), 'open', 1)) -> 0 ->> 'kind') is not null, true, '清單有內容，可限制筆數');
select is((select jsonb_array_length(public.admin_list_ai_alerts((select admin from u), 'open', 2))), 2, '限制筆數');
select public.admin_resolve_ai_alert((select admin from u), (select id from public.ai_usage_alerts where kind = 'fair_use_daily' limit 1), 'override_raised');
select is((select jsonb_array_length(public.admin_list_ai_alerts((select admin from u), 'resolved'))), 1, '已處理的清單');
select is((select count(*)::int from public.admin_audit_logs where action = 'ai_alert.resolve'), 1, '處理有操作紀錄');
select throws_ok($$select public.admin_resolve_ai_alert((select admin from u), private.uuid_v7(), 'ok')$$, 'P0002', 'alert_not_found', '找不到異常');
select throws_ok($$select public.admin_resolve_ai_alert((select admin from u), (select id from public.ai_usage_alerts limit 1), 'bogus')$$, '22023', 'invalid_input', '處理方式不認得');

select is((public.admin_get_ai_usage((select admin from u), '2026-05-15 00:00:00+00') ->> 'spent_usd')::numeric, 18.1::numeric, '五月累計');
select is(public.admin_get_ai_usage((select admin from u), '2026-05-15 00:00:00+00') ->> 'state', 'exhausted', '五月預算用完');
select is((public.admin_get_ai_usage((select admin from u), '2026-05-15 00:00:00+00') #>> '{console,spent_vs_cap_ratio}')::numeric, 0.905::numeric, '對照 Console 硬上限 20 的比例');
select is((public.admin_get_ai_usage((select admin from u), '2026-05-15 00:00:00+00') -> 'top_users' -> 0 ->> 'display_name'), 'whale', '本月用量排行');
select is((public.admin_get_ai_usage((select admin from u), '2026-05-15 00:00:00+00') -> 'by_task' -> 0 ->> 'task'), 'chat', '依任務與模型拆分');

---------------------------------------------------------------------------
-- 輸出檢查的結果（M1a-10b）：只記代號，補在最近一筆還沒有結果的紀錄上
---------------------------------------------------------------------------
select pg_temp.rec((select a from u), 0.01, now());
select public.ai_record_outcome((select a from u), 'chat', 'rewritten');
select is((select count(*)::int from public.ai_usage_records where user_id = (select a from u) and outcome = 'rewritten'), 1, '結果補在最近一筆');
select pg_temp.rec((select a from u), 0.01, now());
select public.ai_record_outcome((select a from u), 'chat', 'blocked');
select is((select count(*)::int from public.ai_usage_records where user_id = (select a from u) and outcome = 'blocked'), 1, '下一筆記成被擋下，前一筆不被蓋掉');
select is((select count(*)::int from public.ai_usage_records where user_id = (select a from u) and outcome = 'rewritten'), 1, '已經有結果的不會被改');
select throws_ok($$select public.ai_record_outcome((select a from u), 'chat', 'whatever')$$, '22023', null, '結果代號只能是清單內的');
set local role authenticated;
select throws_ok($$select public.ai_record_outcome(gen_random_uuid(), 'chat', 'passed')$$, '42501', null, '使用者不能寫結果');
reset role;

---------------------------------------------------------------------------
-- 每日維護
---------------------------------------------------------------------------
select pg_temp.rec((select a from u), 0.01, now() - interval '14 months');
select private.purge_old_ai_usage();
---------------------------------------------------------------------------
-- 用量頁（M1a-13）：輸出檢查的結果依任務拆分、使用者清單帶出暫停與個人上限
---------------------------------------------------------------------------
create function pg_temp.chat_row(p_usage jsonb) returns jsonb
language sql as $$ select e from jsonb_array_elements(p_usage -> 'by_task') e where e ->> 'task' = 'chat' limit 1 $$;
select is((pg_temp.chat_row(public.admin_get_ai_usage((select admin from u))) ->> 'blocked')::int, 1, '本月 chat 被擋下 1 次');
select is((pg_temp.chat_row(public.admin_get_ai_usage((select admin from u))) ->> 'rewritten')::int, 1, '本月 chat 重寫後通過 1 次');
select is((pg_temp.chat_row(public.admin_get_ai_usage((select admin from u))) ->> 'passed')::int, 0, '本月 chat 沒有第一次就通過的');
select is((pg_temp.chat_row(public.admin_get_ai_usage((select admin from u), '2026-05-15 00:00:00+00')) ->> 'blocked')::int, 0, '五月沒有結果代號');
select is(public.admin_get_ai_usage((select admin from u), '2026-04-10 00:00:00+00') ->> 'month', '2026-04', '可以看指定的月份');
select is(public.admin_get_ai_usage((select admin from u), '2026-04-10 00:00:00+00') -> 'by_task', '[]'::jsonb, '沒有用量的月份是空清單');

select public.admin_set_user_ai_paused((select admin from u), (select a from u), true);
select public.admin_set_user_fair_use((select admin from u), (select a from u), 2, null);
select is((select e ->> 'ai_paused' from jsonb_array_elements(public.admin_list_users((select admin from u))) e where e ->> 'user_id' = (select a::text from u)), 'true', '使用者清單帶出 AI 暫停');
select is((select e -> 'fair_use_override' ->> 'daily_usd' from jsonb_array_elements(public.admin_list_users((select admin from u))) e where e ->> 'user_id' = (select a::text from u)), '2', '使用者清單帶出個人每日上限');
select is((select e -> 'fair_use_override' from jsonb_array_elements(public.admin_list_users((select admin from u))) e where e ->> 'user_id' = (select c::text from u)), 'null'::jsonb, '沒有覆寫的是 null');
select public.admin_set_user_ai_paused((select admin from u), (select a from u), false);
select public.admin_set_user_fair_use((select admin from u), (select a from u), null, null, true);

select is((select count(*)::int from public.ai_usage_records where created_at < now() - interval '13 months'), 0, '13 個月前的明細被清掉');
select is((select count(*)::int from public.ai_rate_counters where window_start < now() - interval '2 days'), 0, '過期的速率計數被清掉');

select * from finish();
rollback;
