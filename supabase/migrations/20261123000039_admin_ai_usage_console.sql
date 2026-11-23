---------------------------------------------------------------------------
-- M1a-13：後台 AI 用量頁的資料
--   一、admin_get_ai_usage 依任務與模型多回輸出檢查的三種結果（被擋下的比率用）
--   二、admin_list_users 多回「AI 是否暫停」與個人的合理使用上限覆寫
-- 都只有統計與帳號資料，不含任何使用者的內容。
---------------------------------------------------------------------------

-- p_now 決定看哪個月（任何落在那個月的時間點）；後台預設本月，可選前 12 個月。
-- 過去的月份用「現在的預算」算進度與狀態（預算本身不留歷史）。
create or replace function public.admin_get_ai_usage(p_admin uuid, p_now timestamptz default now())
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
        'input_tokens', t.inp, 'output_tokens', t.outp, 'cache_read_tokens', t.cread, 'cache_write_tokens', t.cwrite,
        'passed', t.passed, 'rewritten', t.rewritten, 'blocked', t.blocked
      ) order by t.cost desc, t.task, t.model)
      from (
        select r.task, r.model, count(*) as calls, count(*) filter (where not r.ok) as failures, sum(r.cost_usd) as cost,
          sum(r.input_tokens) as inp, sum(r.output_tokens) as outp, sum(r.cache_read_tokens) as cread, sum(r.cache_write_tokens) as cwrite,
          count(*) filter (where r.outcome = 'passed') as passed,
          count(*) filter (where r.outcome = 'rewritten') as rewritten,
          count(*) filter (where r.outcome = 'blocked') as blocked
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
        'ai_paused', p.ai_paused,
        'fair_use_override', e.fair_use_override,
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

-- create or replace 不改權限，這裡再確認一次
revoke execute on function public.admin_get_ai_usage(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_get_ai_usage(uuid, timestamptz) to service_role;
revoke execute on function public.admin_list_users(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_users(uuid) to service_role;
