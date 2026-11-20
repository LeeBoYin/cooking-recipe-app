---------------------------------------------------------------------------
-- 錯誤紀錄（04 ADR-21）、每日維護排程、app_config 補齊（16 第三、九節）
---------------------------------------------------------------------------

-- 錯誤紀錄：手機與後端的錯誤、排程與備份的執行結果。
-- 只記錯誤類型與發生的位置，不記食譜、對話等內容，也不記使用者 ID。
-- 只有後端與後台讀得到：沒有任何 RLS 政策，也不授權給 API 角色。
create table public.error_logs (
  id uuid primary key default private.uuid_v7(),
  source text not null check (source in ('client', 'edge_function', 'cron', 'backup')),
  -- 錯誤類型，例 'photo_upload_failed'、'rls_denied'
  kind text not null check (kind ~ '^[a-z0-9_]{1,64}$'),
  -- 畫面或函式名稱（不叫 where：那是 SQL 的保留字）
  location text not null check (char_length(location) between 1 and 100),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  app_version text check (char_length(app_version) <= 32),
  platform text check (platform in ('ios', 'android', 'desktop')),
  -- 分析 ID 到 M1a 才有；不存使用者 ID
  analytics_id uuid,
  -- 同一種錯誤一小時內只記一筆，次數累加
  count integer not null default 1 check (count >= 1),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

alter table public.error_logs enable row level security;
revoke all on public.error_logs from anon, authenticated;

-- 找「一小時內同一種錯誤」、清掉 90 天前的
create index error_logs_dedup on public.error_logs (source, kind, location, first_at desc);
create index error_logs_last_at on public.error_logs (last_at);

-- 寫入：後端內部用。同一種錯誤（來源、類型、位置、嚴重程度、版本、平台都一樣）
-- 在第一次出現後一小時內累加次數，不洗版。
create function private.log_error(
  p_source text,
  p_kind text,
  p_location text,
  p_severity text,
  p_app_version text default null,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  -- 同時送出同一種錯誤時排隊，才不會各記一筆
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', p_source, p_kind, p_location, p_severity, p_app_version, p_platform), 0));

  update public.error_logs
    set count = count + 1, last_at = now()
    where id = (
      select id from public.error_logs
      where source = p_source and kind = p_kind and location = p_location and severity = p_severity
        and app_version is not distinct from p_app_version
        and platform is not distinct from p_platform
        and first_at > now() - interval '1 hour'
      order by first_at desc
      limit 1
    );
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.error_logs (source, kind, location, severity, app_version, platform)
      values (p_source, p_kind, p_location, p_severity, p_app_version, p_platform);
  end if;
end;
$$;

revoke execute on function private.log_error(text, text, text, text, text, text) from public, anon, authenticated;

-- 手機回報錯誤：來源固定是 client，不收任何內容，只收類型、位置、版本與平台。
-- 一小時內手機回報的錯誤種類有上限，避免被灌爆。
create function public.log_error(
  p_kind text,
  p_location text,
  p_severity text,
  p_app_version text default null,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = '42501';
  end if;
  if p_kind is null or p_kind !~ '^[a-z0-9_]{1,64}$' then
    raise exception '錯誤類型只能是小寫英數與底線' using errcode = '22023';
  end if;
  if p_location is null or char_length(p_location) not between 1 and 100 then
    raise exception '畫面名稱長度不對' using errcode = '22023';
  end if;
  if p_severity is null or p_severity not in ('info', 'warning', 'critical') then
    raise exception '嚴重程度不在清單內' using errcode = '22023';
  end if;
  if p_platform is not null and p_platform not in ('ios', 'android', 'desktop') then
    raise exception '平台不在清單內' using errcode = '22023';
  end if;
  if p_app_version is not null and char_length(p_app_version) > 32 then
    raise exception '版本太長' using errcode = '22023';
  end if;

  if (select count(*) from public.error_logs
      where source = 'client' and first_at > now() - interval '1 hour') >= 200 then
    return;
  end if;

  perform private.log_error('client', p_kind, p_location, p_severity, p_app_version, p_platform);
end;
$$;

grant execute on function public.log_error(text, text, text, text, text) to authenticated;

-- 每日維護用：清掉最後一次發生超過 90 天的錯誤紀錄，回傳清掉幾筆
create function private.purge_old_error_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.error_logs where last_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.purge_old_error_logs() from public, anon, authenticated;

---------------------------------------------------------------------------
-- 每日維護：每個步驟各自執行，一個失敗不影響其他；結果寫進錯誤紀錄
---------------------------------------------------------------------------
create function private.run_daily_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step text;
  v_failed boolean := false;
begin
  foreach v_step in array array['purge_removed_pantry_items', 'purge_deleted_recipes', 'purge_old_error_logs'] loop
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

revoke execute on function private.run_daily_maintenance() from public, anon, authenticated;

-- 每天 UTC 19:00（台灣凌晨 3 點）；同名的排程會被覆蓋，重跑 migration 不會重複
select cron.schedule('daily-maintenance', '0 19 * * *', $$select private.run_daily_maintenance()$$);

---------------------------------------------------------------------------
-- app_config 補齊：註冊方式與人數上限（邀請制註冊在 M1a 用到）
---------------------------------------------------------------------------
alter table public.app_config
  add column registration_mode text not null default 'invite_only'
    check (registration_mode in ('invite_only', 'waitlist', 'open')),
  add column max_users integer not null default 30 check (max_users >= 1);

comment on column public.app_config.registration_mode is
  'invite_only：只能被邀請；waitlist：候補名單；open：公開註冊';
comment on column public.app_config.max_users is
  '已註冊加上還沒過期的待接受邀請的合計上限';
