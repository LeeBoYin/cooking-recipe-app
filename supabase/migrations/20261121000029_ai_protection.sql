-- M1a-04：AI 用量保護——用量紀錄、每月累計、速率計數、異常清單、全站預算降級、後台函式。
-- 「天」與「月」一律用 UTC 切（和 Anthropic 的帳單月一致）。不存使用者輸入與 AI 的回應，只存輸入的雜湊與長度比例。

---------------------------------------------------------------------------
-- 〇、操作紀錄的時間用 clock_timestamp()：同一個交易裡的多筆紀錄也有先後，「新的在前」才穩定
---------------------------------------------------------------------------

alter table public.admin_audit_logs alter column created_at set default clock_timestamp();

---------------------------------------------------------------------------
-- 一、ai_protection 的格式（schemaVersion 1）與預設值
---------------------------------------------------------------------------

create function private.ai_protection_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "properties": {
        "schemaVersion": { "enum": [1] },
        "perMinute": { "type": "integer", "minimum": 1, "maximum": 600 },
        "perHour": { "type": "integer", "minimum": 1, "maximum": 6000 },
        "fairUse": {
          "type": "object",
          "properties": {
            "free": { "$ref": "#/$defs/limit" },
            "plus": { "$ref": "#/$defs/limit" }
          },
          "required": ["free", "plus"],
          "additionalProperties": false
        },
        "anomaly": {
          "type": "object",
          "properties": {
            "rateBlockAlerts": { "type": "integer", "minimum": 1, "maximum": 10000 },
            "repeatedInputCount": { "type": "integer", "minimum": 2, "maximum": 10000 },
            "oversizedStreak": { "type": "integer", "minimum": 2, "maximum": 1000 },
            "oversizedRatio": { "type": "number", "minimum": 0.5, "maximum": 1 },
            "burstCalls": { "type": "integer", "minimum": 2, "maximum": 10000 },
            "burstDevices": { "type": "integer", "minimum": 2, "maximum": 100 },
            "burstWindowMinutes": { "type": "integer", "minimum": 1, "maximum": 1440 }
          },
          "required": ["rateBlockAlerts", "repeatedInputCount", "oversizedStreak", "oversizedRatio", "burstCalls", "burstDevices", "burstWindowMinutes"],
          "additionalProperties": false
        },
        "consoleHardCapUsd": { "type": "number", "minimum": 0, "maximum": 100000 }
      },
      "required": ["schemaVersion", "perMinute", "perHour", "fairUse", "anomaly", "consoleHardCapUsd"],
      "additionalProperties": false,
      "$defs": {
        "limit": {
          "type": "object",
          "properties": {
            "dailyUsd": { "type": "number", "minimum": 0, "maximum": 100000 },
            "monthlyUsd": { "type": "number", "minimum": 0, "maximum": 100000 }
          },
          "required": ["dailyUsd", "monthlyUsd"],
          "additionalProperties": false
        }
      }
    }'::json,
    p
  )
  -- 跨欄位：每小時不低於每分鐘、每月不低於每日
  and (p ->> 'perHour')::numeric >= (p ->> 'perMinute')::numeric
  and (p #>> '{fairUse,free,monthlyUsd}')::numeric >= (p #>> '{fairUse,free,dailyUsd}')::numeric
  and (p #>> '{fairUse,plus,monthlyUsd}')::numeric >= (p #>> '{fairUse,plus,dailyUsd}')::numeric;
$$;

-- 預設值（理由見 03〈用量保護〉）：正常一人一個月約 US$0.6；免費方案每日 1.5、每月 5，付費方案每日 3、每月 10
create function private.ai_protection_default()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "schemaVersion": 1,
    "perMinute": 6,
    "perHour": 60,
    "fairUse": {
      "free": { "dailyUsd": 1.5, "monthlyUsd": 5 },
      "plus": { "dailyUsd": 3, "monthlyUsd": 10 }
    },
    "anomaly": {
      "rateBlockAlerts": 10,
      "repeatedInputCount": 10,
      "oversizedStreak": 10,
      "oversizedRatio": 0.95,
      "burstCalls": 20,
      "burstDevices": 3,
      "burstWindowMinutes": 10
    },
    "consoleHardCapUsd": 20
  }'::jsonb;
$$;

update public.app_config set ai_protection = private.ai_protection_default();
alter table public.app_config alter column ai_protection set default private.ai_protection_default();
alter table public.app_config add constraint ai_protection_format check (private.ai_protection_valid(ai_protection));

---------------------------------------------------------------------------
-- 二、資料表（都只有後端函式能讀寫：沒有任何角色能直接存取）
---------------------------------------------------------------------------

-- 每次呼叫 Claude 一筆；保留 13 個月（每日維護清）
create table public.ai_usage_records (
  id uuid primary key default private.uuid_v7() check (private.is_uuid_v7(id)),
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null check (task ~ '^[a-z_]+$' and char_length(task) <= 40),
  model text not null check (char_length(model) <= 60),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd numeric(14, 8) not null check (cost_usd >= 0),
  ok boolean not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  -- 異常偵測用：輸入的 SHA-256 前 32 碼、輸入長度占上限的百分比、登入工作階段（代表一個裝置）。不存內容。
  input_hash text check (input_hash is null or input_hash ~ '^[0-9a-f]{32}$'),
  input_ratio smallint check (input_ratio is null or input_ratio between 0 and 100),
  session_id text check (session_id is null or char_length(session_id) <= 64),
  created_at timestamptz not null default now()
);
create index ai_usage_records_user_time on public.ai_usage_records (user_id, created_at desc);
create index ai_usage_records_time on public.ai_usage_records (created_at);

-- 本月累計：全站一列（scope = global）、每人一列（scope = user）；呼叫後用原子更新加上去
create table public.ai_spend_monthly (
  id uuid primary key default private.uuid_v7(),
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  scope text not null check (scope in ('global', 'user')),
  user_id uuid references auth.users (id) on delete cascade,
  total_usd numeric(14, 8) not null default 0 check (total_usd >= 0),
  call_count integer not null default 0 check (call_count >= 0),
  updated_at timestamptz not null default now(),
  check ((scope = 'global') = (user_id is null))
);
create unique index ai_spend_monthly_key on public.ai_spend_monthly (month, scope, user_id) nulls not distinct;

-- 速率計數：每人每分鐘、每小時各一列；過期的由每日維護刪除
create table public.ai_rate_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket in ('minute', 'hour')),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  blocked integer not null default 0 check (blocked >= 0),
  primary key (user_id, bucket, window_start)
);

