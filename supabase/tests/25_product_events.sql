-- 產品事件與分析 ID（M1a-11）：兩張表一般使用者讀寫不了、註冊會建分析 ID、
-- 寫入函式只收白名單的名稱、不參與統計就整批不記、刪除帳號後事件對不回人
begin;
select plan(22);

select tests.create_user('alice@zhusha.test') as alice \gset
select tests.create_user('bob@zhusha.test') as bob \gset
select private.uuid_v7() as s1 \gset

-- 模擬雲端：服務權限對資料表沒有預設的讀寫權限
revoke all on all tables in schema public from service_role;

---------------------------------------------------------------------------
-- 註冊時建立分析 ID（init_first_admin 也走 setup_new_user）
---------------------------------------------------------------------------
select is((select count(*)::int from public.analytics_identities where user_id = :'alice'), 1, 'setup_new_user 建分析 ID');
select isnt((select analytics_id from public.analytics_identities where user_id = :'alice'),
            (select analytics_id from public.analytics_identities where user_id = :'bob'), '每人一組不同的分析 ID');

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', private.uuid_v7(), 'authenticated', 'authenticated', 'admin@zhusha.test', '{}', '{}', now(), now());
select private.init_first_admin('admin@zhusha.test');
select is((select count(*)::int from public.analytics_identities a join auth.users u on u.id = a.user_id where u.email = 'admin@zhusha.test'), 1, 'init_first_admin 也建分析 ID');

---------------------------------------------------------------------------
-- 一般使用者讀寫不了兩張表、也呼叫不了寫入函式
---------------------------------------------------------------------------
select tests.login_as(:'alice');
select throws_ok($$select count(*) from public.analytics_identities$$, '42501', null, '讀不到分析 ID 對照');
select throws_ok($$select count(*) from public.product_events$$, '42501', null, '讀不到事件');
select throws_ok($$insert into public.product_events (analytics_id, session_id, name, app_version, platform, installed, at)
  values (gen_random_uuid(), gen_random_uuid(), 'app.open', '1', 'ios', true, now())$$, '42501', null, '不能直接寫事件');
select throws_ok($$update public.analytics_identities set analytics_id = gen_random_uuid()$$, '42501', null, '不能改對照');
select throws_ok(
  format($$select public.track_events(%L, '1', 'ios', true, '[]')$$, :'alice'), '42501', null, '一般使用者不能呼叫寫入函式');
select tests.logout();

select tests.login_as(:'bob');
select throws_ok($$select count(*) from public.product_events$$, '42501', null, '別人也讀不到');
select tests.logout();

---------------------------------------------------------------------------
-- 寫入函式（服務權限）
---------------------------------------------------------------------------
set local role service_role;
select is(
  public.track_events(:'alice', '0.1.0', 'ios', true,
    format('[{"name":"app.open","sessionId":"%s","at":"2026-11-22T01:00:00Z"},
             {"name":"record.start","sessionId":"%s","screen":"record","props":{"entry":"plus"},"at":"2026-11-22T01:00:05Z"}]', :'s1', :'s1')::jsonb),
  2, '寫進兩筆');
select throws_ok(
  format($$select public.track_events(%L, '0.1.0', 'ios', true,
    '[{"name":"app.hack","sessionId":"%s","at":"2026-11-22T01:00:00Z"}]'::jsonb)$$, :'alice', :'s1'),
  '22023', null, '名稱不在白名單就拒絕');
select throws_ok(
  format($$select public.track_events(%L, '0.1.0', 'ios', true,
    '[{"name":"app.open","sessionId":"%s","props":{"note":"hello world and a long text that is way over thirty-two chars"},"at":"2026-11-22T01:00:00Z"}]'::jsonb)$$, :'alice', :'s1'),
  '23514', null, '屬性值太長的自由文字被資料表擋下');
select throws_ok(
  format($$select public.track_events(%L, '0.1.0', 'ios', true,
    '[{"name":"app.open","sessionId":"%s","props":{"obj":{"a":1}},"at":"2026-11-22T01:00:00Z"}]'::jsonb)$$, :'alice', :'s1'),
  '23514', null, '屬性不能是物件');
reset role;

select is((select count(*)::int from public.product_events), 2, '被拒絕的整批都沒寫進去');
select is((select props from public.product_events where name = 'record.start'), '{"schemaVersion":1,"entry":"plus"}'::jsonb, '屬性帶 schemaVersion');
select is((select count(*)::int from public.product_events e join public.analytics_identities a using (analytics_id) where a.user_id = :'alice'), 2, '事件記的是分析 ID，對得回對照');
select ok(not exists (select 1 from information_schema.columns where table_name = 'product_events' and column_name in ('user_id', 'suggestion_id')), '事件表沒有使用者 ID 與點子 ID');

-- 丟掉的事件：記進錯誤紀錄，只有代號與數量
set local role service_role;
select public.track_events(:'alice', '0.1.0', 'ios', true, '[]', 3);
reset role;
select is((select count from public.error_logs where kind = 'track_event_dropped'), 3, '丟掉的事件數量記進錯誤紀錄');

-- 不參與使用統計：整批不記
update public.user_settings set analytics_opt_out = true where user_id = :'bob';
set local role service_role;
select is(
  public.track_events(:'bob', '0.1.0', 'ios', true,
    format('[{"name":"app.open","sessionId":"%s","at":"2026-11-22T01:00:00Z"}]', :'s1')::jsonb),
  0, '關閉使用統計的人不記');
reset role;
select is((select count(*)::int from public.product_events), 2, 'bob 的事件沒進去');

-- 刪除帳號：對照跟著刪（on delete cascade），事件不設外鍵、留下但對不回人
select is((select confdeltype::text from pg_constraint where conrelid = 'public.analytics_identities'::regclass and contype = 'f'), 'c', '刪帳號時對照一起刪');
select is((select count(*)::int from pg_constraint where conrelid = 'public.product_events'::regclass and contype = 'f'), 0, '事件沒有外鍵，帳號刪了事件留下');

select * from finish();
rollback;
