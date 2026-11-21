-- 邀請（後端 ②）（02 K；12 ②；16 第三、五、六節）。M1a-01b：
-- 1. 6 碼邀請碼（iPhone 先安裝再註冊）與輸入錯誤的暫停
-- 2. Google 登入：Auth「建立使用者前」hook 與 complete_google_signup
-- 3. 重設密碼連結 password_reset_links
-- 所有原始值（邀請碼、重設連結）只在產生當下回傳一次，資料庫只存雜湊。

---------------------------------------------------------------------------
-- 一、6 碼邀請碼
---------------------------------------------------------------------------

-- 邀請碼屬於同一筆邀請；同一筆只有一組有效，重新產生時覆蓋舊的。
-- 邀請用掉、撤銷、過期時，查詢條件（status、expires_at）會讓邀請碼一起失效。
alter table public.invites
  add column code_hash text unique check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  add column code_expires_at timestamptz,
  add check ((code_hash is null) = (code_expires_at is null));

-- 輸入錯誤的紀錄。來源是 Edge Function 算出的雜湊（不存原始 IP）。
create table public.invite_code_attempts (
  source_hash text primary key check (source_hash ~ '^[0-9a-f]{64}$'),
  failed_count integer not null default 0 check (failed_count >= 0),
  last_failed_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.invite_code_attempts
  for each row execute function private.set_updated_at();
alter table public.invite_code_attempts enable row level security;
revoke all on public.invite_code_attempts from anon, authenticated;

-- 打開邀請連結時，accept-invite 產生邀請碼後呼叫：存雜湊、1 小時內有效、覆蓋舊的。
-- 雜湊撞到別筆邀請的碼時回 23505，呼叫端換一組再試。
create function public.set_invite_code(p_invite_id uuid, p_code_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + interval '1 hour';
begin
  update public.invites
    set code_hash = p_code_hash, code_expires_at = v_expires
    where id = p_invite_id and status = 'pending' and expires_at > now() and type = 'account';
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;
  return v_expires;
end;
$$;
revoke execute on function public.set_invite_code(uuid, text) from public, anon, authenticated;
grant execute on function public.set_invite_code(uuid, text) to service_role;

-- 用邀請碼換回邀請。結果：ok（有效）、invalid（打錯、過期或邀請已失效）、locked（暫停中）。
-- 同一個來源 15 分鐘內錯 5 次就暫停 15 分鐘；暫停中連對的碼也不收。
-- 成功不會清掉失敗次數，免得手上有一組有效碼的人用它洗掉計數去猜別人的碼。
-- 失敗次數要存下來，所以打錯回傳結果，不丟例外（例外會讓寫入一起還原）。
create function public.redeem_invite_code(p_source_hash text, p_code_hash text)
returns table (result text, invite_id uuid, email text, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.invite_code_attempts;
  v_invite_id uuid;
  v_email text;
  v_count integer;
begin
  insert into public.invite_code_attempts (source_hash) values (p_source_hash) on conflict do nothing;
  select * into v_attempt from public.invite_code_attempts a where a.source_hash = p_source_hash for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return query select 'locked'::text, null::uuid, null::text, v_attempt.locked_until;
    return;
  end if;

  select i.id, i.email into v_invite_id, v_email
    from public.invites i
    where i.code_hash = p_code_hash and i.code_expires_at > now()
      and i.status = 'pending' and i.expires_at > now() and i.type = 'account';
  if found then
    return query select 'ok'::text, v_invite_id, v_email, null::timestamptz;
    return;
  end if;

  -- 上一輪的失敗超過 15 分鐘就重新計
  v_count := case
    when v_attempt.last_failed_at is null or v_attempt.last_failed_at < now() - interval '15 minutes' then 1
    else v_attempt.failed_count + 1
  end;
  update public.invite_code_attempts a
    set failed_count = v_count,
        last_failed_at = now(),
        locked_until = case when v_count >= 5 then now() + interval '15 minutes' end
    where a.source_hash = p_source_hash
    returning a.locked_until into v_attempt.locked_until;
  return query select
    case when v_attempt.locked_until is not null then 'locked' else 'invalid' end,
    null::uuid, null::text, v_attempt.locked_until;
end;
$$;
revoke execute on function public.redeem_invite_code(text, text) from public, anon, authenticated;
grant execute on function public.redeem_invite_code(text, text) to service_role;

---------------------------------------------------------------------------
-- 二、認領邀請的共用函式；Google 登入
---------------------------------------------------------------------------

-- 認領邀請（待接受、沒過期、一般邀請，否則 invite_not_usable）、建立註冊資料、記下是哪一筆邀請。
-- 密碼註冊與 Google 註冊共用，都在呼叫者的同一個交易裡：任何一步失敗就整個還原。
create function private.accept_invite(
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
begin
  update public.invites
    set status = 'accepted', accepted_at = now(), accepted_user_id = p_user_id, accepted_via = p_via,
        code_hash = null, code_expires_at = null
    where id = p_invite_id and status = 'pending' and expires_at > now() and type = 'account';
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;

  v_kitchen_id := public.setup_new_user(p_user_id, p_display_name, true, '我家', p_timezone, p_region);
  update public.user_profiles set invite_id = p_invite_id where user_id = p_user_id;
  return v_kitchen_id;
end;
$$;
revoke execute on function private.accept_invite(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.complete_invite_signup(
  p_invite_id uuid,
  p_user_id uuid,
  p_display_name text default '我',
  p_timezone text default 'Asia/Taipei',
  p_region text default 'TW'
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.accept_invite(p_invite_id, p_user_id, 'password', p_display_name, p_timezone, p_region);
$$;

-- Auth「建立使用者前」hook（Supabase 呼叫，不是 API）。輸入是 Auth 要建立的使用者，回傳 {} 放行，
-- 回傳 {"error": {...}} 拒絕。規則：
-- - 密碼註冊：只有 accept-invite 用 admin API 建立的使用者會帶 app_metadata.invite_signup。
--   Google 登入需要打開 Auth 的「允許新使用者註冊」，這會讓 /auth/v1/signup 也開放，所以在這裡擋掉
--   沒帶這個標記的密碼註冊（app_metadata 只有 admin API 設得了，使用者自己送的註冊填不了）。
-- - 其他登入方式（Google）：email 要有對應的待接受、沒過期、一般邀請（不分大小寫）。
-- 只檢查，不改資料：邀請的認領與初始化在第一次登入後由 complete_google_signup 一次做完。
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider text := event #>> '{user,app_metadata,provider}';
  v_email text := lower(btrim(event #>> '{user,email}'));
begin
  if v_provider = 'email' then
    if event #>> '{user,app_metadata,invite_signup}' = 'true' then
      return '{}'::jsonb;
    end if;
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'signup_requires_invite'));
  end if;

  if v_email is not null and v_email <> '' and exists (
    select 1 from public.invites i
    where i.email = v_email and i.status = 'pending' and i.expires_at > now() and i.type = 'account'
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'invite_required'));
end;
$$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Google 登入成功後（第一次登入）由 App 呼叫：用登入者自己的 Auth 資料找邀請、認領並建立註冊資料，
-- 同一個交易。已經初始化過的人直接回傳他現有的廚房（重複呼叫不會多建）。
-- 不信任手機送來的 email：一律讀 auth.users，且 email 要是 Google 已驗證的。
create function public.complete_google_signup(
  p_display_name text default '我',
  p_timezone text default 'Asia/Taipei',
  p_region text default 'TW'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_user auth.users;
  v_invite_id uuid;
  v_kitchen_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.user_profiles p where p.user_id = v_uid) then
    return (select m.kitchen_id from public.kitchen_members m where m.user_id = v_uid order by m.kitchen_id limit 1);
  end if;

  select * into v_user from auth.users u where u.id = v_uid;
  if not found
     or coalesce(v_user.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google' is not true
     or v_user.email_confirmed_at is null then
    raise exception 'not_google_user' using errcode = '42501';
  end if;

  select i.id into v_invite_id
    from public.invites i
    where i.email = lower(btrim(v_user.email)) and i.status = 'pending'
      and i.expires_at > now() and i.type = 'account'
    for update;
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;

  return private.accept_invite(v_invite_id, v_uid, 'google', p_display_name, p_timezone, p_region);
end;
$$;
revoke execute on function public.complete_google_signup(text, text, text) from public, anon;
grant execute on function public.complete_google_signup(text, text, text) to authenticated;

---------------------------------------------------------------------------
-- 三、重設密碼連結
---------------------------------------------------------------------------

create table public.password_reset_links (
  id uuid primary key check (private.is_uuid_v7(id)),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index password_reset_links_user on public.password_reset_links (user_id);
create trigger set_updated_at before update on public.password_reset_links
  for each row execute function private.set_updated_at();

-- 沒有任何人能經 API 讀寫（後台走 admin 函式，重設走 accept-invite，都用服務權限與下面的函式）
alter table public.password_reset_links enable row level security;
revoke all on public.password_reset_links from anon, authenticated;

-- 產生重設密碼連結：回傳原始 token（只此一次）。24 小時有效；同一個人先前沒用的連結同時作廢。
-- 誰能呼叫：服務權限（本機用 scripts/create-password-reset.sh）與系統管理員。只有啟用中的使用者能產生。
create function public.create_password_reset_link(p_id uuid, p_user_id uuid, p_created_by uuid default null)
returns table (link_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_token text;
  v_expires timestamptz := now() + interval '24 hours';
begin
  if v_caller is not null and not private.is_system_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_profiles p where p.user_id = p_user_id and p.status = 'active') then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  update public.password_reset_links l set expires_at = now()
    where l.user_id = p_user_id and l.used_at is null and l.expires_at > now();

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.password_reset_links (id, user_id, token_hash, created_by, expires_at)
    values (p_id, p_user_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), coalesce(v_caller, p_created_by), v_expires);
  return query select p_id, v_token, v_expires;
end;
$$;
revoke execute on function public.create_password_reset_link(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_password_reset_link(uuid, uuid, uuid) to authenticated, service_role;

-- 用掉連結（accept-invite 呼叫）：還沒用過、沒過期、帳號啟用中才成功，回傳 user_id，否則回傳空值。
-- 先標成已用再改密碼，同一條連結同時送兩次也只有一次成功。
create function public.claim_password_reset_link(p_token_hash text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.password_reset_links l set used_at = now()
    where l.token_hash = p_token_hash and l.used_at is null and l.expires_at > now()
      and exists (select 1 from public.user_profiles p where p.user_id = l.user_id and p.status = 'active')
    returning l.user_id;
$$;
revoke execute on function public.claim_password_reset_link(text) from public, anon, authenticated;
grant execute on function public.claim_password_reset_link(text) to service_role;

-- 改密碼失敗（例如 Auth 認為密碼太弱）時把連結還回去，讓對方可以換個密碼再試
create function public.release_password_reset_link(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.password_reset_links l set used_at = null
    where l.token_hash = p_token_hash and l.expires_at > now();
$$;
revoke execute on function public.release_password_reset_link(text) from public, anon, authenticated;
grant execute on function public.release_password_reset_link(text) to service_role;