-- 異常使用與預算提醒（user_id 為空 = 全站的提醒）；dedupe_key 讓同一件事不重複寫
create table public.ai_usage_alerts (
  id uuid primary key default private.uuid_v7() check (private.is_uuid_v7(id)),
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'rate_limited', 'fair_use_daily', 'fair_use_monthly', 'repeated_input', 'oversized_input', 'multi_device_burst',
    'budget_80', 'budget_100'
  )),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text check (resolution in ('ok', 'override_raised', 'ai_paused')),
  check ((resolved_at is null) = (resolution is null))
);
create index ai_usage_alerts_time on public.ai_usage_alerts (created_at desc, id desc);

alter table public.ai_usage_records enable row level security;
alter table public.ai_spend_monthly enable row level security;
alter table public.ai_rate_counters enable row level security;
alter table public.ai_usage_alerts enable row level security;
revoke all on public.ai_usage_records, public.ai_spend_monthly, public.ai_rate_counters, public.ai_usage_alerts
  from public, anon, authenticated, service_role;

---------------------------------------------------------------------------
-- 三、檢查與紀錄（只給服務權限，由 ai 函式呼叫）
---------------------------------------------------------------------------

create function private.ai_raise_alert(p_user uuid, p_kind text, p_dedupe text, p_detail jsonb, p_now timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage_alerts (user_id, kind, detail, dedupe_key, created_at)
    values (p_user, p_kind, coalesce(p_detail, '{}'::jsonb), p_dedupe, p_now)
    on conflict (dedupe_key) do nothing;
$$;
revoke execute on function private.ai_raise_alert(uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;

-- 全站本月的狀態：ok／degraded（用到提醒門檻）／exhausted（用完）
create function private.ai_budget_state(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'spent_usd', s.spent,
    'budget_usd', c.ai_monthly_budget_usd,
    'ratio', case when c.ai_monthly_budget_usd > 0 then round(s.spent / c.ai_monthly_budget_usd, 4) else 1 end,
    'state', case
      when c.ai_monthly_budget_usd <= 0 or s.spent >= c.ai_monthly_budget_usd then 'exhausted'
      when s.spent >= c.ai_monthly_budget_usd * c.ai_budget_alert_ratio then 'degraded'
      else 'ok' end
  )
  from public.app_config c
  cross join lateral (
    select coalesce((select m.total_usd from public.ai_spend_monthly m
      where m.month = to_char(p_now at time zone 'utc', 'YYYY-MM') and m.scope = 'global'), 0) as spent
  ) s;
$$;
revoke execute on function private.ai_budget_state(timestamptz) from public, anon, authenticated;

-- 背景任務在排隊前先問：這個月預算還能不能呼叫 AI（回 ok／degraded／exhausted）
create function public.ai_budget_state()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.ai_budget_state(now()) ->> 'state';
$$;
revoke execute on function public.ai_budget_state() from public, anon, authenticated;
grant execute on function public.ai_budget_state() to service_role;

-- 呼叫 Claude 之前的檢查，順序：全站預算 → 每人每日／每月上限 → 速率（原子計數）
-- 回傳 { verdict: ok | budget_exhausted | over_limit | rate_limited, degraded: boolean }
-- 背景任務（p_background）不算速率，因為是使用者的操作觸發的，不是連點；其餘照算。
-- p_now 只有測試會帶。
create function public.ai_guard_check(
  p_user uuid,
  p_background boolean default false,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.app_config;
  v_prot jsonb;
  v_budget jsonb;
  v_month text := to_char(p_now at time zone 'utc', 'YYYY-MM');
  v_day_start timestamptz := date_trunc('day', p_now at time zone 'utc') at time zone 'utc';
  v_plan text;
  v_override jsonb;
  v_daily_limit numeric;
  v_monthly_limit numeric;
  v_daily numeric;
  v_monthly numeric;
  v_hour_start timestamptz := date_trunc('hour', p_now);
  v_minute_start timestamptz := date_trunc('minute', p_now);
  v_count integer;
  v_blocked integer;
begin
  select * into v_cfg from public.app_config c where c.id;
  v_prot := v_cfg.ai_protection;

  -- 1. 全站預算
  v_budget := private.ai_budget_state(p_now);
  if v_budget ->> 'state' = 'exhausted' then
    perform private.ai_raise_alert(null, 'budget_100', 'budget_100:' || v_month,
      jsonb_build_object('spent_usd', v_budget -> 'spent_usd', 'budget_usd', v_budget -> 'budget_usd'), p_now);
    return jsonb_build_object('verdict', 'budget_exhausted', 'degraded', true);
  end if;

  -- 2. 合理使用上限：個人覆寫 → 方案的值
  select coalesce(e.plan, 'free'), e.fair_use_override into v_plan, v_override
    from (select 1) x left join public.entitlements e on e.user_id = p_user;
  v_daily_limit := coalesce((v_override ->> 'daily_usd')::numeric, (v_prot #>> array['fairUse', v_plan, 'dailyUsd'])::numeric);
  v_monthly_limit := coalesce((v_override ->> 'monthly_usd')::numeric, (v_prot #>> array['fairUse', v_plan, 'monthlyUsd'])::numeric);

  select coalesce(sum(r.cost_usd), 0) into v_daily from public.ai_usage_records r
    where r.user_id = p_user and r.created_at >= v_day_start and r.created_at < v_day_start + interval '1 day';
  if v_daily >= v_daily_limit then
    perform private.ai_raise_alert(p_user, 'fair_use_daily', 'fair_use_daily:' || p_user || ':' || to_char(v_day_start, 'YYYY-MM-DD'),
      jsonb_build_object('spent_usd', round(v_daily, 4), 'limit_usd', v_daily_limit), p_now);
    return jsonb_build_object('verdict', 'over_limit', 'degraded', false);
  end if;

  select coalesce((select m.total_usd from public.ai_spend_monthly m
    where m.month = v_month and m.scope = 'user' and m.user_id = p_user), 0) into v_monthly;
  if v_monthly >= v_monthly_limit then
    perform private.ai_raise_alert(p_user, 'fair_use_monthly', 'fair_use_monthly:' || p_user || ':' || v_month,
      jsonb_build_object('spent_usd', round(v_monthly, 4), 'limit_usd', v_monthly_limit), p_now);
    return jsonb_build_object('verdict', 'over_limit', 'degraded', false);
  end if;

  -- 3. 速率：條件式的 upsert。列鎖會讓平行請求排隊，每個請求只會看到最新的計數，不會多算或少算；
  --    超過上限的請求不增加計數（只記被擋的次數）。小時先、分鐘後；分鐘被擋時把小時的還回去。
  if not p_background then
    insert into public.ai_rate_counters as rc (user_id, bucket, window_start, count)
      values (p_user, 'hour', v_hour_start, 1)
      on conflict (user_id, bucket, window_start) do update set count = rc.count + 1
        where rc.count < (v_prot ->> 'perHour')::integer
      returning rc.count into v_count;
    if v_count is null then
      v_blocked := null;
    else
      v_count := null;
      insert into public.ai_rate_counters as rc (user_id, bucket, window_start, count)
        values (p_user, 'minute', v_minute_start, 1)
        on conflict (user_id, bucket, window_start) do update set count = rc.count + 1
          where rc.count < (v_prot ->> 'perMinute')::integer
        returning rc.count into v_count;
      if v_count is not null then
        return jsonb_build_object('verdict', 'ok', 'degraded', v_budget ->> 'state' = 'degraded');
      end if;
      update public.ai_rate_counters rc set count = rc.count - 1
        where rc.user_id = p_user and rc.bucket = 'hour' and rc.window_start = v_hour_start;
    end if;

    -- 被擋：記在小時那一列；一小時內被擋太多次才通知管理員（連點幾下不算）
    update public.ai_rate_counters rc set blocked = rc.blocked + 1
      where rc.user_id = p_user and rc.bucket = 'hour' and rc.window_start = v_hour_start
      returning rc.blocked into v_blocked;
    if v_blocked >= (v_prot #>> '{anomaly,rateBlockAlerts}')::integer then
      perform private.ai_raise_alert(p_user, 'rate_limited', 'rate_limited:' || p_user || ':' || to_char(v_hour_start at time zone 'utc', 'YYYY-MM-DD"T"HH24'),
        jsonb_build_object('blocked', v_blocked), p_now);
    end if;
    return jsonb_build_object('verdict', 'rate_limited', 'degraded', false);
  end if;

  return jsonb_build_object('verdict', 'ok', 'degraded', v_budget ->> 'state' = 'degraded');
end;
$$;
revoke execute on function public.ai_guard_check(uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_guard_check(uuid, boolean, timestamptz) to service_role;

-- 呼叫 Claude 之後：寫用量紀錄、累加每月累計、全站 80%／100% 提醒、異常偵測（只標記，不擋人）
create function public.ai_record_usage(
  p_user uuid,
  p_task text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer,
  p_cache_write_tokens integer,
  p_cost_usd numeric,
  p_ok boolean,
  p_latency_ms integer default null,
  p_input_hash text default null,
  p_input_ratio integer default null,
  p_session_id text default null,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.app_config;
  v_anom jsonb;
  v_month text := to_char(p_now at time zone 'utc', 'YYYY-MM');
  v_budget jsonb;
  v_n integer;
  v_m integer;
  v_thr numeric;
begin
  select * into v_cfg from public.app_config c where c.id;
  v_anom := v_cfg.ai_protection -> 'anomaly';

  insert into public.ai_usage_records (user_id, task, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, ok, latency_ms, input_hash, input_ratio, session_id, created_at)
    values (p_user, p_task, p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens,
      p_cost_usd, p_ok, p_latency_ms, p_input_hash, p_input_ratio, p_session_id, p_now);

  insert into public.ai_spend_monthly as m (month, scope, user_id, total_usd, call_count, updated_at)
    values (v_month, 'user', p_user, p_cost_usd, 1, p_now)
    on conflict (month, scope, user_id) do update
      set total_usd = m.total_usd + excluded.total_usd, call_count = m.call_count + 1, updated_at = p_now;
  insert into public.ai_spend_monthly as m (month, scope, user_id, total_usd, call_count, updated_at)
    values (v_month, 'global', null, p_cost_usd, 1, p_now)
    on conflict (month, scope, user_id) do update
      set total_usd = m.total_usd + excluded.total_usd, call_count = m.call_count + 1, updated_at = p_now;

  -- 全站預算：每個月各提醒一次
  v_budget := private.ai_budget_state(p_now);
  if (v_budget ->> 'state') in ('degraded', 'exhausted') then
    perform private.ai_raise_alert(null, 'budget_80', 'budget_80:' || v_month, v_budget - 'state', p_now);
  end if;
  if v_budget ->> 'state' = 'exhausted' then
    perform private.ai_raise_alert(null, 'budget_100', 'budget_100:' || v_month, v_budget - 'state', p_now);
  end if;

  -- 異常一：同樣的輸入一小時內重複很多次
  if p_input_hash is not null then
    select count(*) into v_n from public.ai_usage_records r
      where r.user_id = p_user and r.input_hash = p_input_hash
        and r.created_at > p_now - interval '1 hour' and r.created_at <= p_now;
    if v_n >= (v_anom ->> 'repeatedInputCount')::integer then
      perform private.ai_raise_alert(p_user, 'repeated_input',
        'repeated_input:' || p_user || ':' || left(p_input_hash, 8) || ':' || to_char(date_trunc('hour', p_now at time zone 'utc'), 'YYYY-MM-DD"T"HH24'),
        jsonb_build_object('count_in_hour', v_n, 'task', p_task), p_now);
    end if;
  end if;

  -- 異常二：最近連續很多次的輸入長度都貼著上限
  v_thr := (v_anom ->> 'oversizedRatio')::numeric * 100;
  if p_input_ratio is not null and p_input_ratio >= v_thr then
    select count(*), count(*) filter (where t.input_ratio >= v_thr) into v_n, v_m from (
      select r.input_ratio from public.ai_usage_records r
        where r.user_id = p_user and r.created_at <= p_now
        order by r.created_at desc, r.id desc
        limit (v_anom ->> 'oversizedStreak')::integer
    ) t;
    if v_n = (v_anom ->> 'oversizedStreak')::integer and v_m = v_n then
      perform private.ai_raise_alert(p_user, 'oversized_input',
        'oversized_input:' || p_user || ':' || to_char(p_now at time zone 'utc', 'YYYY-MM-DD'),
        jsonb_build_object('streak', v_n, 'task', p_task), p_now);
    end if;
  end if;

  -- 異常三：短時間內多個裝置（登入工作階段）同時大量呼叫
  select count(*), count(distinct r.session_id) into v_n, v_m from public.ai_usage_records r
    where r.user_id = p_user and r.created_at > p_now - make_interval(mins => (v_anom ->> 'burstWindowMinutes')::integer)
      and r.created_at <= p_now;
  if v_n >= (v_anom ->> 'burstCalls')::integer and v_m >= (v_anom ->> 'burstDevices')::integer then
    perform private.ai_raise_alert(p_user, 'multi_device_burst',
      'multi_device_burst:' || p_user || ':' || to_char(p_now at time zone 'utc', 'YYYY-MM-DD') || ':'
        || (extract(epoch from p_now)::bigint / (60 * (v_anom ->> 'burstWindowMinutes')::integer)),
      jsonb_build_object('calls', v_n, 'devices', v_m), p_now);
  end if;
end;
$$;
revoke execute on function public.ai_record_usage(uuid, text, text, integer, integer, integer, integer, numeric, boolean, integer, text, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ai_record_usage(uuid, text, text, integer, integer, integer, integer, numeric, boolean, integer, text, integer, text, timestamptz)
  to service_role;

---------------------------------------------------------------------------
-- 四、每日維護：清過期的速率計數與 13 個月前的用量明細（月加總留著）
---------------------------------------------------------------------------

create function private.purge_old_ai_usage()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.ai_rate_counters where window_start < now() - interval '2 days';
  delete from public.ai_usage_records where created_at < now() - interval '13 months';
$$;
revoke execute on function private.purge_old_ai_usage() from public, anon, authenticated;

create or replace function private.run_daily_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step text;
  v_failed boolean := false;
begin
  foreach v_step in array array[
    'purge_removed_pantry_items', 'purge_deleted_recipes', 'purge_deleted_kitchens', 'purge_old_error_logs', 'purge_old_ai_usage'
  ] loop
    begin
      execute format('select private.%I()', v_step);
    exception when others then
      v_failed := true;
      perform private.log_error('cron', 'daily_maintenance_failed', v_step, 'critical');
    end;
  end loop;

  if not v_failed then
    perform private.log_error('cron', 'daily_maintenance_ok', 'daily_maintenance', 'info');
  end if;
end;
$$;

---------------------------------------------------------------------------
-- 五、後台（admin 函式呼叫；寫入都留操作紀錄）
---------------------------------------------------------------------------

create function public.admin_get_ai_protection(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin);
  return (
    select jsonb_build_object(
      'protection', c.ai_protection,
      'ai_monthly_budget_usd', c.ai_monthly_budget_usd,
      'ai_budget_alert_ratio', c.ai_budget_alert_ratio,
      'console', jsonb_build_object(
        'hard_cap_usd', (c.ai_protection ->> 'consoleHardCapUsd')::numeric,
        'budget_usd', c.ai_monthly_budget_usd,
        'margin_usd', (c.ai_protection ->> 'consoleHardCapUsd')::numeric - c.ai_monthly_budget_usd,
        'budget_within_cap', c.ai_monthly_budget_usd <= (c.ai_protection ->> 'consoleHardCapUsd')::numeric
      )
    )
    from public.app_config c
  );
end;
$$;

create function public.admin_update_ai_protection(p_admin uuid, p_protection jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  perform private.assert_admin(p_admin);
  if p_protection is null or not private.ai_protection_valid(p_protection) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select c.ai_protection into v_old from public.app_config c where c.id for update;
  update public.app_config c set ai_protection = p_protection where c.id;
  perform private.audit_admin(p_admin, 'ai_protection.update', 'app_config', null,
    jsonb_build_object('before', v_old, 'after', p_protection));
  return p_protection;
end;
$$;

-- 個人的合理使用上限：只填一邊就只改那一邊；p_clear 回到方案的值
create function public.admin_set_user_fair_use(
  p_admin uuid,
  p_user_id uuid,
  p_daily_usd numeric default null,
  p_monthly_usd numeric default null,
  p_clear boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  perform private.assert_admin(p_admin);
  if not p_clear and p_daily_usd is null and p_monthly_usd is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (p_daily_usd is not null and p_daily_usd not between 0 and 100000)
     or (p_monthly_usd is not null and p_monthly_usd not between 0 and 100000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_profiles p where p.user_id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.entitlements (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select e.fair_use_override into v_old from public.entitlements e where e.user_id = p_user_id for update;
  if p_clear then
    v_new := null;
  else
    v_new := coalesce(v_old, '{}'::jsonb)
      || case when p_daily_usd is null then '{}'::jsonb else jsonb_build_object('daily_usd', p_daily_usd) end
      || case when p_monthly_usd is null then '{}'::jsonb else jsonb_build_object('monthly_usd', p_monthly_usd) end;
  end if;
  update public.entitlements e set fair_use_override = v_new where e.user_id = p_user_id;
  perform private.audit_admin(p_admin, 'user.fair_use', 'user', p_user_id::text,
    jsonb_build_object('before', v_old, 'after', v_new));
  return v_new;
end;
$$;

create function public.admin_set_user_ai_paused(p_admin uuid, p_user_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_profiles;
begin
  perform private.assert_admin(p_admin);
  if p_paused is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_target from public.user_profiles p where p.user_id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  update public.user_profiles p set ai_paused = p_paused where p.user_id = p_user_id;
  perform private.audit_admin(p_admin, case when p_paused then 'user.ai_pause' else 'user.ai_resume' end, 'user', p_user_id::text);
end;
$$;

create function public.admin_list_ai_alerts(
  p_admin uuid,
  p_status text default 'open',
  p_limit integer default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin);
  if p_status not in ('open', 'resolved', 'all') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(t.row order by t.created_at desc, t.id desc)
    from (
      select a.id, a.created_at, jsonb_build_object(
        'id', a.id,
        'user_id', a.user_id,
        'display_name', idn.display_name,
        'ai_paused', p.ai_paused,
        'kind', a.kind,
        'detail', a.detail,
        'created_at', a.created_at,
        'resolved_at', a.resolved_at,
        'resolved_by_name', rn.display_name,
        'resolution', a.resolution
      ) as row
      from public.ai_usage_alerts a
      left join public.user_identities idn on idn.user_id = a.user_id
      left join public.user_profiles p on p.user_id = a.user_id
      left join public.user_identities rn on rn.user_id = a.resolved_by
      where (p_before is null or a.created_at < p_before)
        and case p_status when 'open' then a.resolved_at is null when 'resolved' then a.resolved_at is not null else true end
      order by a.created_at desc, a.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) t
  ), '[]'::jsonb);
end;
$$;

create function public.admin_resolve_ai_alert(p_admin uuid, p_alert_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.ai_usage_alerts;
begin
  perform private.assert_admin(p_admin);
  if p_resolution not in ('ok', 'override_raised', 'ai_paused') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_alert from public.ai_usage_alerts a where a.id = p_alert_id for update;
  if not found then
    raise exception 'alert_not_found' using errcode = 'P0002';
  end if;
  update public.ai_usage_alerts a
    set resolved_at = now(), resolved_by = p_admin, resolution = p_resolution
    where a.id = p_alert_id and a.resolved_at is null;
  if found then
    perform private.audit_admin(p_admin, 'ai_alert.resolve', 'ai_alert', p_alert_id::text,
      jsonb_build_object('kind', v_alert.kind, 'resolution', p_resolution));
  end if;
end;
$$;

-- 本月用量與預算進度，加上 Claude Console 硬上限的對照
create function public.admin_get_ai_usage(p_admin uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month text := to_char(p_now at time zone 'utc', 'YYYY-MM');
  v_start timestamptz := date_trunc('month', p_now at time zone 'utc') at time zone 'utc';
  v_budget jsonb := private.ai_budget_state(p_now);
  v_cap numeric;
begin
  perform private.assert_admin(p_admin);
  select (c.ai_protection ->> 'consoleHardCapUsd')::numeric into v_cap from public.app_config c;
  return jsonb_build_object(
    'month', v_month,
    'spent_usd', v_budget -> 'spent_usd',
    'budget_usd', v_budget -> 'budget_usd',
    'ratio', v_budget -> 'ratio',
    'state', v_budget ->> 'state',
    'call_count', coalesce((select m.call_count from public.ai_spend_monthly m where m.month = v_month and m.scope = 'global'), 0),
    'console', jsonb_build_object(
      'hard_cap_usd', v_cap,
      'budget_usd', v_budget -> 'budget_usd',
      'margin_usd', v_cap - (v_budget ->> 'budget_usd')::numeric,
      'spent_vs_cap_ratio', case when v_cap > 0 then round((v_budget ->> 'spent_usd')::numeric / v_cap, 4) else null end
    ),
    'open_alert_count', (select count(*) from public.ai_usage_alerts a where a.resolved_at is null),
    'paused_user_count', (select count(*) from public.user_profiles p where p.ai_paused),
    'by_task', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task', t.task, 'model', t.model, 'calls', t.calls, 'failures', t.failures, 'cost_usd', t.cost,
        'input_tokens', t.inp, 'output_tokens', t.outp, 'cache_read_tokens', t.cread, 'cache_write_tokens', t.cwrite
      ) order by t.cost desc)
      from (
        select r.task, r.model, count(*) as calls, count(*) filter (where not r.ok) as failures, sum(r.cost_usd) as cost,
          sum(r.input_tokens) as inp, sum(r.output_tokens) as outp, sum(r.cache_read_tokens) as cread, sum(r.cache_write_tokens) as cwrite
        from public.ai_usage_records r
        where r.created_at >= v_start and r.created_at < v_start + interval '1 month'
        group by r.task, r.model
      ) t
    ), '[]'::jsonb),
    'top_users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', t.user_id, 'display_name', t.display_name, 'cost_usd', t.total_usd, 'calls', t.call_count
      ) order by t.total_usd desc)
      from (
        select m.user_id, idn.display_name, m.total_usd, m.call_count
        from public.ai_spend_monthly m
        left join public.user_identities idn on idn.user_id = m.user_id
        where m.month = v_month and m.scope = 'user'
        order by m.total_usd desc
        limit 10
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_get_ai_protection(uuid)',
    'admin_update_ai_protection(uuid, jsonb)',
    'admin_set_user_fair_use(uuid, uuid, numeric, numeric, boolean)',
    'admin_set_user_ai_paused(uuid, uuid, boolean)',
    'admin_list_ai_alerts(uuid, text, integer, timestamptz)',
    'admin_resolve_ai_alert(uuid, uuid, text)',
    'admin_get_ai_usage(uuid, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
