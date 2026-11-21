-- 管理後台（後端）（02 K、L；04 ADR-15；16 第三、五、六節）。M1a-12a：
-- 1. admin_audit_logs：管理員的每個寫入操作都留下紀錄，只能新增
-- 2. is_system_admin 要求這次登入通過兩步驟驗證（aal2）
-- 3. admin_* 函式：後台的讀取與操作，只給 admin Edge Function（服務權限）呼叫；
--    每個寫入函式在同一個交易裡先檢查呼叫者、做事、寫操作紀錄，三件事一起成功或一起不做。
-- 後台只回傳帳號資料與統計，沒有任何讀取使用者食譜、食材、照片的函式。

---------------------------------------------------------------------------
-- 一、操作紀錄（只能新增）
---------------------------------------------------------------------------

-- admin_user_id 不設外鍵：外鍵的 on delete set null 會對這張表做 UPDATE，會被「不能修改」擋下，
-- 導致刪不掉帳號；紀錄本來就該在帳號消失後留著。
-- detail 只放代號、數字與修改前後的設定值，不放 email、token、使用者的內容。
create table public.admin_audit_logs (
  id uuid primary key default private.uuid_v7() check (private.is_uuid_v7(id)),
  admin_user_id uuid not null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text check (target_type is null or target_type ~ '^[a-z_]+$'),
  target_id text check (target_id is null or char_length(target_id) <= 64),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created on public.admin_audit_logs (created_at desc, id desc);

alter table public.admin_audit_logs enable row level security;
-- 沒有任何角色（含服務權限）能直接讀寫；讀取經 admin_list_audit_logs，寫入只經 private.audit_admin
revoke all on public.admin_audit_logs from public, anon, authenticated, service_role;

-- 連資料庫擁有者都不能改或刪：用觸發器擋下 UPDATE、DELETE、TRUNCATE
create function private.admin_audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_logs_append_only' using errcode = '42501';
end;
$$;
create trigger no_update_delete before update or delete on public.admin_audit_logs
  for each row execute function private.admin_audit_logs_immutable();
create trigger no_truncate before truncate on public.admin_audit_logs
  for each statement execute function private.admin_audit_logs_immutable();

---------------------------------------------------------------------------
-- 二、系統管理員要求兩步驟驗證
---------------------------------------------------------------------------

-- 目前登入的人是系統管理員，而且這次登入通過了兩步驟驗證（JWT 的 aal 是 aal2）。
-- 一般使用者 API 路徑上的管理員身分判斷（create_invite 等）因此也不能繞過 TOTP。
create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
    and exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and status = 'active' and role = 'system_admin'
    );
$$;

---------------------------------------------------------------------------
-- 三、共用的內部函式
---------------------------------------------------------------------------

-- admin Edge Function 已經檢查過 JWT；這裡再確認一次這個 ID 是啟用中的系統管理員（雙重保險）
create function private.assert_admin(p_admin uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_admin is null or not exists (
    select 1 from public.user_profiles p
    where p.user_id = p_admin and p.status = 'active' and p.role = 'system_admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.assert_admin(uuid) from public, anon, authenticated;

create function private.audit_admin(p_admin uuid, p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, detail)
    values (p_admin, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;
revoke execute on function private.audit_admin(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- 人數上限：已註冊加上還沒過期的待接受邀請（排除一筆正在處理的邀請）
create function private.assert_invite_capacity(p_except_invite uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.user_profiles)
     + (select count(*) from public.invites i
         where i.status = 'pending' and i.expires_at > now() and i.id is distinct from p_except_invite)
     >= (select c.max_users from public.app_config c) then
    raise exception 'invite_capacity' using errcode = '53400';
  end if;
end;
$$;
revoke execute on function private.assert_invite_capacity(uuid) from public, anon, authenticated;

---------------------------------------------------------------------------
-- 四、讀取（只回傳帳號資料與統計）
---------------------------------------------------------------------------

-- 這個人是不是啟用中的系統管理員（不丟例外；admin Edge Function 用它決定回 403 還是繼續）
create function public.admin_is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id = p_user and p.status = 'active' and p.role = 'system_admin'
  );
$$;

create function public.admin_list_users(p_admin uuid)
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
        'created_at', p.created_at,
        -- last_active_at 之後由 track／ai 寫入；目前先用最近一次登入
        'last_active_at', greatest(p.last_active_at, u.last_sign_in_at),
        'accepted_via', inv.accepted_via
      ) as row
      from public.user_profiles p
      join auth.users u on u.id = p.user_id
      left join public.user_identities i on i.user_id = p.user_id
      left join public.invites inv on inv.id = p.invite_id
    ) t
  ), '[]'::jsonb);
