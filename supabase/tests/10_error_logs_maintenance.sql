-- 錯誤紀錄（ADR-21）、每日維護排程、app_config 補齊的欄位（16 第三、九節）
begin;
select plan(30);

select tests.create_user('owner@zhusha.test') as owner \gset
select tests.create_user('stranger@zhusha.test') as stranger \gset

---------------------------------------------------------------------------
-- 錯誤紀錄：使用者只能經 log_error 寫入，不能直接讀寫
---------------------------------------------------------------------------
select tests.login_as(:'owner');
select lives_ok(
  $$select public.log_error('photo_upload_failed', 'recipe_editor', 'warning', '0.1.0', 'ios')$$,
  '登入的人可以回報錯誤');
select throws_ok($$select count(*) from public.error_logs$$, '42501', null, '不能直接讀錯誤紀錄');
select throws_ok(
  $$insert into public.error_logs (source, kind, location, severity) values ('client', 'x', 'y', 'info')$$,
  '42501', null, '不能直接寫錯誤紀錄');
select tests.logout();

select is((select count(*)::int from public.error_logs), 1, '寫進一筆');
select is(
  (select source from public.error_logs), 'client', '手機回報的來源固定是 client');
select is(
  (select analytics_id from public.error_logs), null, 'M0 還沒有分析 ID，不記任何身分');

-- 同一種錯誤一小時內只記一筆、累加次數
select tests.login_as(:'owner');
select public.log_error('photo_upload_failed', 'recipe_editor', 'warning', '0.1.0', 'ios');
select public.log_error('photo_upload_failed', 'recipe_editor', 'warning', '0.1.0', 'ios');
select tests.logout();
select is((select count(*)::int from public.error_logs), 1, '同一種錯誤不洗版');
select is((select count from public.error_logs), 3, '次數累加');

-- 不同的錯誤各記一筆
select tests.login_as(:'stranger');
select public.log_error('photo_upload_failed', 'kitchen_page', 'warning', '0.1.0', 'ios');
select public.log_error('rls_denied', 'recipe_editor', 'warning', '0.1.0', 'ios');
select tests.logout();
select is((select count(*)::int from public.error_logs), 3, '畫面或類型不同就是另一筆');

-- 超過一小時就另開一筆
update public.error_logs set first_at = now() - interval '2 hours', last_at = now() - interval '2 hours'
  where kind = 'photo_upload_failed' and location = 'recipe_editor';
select tests.login_as(:'owner');
select public.log_error('photo_upload_failed', 'recipe_editor', 'warning', '0.1.0', 'ios');
select tests.logout();
select is((select count(*)::int from public.error_logs where kind = 'photo_upload_failed' and location = 'recipe_editor'), 2,
  '超過一小時重新記一筆');

-- 輸入檢查
select tests.login_as(:'owner');
select throws_ok($$select public.log_error('Bad Kind!', 'x', 'info', null, null)$$, '22023', null, '錯誤類型只能是小寫英數與底線');
select throws_ok($$select public.log_error('ok_kind', repeat('a', 101), 'info', null, null)$$, '22023', null, '畫面名稱太長');
select throws_ok($$select public.log_error('ok_kind', 'x', 'fatal', null, null)$$, '22023', null, '嚴重程度不在清單內');
select throws_ok($$select public.log_error('ok_kind', 'x', 'info', null, 'windows')$$, '22023', null, '平台不在清單內');
select tests.logout();

-- 未登入不能呼叫
set local role anon;
select throws_ok($$select public.log_error('ok_kind', 'x', 'info', null, null)$$, '42501', null, '未登入不能回報');
reset role;

-- 單小時的手機回報有上限，避免被灌爆
insert into public.error_logs (source, kind, location, severity, first_at, last_at)
  select 'client', 'flood_' || i, 'x', 'info', now(), now() from generate_series(1, 200) i;
select tests.login_as(:'owner');
select public.log_error('one_more', 'x', 'info', null, null);
select tests.logout();
select is((select count(*)::int from public.error_logs where kind = 'one_more'), 0, '一小時內手機回報的種類超過上限就不再記');

---------------------------------------------------------------------------
-- 每日維護
---------------------------------------------------------------------------
select ok(
  exists (select 1 from cron.job where jobname = 'daily-maintenance' and schedule = '0 19 * * *'),
  '每天台灣時間凌晨 3 點跑每日維護');

delete from public.error_logs;
insert into public.error_logs (source, kind, location, severity, first_at, last_at) values
  ('client', 'old_one', 'x', 'info', now() - interval '91 days', now() - interval '91 days'),
  ('client', 'old_but_recent', 'x', 'info', now() - interval '100 days', now() - interval '10 days'),
  ('client', 'new_one', 'x', 'info', now(), now());

select tests.kitchen_of(:'owner') as k1 \gset
insert into public.pantry_items (id, kitchen_id, raw_name, zone, added_on, status, removed_at)
  values (private.uuid_v7(), :'k1', '舊的蔥', 'fridge', current_date - 60, 'removed', now() - interval '31 days'),
         (private.uuid_v7(), :'k1', '新的蔥', 'fridge', current_date, 'active', null);

-- 一個已經到期、一個還在保留期內的軟刪除廚房
select private.uuid_v7() as k_old \gset
select private.uuid_v7() as k_new \gset
insert into public.kitchens (id, name, timezone, region, deleted_at) values
  (:'k_old', '舊廚房', 'Asia/Taipei', 'TW', now() - interval '31 days'),
  (:'k_new', '剛刪的廚房', 'Asia/Taipei', 'TW', now() - interval '2 days');
insert into public.pantry_items (id, kitchen_id, raw_name, zone, added_on)
  values (private.uuid_v7(), :'k_old', '舊廚房的蔥', 'fridge', current_date);
select private.uuid_v7() as r_old \gset
insert into public.recipes (id, user_id, kitchen_id, title, status)
  values (:'r_old', :'owner', :'k_old', '舊廚房煮的菜', 'draft');

select lives_ok($$select private.run_daily_maintenance()$$, '每日維護可以跑');
select is((select count(*)::int from public.kitchens where id = :'k_old'), 0, '清掉到期的廚房');
select is((select count(*)::int from public.pantry_items where raw_name = '舊廚房的蔥'), 0, '廚房的食材跟著刪');
select is((select kitchen_id from public.recipes where id = :'r_old'), null, '食譜留下，只是不再屬於那個廚房');
select is((select count(*)::int from public.kitchens where id = :'k_new'), 1, '還在保留期內的廚房不動');
select is((select count(*)::int from public.pantry_items where raw_name = '舊的蔥'), 0, '清掉移除超過 30 天的食材');
select is((select count(*)::int from public.pantry_items where raw_name = '新的蔥'), 1, '沒過期的食材不動');
select is((select count(*)::int from public.error_logs where kind = 'old_one'), 0, '清掉超過 90 天的錯誤紀錄');
select is((select count(*)::int from public.error_logs where kind in ('old_but_recent', 'new_one')), 2, '最近還有發生的錯誤紀錄不動');
select is(
  (select count(*)::int from public.error_logs where source = 'cron' and kind = 'daily_maintenance_ok' and severity = 'info'),
  1, '執行結果寫進錯誤紀錄');

---------------------------------------------------------------------------
-- app_config 補齊的欄位
---------------------------------------------------------------------------
select is((select registration_mode from public.app_config), 'invite_only', '預設只能被邀請註冊');
select is((select max_users from public.app_config), 30, '預設人數上限 30');
select throws_ok($$update public.app_config set registration_mode = 'anyone'$$, '23514', null, '註冊方式只能是清單內的值');

select * from finish();
rollback;
