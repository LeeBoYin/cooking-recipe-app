-- 產品事件與分析 ID（M1a-11；14 第三節、16 第三與八節）
-- 事件只記操作、不記內容；事件裡存的是每人一組隨機的分析 ID，不是使用者 ID。
-- 兩張表都沒有 RLS 政策、也不授權給 API 角色：使用者讀不到別人的事件，也讀不到自己的對照。
-- 只有寫入函式（SECURITY DEFINER）和後端的排程能用。

---------------------------------------------------------------------------
-- 一、分析 ID 對照
---------------------------------------------------------------------------
create table public.analytics_identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  analytics_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.analytics_identities enable row level security;
revoke all on public.analytics_identities from anon, authenticated;

-- 現有帳號補上
insert into public.analytics_identities (user_id)
  select user_id from public.user_profiles
  on conflict do nothing;

-- 註冊時建立（init_first_admin 也走 setup_new_user）
create or replace function public.setup_new_user(
  p_user_id uuid,
  p_display_name text default '我',
  p_create_kitchen boolean default true,
  p_kitchen_name text default '我家',
  p_timezone text default 'Asia/Taipei',
  p_region text default 'TW'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kitchen_id uuid;
begin
  insert into public.user_profiles (user_id) values (p_user_id) on conflict do nothing;
  insert into public.user_identities (user_id, display_name)
    values (p_user_id, coalesce(nullif(btrim(p_display_name), ''), '我'))
    on conflict do nothing;
  insert into public.user_settings (user_id) values (p_user_id) on conflict do nothing;
  insert into public.preference_profiles (user_id) values (p_user_id) on conflict do nothing;
  insert into public.dietary_profiles (id, user_id) values (private.uuid_v7(), p_user_id) on conflict do nothing;
  insert into public.entitlements (user_id) values (p_user_id) on conflict do nothing;
  insert into public.analytics_identities (user_id) values (p_user_id) on conflict do nothing;

  select kitchen_id into v_kitchen_id
  from public.kitchen_members
  where user_id = p_user_id and left_at is null
  order by joined_at
  limit 1;

  if v_kitchen_id is null and p_create_kitchen then
    v_kitchen_id := private.uuid_v7();
    insert into public.kitchens (id, name, timezone, region, created_by, updated_by)
      values (v_kitchen_id, p_kitchen_name, p_timezone, p_region, p_user_id, p_user_id);
    insert into public.kitchen_members (id, kitchen_id, user_id, role)
      values (private.uuid_v7(), v_kitchen_id, p_user_id, 'admin');
  end if;

  update public.user_settings
    set current_kitchen_id = v_kitchen_id
    where user_id = p_user_id and current_kitchen_id is null and v_kitchen_id is not null;

  return v_kitchen_id;
end;
$$;

---------------------------------------------------------------------------
-- 二、事件白名單（和 packages/core/src/track/events.ts 一致，有測試比對）
---------------------------------------------------------------------------
create function private.product_event_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'app.open', 'screen.view',
    'record.start', 'record.publish', 'record.abandon', 'record.draft_saved', 'record.draft_published',
    'chat.start', 'chat.message_sent',
    'suggestion.shown', 'suggestion.opened', 'suggestion.bookmarked', 'suggestion.recorded',
    'onboarding.step', 'taste.answered', 'settings.changed', 'error'
  ]
$$;

---------------------------------------------------------------------------
-- 三、產品事件
---------------------------------------------------------------------------
-- analytics_id 不設外鍵：刪除帳號時只刪對照，留下的事件就無法對回這個人。
-- 不存點子的 ID（透過快取表能對回使用者，會破壞匿名）。
create table public.product_events (
  id uuid primary key default private.uuid_v7(),
  analytics_id uuid not null,
  session_id uuid not null,
  name text not null check (name = any (private.product_event_names())),
  screen text check (screen ~ '^[a-z_]{1,32}$'),
  -- 只能是列舉、整數或布林；schemaVersion 由寫入函式加上。值的白名單由 track 函式檢查
  props jsonb not null default '{"schemaVersion":1}' check (extensions.jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["schemaVersion"],
      "properties": {"schemaVersion": {"const": 1}},
      "additionalProperties": {"oneOf": [{"type": "string", "maxLength": 32}, {"type": "integer"}, {"type": "boolean"}]},
      "maxProperties": 9
    }'::json, props)),
  app_version text not null check (char_length(app_version) between 1 and 32),
  platform text not null check (platform in ('ios', 'android', 'desktop')),
  installed boolean not null,
  at timestamptz not null
);

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;

create index product_events_at on public.product_events (at);

---------------------------------------------------------------------------
-- 四、寫入：只有 track 函式（服務權限）呼叫
-- 檢查已經在函式裡做過（白名單、值）；這裡再擋一次名稱與形狀。
-- 「不參與使用統計」開著就整批不記。回傳寫進幾筆。
---------------------------------------------------------------------------
create function public.track_events(
  p_user_id uuid,
  p_app_version text,
  p_platform text,
  p_installed boolean,
  p_events jsonb,
  p_dropped integer default 0
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_analytics_id uuid;
  v_opt_out boolean;
  v_count integer;
  v_i integer;
begin
  select a.analytics_id, coalesce(s.analytics_opt_out, false)
    into v_analytics_id, v_opt_out
    from public.analytics_identities a
    left join public.user_settings s on s.user_id = a.user_id
    where a.user_id = p_user_id;
  if v_analytics_id is null or v_opt_out then
    return 0;
  end if;

  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception '事件格式不對' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_events) e
    where e ->> 'name' is null or e ->> 'name' <> all (private.product_event_names())
  ) then
    raise exception '事件名稱不在清單內' using errcode = '22023';
  end if;

  insert into public.product_events (analytics_id, session_id, name, screen, props, app_version, platform, installed, at)
    select v_analytics_id,
           (e ->> 'sessionId')::uuid,
           e ->> 'name',
           e ->> 'screen',
           jsonb_build_object('schemaVersion', 1) || coalesce(e -> 'props', '{}'::jsonb),
           p_app_version, p_platform, p_installed,
           (e ->> 'at')::timestamptz
    from jsonb_array_elements(p_events) e;
  get diagnostics v_count = row_count;

  -- 有被丟掉的事件：只記一筆代號與數量（每個丟掉的事件累加一次），不記內容
  if p_dropped > 0 then
    for v_i in 1..least(p_dropped, 100) loop
      perform private.log_error('edge_function', 'track_event_dropped', 'track', 'info', p_app_version, p_platform);
    end loop;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.track_events(uuid, text, text, boolean, jsonb, integer) from public, anon, authenticated;
grant execute on function public.track_events(uuid, text, text, boolean, jsonb, integer) to service_role;