end;
$$;

-- 邀請清單。狀態：pending（待接受）、accepted、expired（待接受但已過期）、revoked
create function public.admin_list_invites(p_admin uuid)
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
        'id', i.id,
        'email', i.email,
        'note', i.note,
        'plan', i.plan,
        'state', case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
        'befriend_inviter', i.befriend_inviter,
        'inviter_name', idn.display_name,
        'expires_at', i.expires_at,
        'created_at', i.created_at,
        'accepted_at', i.accepted_at
      ) as row
      from public.invites i
      left join public.user_identities idn on idn.user_id = i.invited_by
    ) t
  ), '[]'::jsonb);
end;
$$;

create function public.admin_get_config(p_admin uuid)
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
      'registered_count', (select count(*) from public.user_profiles),
      'pending_invite_count', (select count(*) from public.invites i where i.status = 'pending' and i.expires_at > now())
    )
    from public.app_config c
  );
end;
$$;

-- 操作紀錄：新的在前，用 p_before（上一頁最後一筆的時間）往後翻
create function public.admin_list_audit_logs(p_admin uuid, p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin);
  return coalesce((
    select jsonb_agg(row order by (row ->> 'created_at') desc, (row ->> 'id') desc)
    from (
      select jsonb_build_object(
        'id', l.id,
        'admin_user_id', l.admin_user_id,
        'admin_name', idn.display_name,
        'action', l.action,
        'target_type', l.target_type,
        'target_id', l.target_id,
        'detail', l.detail,
        'created_at', l.created_at
      ) as row
      from public.admin_audit_logs l
      left join public.user_identities idn on idn.user_id = l.admin_user_id
      where p_before is null or l.created_at < p_before
      order by l.created_at desc, l.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) t
  ), '[]'::jsonb);
end;
$$;

---------------------------------------------------------------------------
-- 五、寫入（每個都寫操作紀錄）
---------------------------------------------------------------------------

-- 產生邀請：檢查與限制都在 create_invite（人數上限、重複、已註冊）。方案先只存在邀請上。
create function public.admin_create_invite(
  p_admin uuid,
  p_id uuid,
  p_email text,
  p_note text default null,
  p_plan text default 'free',
  p_befriend_inviter boolean default true
)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  perform private.assert_admin(p_admin);
  select * into v_row from public.create_invite(p_id, p_email, p_note, p_plan, 'account', null, p_befriend_inviter, p_admin);
  perform private.audit_admin(p_admin, 'invite.send', 'invite', p_id::text,
    jsonb_build_object('plan', p_plan, 'befriend_inviter', p_befriend_inviter));
  return query select v_row.invite_id, v_row.token, v_row.expires_at;
end;
$$;

-- 重新產生連結：換新 token、舊連結與舊邀請碼同時失效、期限重新計 14 天。過期的邀請也能重新產生（要有名額）
create function public.admin_regenerate_invite(p_admin uuid, p_invite_id uuid)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invites;
  v_token text;
  v_expires timestamptz := now() + interval '14 days';
begin
  perform private.assert_admin(p_admin);
  select * into v_inv from public.invites i where i.id = p_invite_id for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    perform private.assert_invite_capacity(p_invite_id);
  end if;

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  update public.invites i
    set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
        expires_at = v_expires, link_regenerated_at = now(), code_hash = null, code_expires_at = null
    where i.id = p_invite_id;
  perform private.audit_admin(p_admin, 'invite.regenerate', 'invite', p_invite_id::text);
  return query select p_invite_id, v_token, v_expires;
end;
$$;

create function public.admin_revoke_invite(p_admin uuid, p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin);
  update public.invites i set status = 'revoked', code_hash = null, code_expires_at = null
    where i.id = p_invite_id and i.status = 'pending';
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;
  perform private.audit_admin(p_admin, 'invite.revoke', 'invite', p_invite_id::text);
