-- M1a-03：方案（entitlements）、app_config 的 AI 設定、ai 函式用的帳號檢查、後台調整方案。

---------------------------------------------------------------------------
-- 一、entitlements：每個人一列，只存在後端；本人只能讀
---------------------------------------------------------------------------

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  valid_until timestamptz,
  -- 管理員個別調整的合理使用上限（M1a-04 讀）；平常是空的，以 app_config 為準
  fair_use_override jsonb check (
    fair_use_override is null or extensions.jsonb_matches_schema(
      '{
        "type": "object",
        "properties": {
          "daily_usd": { "type": "number", "minimum": 0 },
          "monthly_usd": { "type": "number", "minimum": 0 }
        },
        "additionalProperties": false
      }'::json,
      fair_use_override
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.entitlements
  for each row execute function private.set_updated_at();

alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
create policy "本人讀自己的方案" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

-- 現有帳號補上（M1–M3 都是免費方案）
insert into public.entitlements (user_id)
  select user_id from public.user_profiles
  on conflict do nothing;

---------------------------------------------------------------------------
-- 二、註冊時建立：setup_new_user 建免費方案；接受邀請時再依邀請的方案改
---------------------------------------------------------------------------

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

-- 密碼註冊與 Google 註冊都經過這裡，方案跟著邀請走，和註冊資料在同一個交易
create or replace function private.accept_invite(
  p_invite_id uuid,
  p_user_id uuid,
  p_via text,
  p_display_name text,
  p_timezone text,
  p_region text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kitchen_id uuid;
  v_plan text;
begin
  update public.invites
    set status = 'accepted', accepted_at = now(), accepted_user_id = p_user_id, accepted_via = p_via,
        code_hash = null, code_expires_at = null
    where id = p_invite_id and status = 'pending' and expires_at > now() and type = 'account'
    returning plan into v_plan;
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;

  v_kitchen_id := public.setup_new_user(p_user_id, p_display_name, true, '我家', p_timezone, p_region);
  update public.user_profiles set invite_id = p_invite_id where user_id = p_user_id;
  update public.entitlements set plan = v_plan where user_id = p_user_id;
  return v_kitchen_id;
end;
$$;
revoke execute on function private.accept_invite(uuid, uuid, text, text, text, text) from public, anon, authenticated;

---------------------------------------------------------------------------
-- 三、app_config 的 AI 設定
---------------------------------------------------------------------------

alter table public.app_config
  add column ai_enabled boolean not null default true,
  add column ai_monthly_budget_usd numeric(8, 2) not null default 18 check (ai_monthly_budget_usd between 0 and 10000),
  add column ai_budget_alert_ratio numeric(3, 2) not null default 0.8 check (ai_budget_alert_ratio between 0.1 and 1),
  -- 用量保護的數值（速率、合理使用上限…）由 M1a-04 定格式與檢查；這裡先留位置
  add column ai_protection jsonb not null default '{}';

---------------------------------------------------------------------------
-- 四、ai 函式的帳號檢查（只給服務權限）：一次拿到狀態、方案與 AI 開關
---------------------------------------------------------------------------

create function public.ai_get_context(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', p.status,
    'ai_paused', p.ai_paused,
    'plan', coalesce(e.plan, 'free'),
    'ai_enabled', c.ai_enabled,
    'monthly_budget_usd', c.ai_monthly_budget_usd,
    'budget_alert_ratio', c.ai_budget_alert_ratio
  )
  from public.user_profiles p
  cross join public.app_config c
  left join public.entitlements e on e.user_id = p.user_id
  where p.user_id = p_user;
$$;
revoke execute on function public.ai_get_context(uuid) from public, anon, authenticated;
grant execute on function public.ai_get_context(uuid) to service_role;

---------------------------------------------------------------------------
-- 五、後台：使用者清單加方案、可調整；系統設定加 AI 設定
---------------------------------------------------------------------------

create or replace function public.admin_list_users(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin);
  return coalesce((
    select jsonb_agg(row order by (row ->> 'created_at') desc)
    from (
      select jsonb_build_object(
        'user_id', p.user_id,
        'email', u.email,
        'display_name', i.display_name,
        'role', p.role,
        'status', p.status,
        'plan', coalesce(e.plan, 'free'),
        'created_at', p.created_at,
        'last_active_at', greatest(p.last_active_at, u.last_sign_in_at),
        'accepted_via', inv.accepted_via
      ) as row
      from public.user_profiles p
      join auth.users u on u.id = p.user_id
      left join public.user_identities i on i.user_id = p.user_id
      left join public.invites inv on inv.id = p.invite_id
      left join public.entitlements e on e.user_id = p.user_id
    ) t
  ), '[]'::jsonb);
end;
$$;

create function public.admin_set_user_plan(p_admin uuid, p_user_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform private.assert_admin(p_admin);
  if p_plan not in ('free', 'plus') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_profiles p where p.user_id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  insert into public.entitlements (user_id, plan) values (p_user_id, p_plan)
    on conflict (user_id) do nothing;
  select e.plan into v_old from public.entitlements e where e.user_id = p_user_id for update;
  update public.entitlements e set plan = p_plan where e.user_id = p_user_id;
  perform private.audit_admin(p_admin, 'user.plan', 'user', p_user_id::text,
    jsonb_build_object('before', v_old, 'after', p_plan));
end;
$$;
revoke execute on function public.admin_set_user_plan(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_plan(uuid, uuid, text) to service_role;

create or replace function public.admin_get_config(p_admin uuid)
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
      'max_users', c.max_users,
      'soft_delete_retention_days', c.soft_delete_retention_days,
      'ai_enabled', c.ai_enabled,
      'ai_monthly_budget_usd', c.ai_monthly_budget_usd,
      'registered_count', (select count(*) from public.user_profiles),
      'pending_invite_count', (select count(*) from public.invites i where i.status = 'pending' and i.expires_at > now())
    )
    from public.app_config c
  );
end;
$$;

drop function public.admin_update_config(uuid, integer, integer);
create function public.admin_update_config(
  p_admin uuid,
  p_max_users integer default null,
  p_soft_delete_retention_days integer default null,
  p_ai_enabled boolean default null,
  p_ai_monthly_budget_usd numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.app_config;
  v_new public.app_config;
begin
  perform private.assert_admin(p_admin);
  if (p_max_users is not null and p_max_users not between 1 and 1000)
     or (p_soft_delete_retention_days is not null and p_soft_delete_retention_days not between 1 and 365)
     or (p_ai_monthly_budget_usd is not null and p_ai_monthly_budget_usd not between 0 and 10000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_old from public.app_config c where c.id for update;
  update public.app_config c
    set max_users = coalesce(p_max_users, c.max_users),
        soft_delete_retention_days = coalesce(p_soft_delete_retention_days, c.soft_delete_retention_days),
        ai_enabled = coalesce(p_ai_enabled, c.ai_enabled),
        ai_monthly_budget_usd = coalesce(p_ai_monthly_budget_usd, c.ai_monthly_budget_usd)
    where c.id
    returning * into v_new;
  perform private.audit_admin(p_admin, 'config.update', 'app_config', null, jsonb_build_object(
    'before', jsonb_build_object('max_users', v_old.max_users, 'soft_delete_retention_days', v_old.soft_delete_retention_days,
      'ai_enabled', v_old.ai_enabled, 'ai_monthly_budget_usd', v_old.ai_monthly_budget_usd),
    'after', jsonb_build_object('max_users', v_new.max_users, 'soft_delete_retention_days', v_new.soft_delete_retention_days,
      'ai_enabled', v_new.ai_enabled, 'ai_monthly_budget_usd', v_new.ai_monthly_budget_usd)
  ));
  return jsonb_build_object('max_users', v_new.max_users, 'soft_delete_retention_days', v_new.soft_delete_retention_days,
    'ai_enabled', v_new.ai_enabled, 'ai_monthly_budget_usd', v_new.ai_monthly_budget_usd);
end;
$$;
revoke execute on function public.admin_update_config(uuid, integer, integer, boolean, numeric) from public, anon, authenticated;
grant execute on function public.admin_update_config(uuid, integer, integer, boolean, numeric) to service_role;