end;
$$;

-- 延長期限：從「現在或原本的期限，比較晚的那個」往後加 p_days 天（1～60）
create function public.admin_extend_invite(p_admin uuid, p_invite_id uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invites;
  v_expires timestamptz;
begin
  perform private.assert_admin(p_admin);
  if p_days is null or p_days not between 1 and 60 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_inv from public.invites i where i.id = p_invite_id for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    perform private.assert_invite_capacity(p_invite_id);
  end if;
  v_expires := greatest(v_inv.expires_at, now()) + make_interval(days => p_days);
  update public.invites i set expires_at = v_expires where i.id = p_invite_id;
  perform private.audit_admin(p_admin, 'invite.extend', 'invite', p_invite_id::text, jsonb_build_object('days', p_days));
  return v_expires;
end;
$$;

-- 修改 email（只有待接受的邀請）。紀錄不存新舊 email。
create function public.admin_update_invite_email(p_admin uuid, p_invite_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  perform private.assert_admin(p_admin);
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_invite_input' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'already_registered' using errcode = '23505';
  end if;
  begin
    update public.invites i set email = v_email
      where i.id = p_invite_id and i.status = 'pending';
  exception when unique_violation then
    raise exception 'invite_pending_exists' using errcode = '23505';
  end;
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;
  perform private.audit_admin(p_admin, 'invite.update_email', 'invite', p_invite_id::text);
end;
$$;

-- 停用或恢復帳號（p_status：suspended／active）。資料保留。登入的封鎖由 admin Edge Function 另外用 Auth 的 ban 處理。
-- 不能停用自己，也不能停用另一位系統管理員。
create function public.admin_set_user_status(p_admin uuid, p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_profiles;
begin
  perform private.assert_admin(p_admin);
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_user_id = p_admin then
    raise exception 'cannot_target_self' using errcode = '22023';
  end if;
  select * into v_target from public.user_profiles p where p.user_id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_target.role = 'system_admin' then
    raise exception 'cannot_target_admin' using errcode = '22023';
  end if;
  update public.user_profiles p set status = p_status where p.user_id = p_user_id;
  perform private.audit_admin(p_admin,
    case p_status when 'suspended' then 'user.suspend' else 'user.restore' end, 'user', p_user_id::text);
end;
$$;

-- 產生重設密碼連結（檢查在 create_password_reset_link：只有啟用中的使用者）
create function public.admin_create_reset_link(p_admin uuid, p_id uuid, p_user_id uuid)
returns table (link_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  perform private.assert_admin(p_admin);
  select * into v_row from public.create_password_reset_link(p_id, p_user_id, p_admin);
  perform private.audit_admin(p_admin, 'user.reset_link', 'user', p_user_id::text);
  return query select v_row.link_id, v_row.token, v_row.expires_at;
end;
$$;

-- 系統設定：人數上限、刪除後可以復原的天數。沒給的欄位不動；紀錄存修改前後的值。
create function public.admin_update_config(
  p_admin uuid,
  p_max_users integer default null,
  p_soft_delete_retention_days integer default null
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
     or (p_soft_delete_retention_days is not null and p_soft_delete_retention_days not between 1 and 365) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select * into v_old from public.app_config for update;
  update public.app_config c
    set max_users = coalesce(p_max_users, c.max_users),
        soft_delete_retention_days = coalesce(p_soft_delete_retention_days, c.soft_delete_retention_days)
    returning * into v_new;
  perform private.audit_admin(p_admin, 'config.update', 'app_config', null, jsonb_build_object(
    'before', jsonb_build_object('max_users', v_old.max_users, 'soft_delete_retention_days', v_old.soft_delete_retention_days),
    'after', jsonb_build_object('max_users', v_new.max_users, 'soft_delete_retention_days', v_new.soft_delete_retention_days)
  ));
  return jsonb_build_object('max_users', v_new.max_users, 'soft_delete_retention_days', v_new.soft_delete_retention_days);
end;
$$;

---------------------------------------------------------------------------
-- 六、權限：admin_* 只給服務權限（admin Edge Function）
---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
