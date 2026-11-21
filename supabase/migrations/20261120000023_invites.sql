-- 邀請（05 Invite；16 第三、五、八節；02 K）。M1a-01a：資料表、create_invite、complete_invite_signup。
-- 邀請連結的原始值只在產生當下回傳一次，資料庫只存雜湊。
-- 是否過期由 expires_at 判斷，不存成狀態。

---------------------------------------------------------------------------
-- 資料表
---------------------------------------------------------------------------

create table public.invites (
  id uuid primary key check (private.is_uuid_v7(id)),
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  note text check (note is null or char_length(note) <= 100),
  plan text not null default 'free' check (plan in ('free', 'plus')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  type text not null default 'account' check (type in ('account', 'kitchen')),
  invited_by uuid references auth.users (id) on delete set null,
  kitchen_id uuid references public.kitchens (id) on delete cascade,
  -- M1a 只存旗標；M2 建好友關係時照旗標補上
  befriend_inviter boolean not null default true,
  expires_at timestamptz not null default (now() + interval '14 days'),
  link_regenerated_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  accepted_via text check (accepted_via in ('password', 'google')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'kitchen') = (kitchen_id is not null)),
  check ((status = 'accepted') = (accepted_at is not null))
);

-- 同一個 email 同時只有一筆待接受的邀請
create unique index invites_one_pending_per_email on public.invites (email) where status = 'pending';
create index invites_status_expires on public.invites (status, expires_at);

create trigger set_updated_at before update on public.invites
  for each row execute function private.set_updated_at();

-- 沒有任何人能經 API 讀寫（後台走 admin 函式，註冊走 accept-invite，都用服務權限）
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
-- accept-invite（服務權限）只需要用 token 的雜湊查邀請；資料表預設不開放給任何 API 角色，所以明確給讀取。
-- 寫入都經 SECURITY DEFINER 函式。
grant select on public.invites to service_role;

-- 哪一筆邀請註冊的
alter table public.user_profiles
  add column invite_id uuid references public.invites (id) on delete set null;

---------------------------------------------------------------------------
-- 資料庫函式
---------------------------------------------------------------------------

-- 目前登入的人是系統管理員
create function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = (select auth.uid()) and status = 'active' and role = 'system_admin'
  );
$$;

-- 產生邀請。回傳邀請 ID 與原始連結用的 token（只此一次，資料庫只存雜湊）。
-- 誰能呼叫：服務權限（沒有登入身分，例如本機的 scripts/create-invite.sh）與系統管理員；
-- 一般使用者的廚房邀請 M2 才開放。
-- M1a 只發一般邀請（type = 'account'）；廚房邀請的流程 M2 才做，這裡先擋下來。
create function public.create_invite(
  p_id uuid,
  p_email text,
  p_note text default null,
  p_plan text default 'free',
  p_type text default 'account',
  p_kitchen_id uuid default null,
  p_befriend_inviter boolean default true,
  p_invited_by uuid default null
)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_email text := lower(btrim(p_email));
  v_max integer;
  v_token text;
  v_expires timestamptz;
begin
  if v_caller is not null and not private.is_system_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_type <> 'account' then
    raise exception 'invite_type_unsupported' using errcode = '0A000';
  end if;
  if p_plan not in ('free', 'plus') or v_email is null or v_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid_invite_input' using errcode = '22023';
  end if;

  -- 同一個 email 還沒過期的待接受邀請：先撤銷再重發太容易誤傷，直接擋下，要重發請先撤銷
  if exists (
    select 1 from public.invites i
    where i.email = v_email and i.status = 'pending' and i.expires_at > now()
  ) then
    raise exception 'invite_pending_exists' using errcode = '23505';
  end if;
  -- 過期的待接受邀請改成已撤銷，讓出「同一個 email 一筆待接受」的位置
  update public.invites i set status = 'revoked'
    where i.email = v_email and i.status = 'pending' and i.expires_at <= now();

  -- 已經是使用者的 email 不能再邀請
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'already_registered' using errcode = '23505';
  end if;

  -- 人數上限：已註冊的人加上還沒過期的待接受邀請
  select c.max_users into v_max from public.app_config c;
  if (select count(*) from public.user_profiles)
     + (select count(*) from public.invites i where i.status = 'pending' and i.expires_at > now()) >= v_max then
    raise exception 'invite_capacity' using errcode = '53400';
  end if;

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  v_expires := now() + interval '14 days';

  insert into public.invites (id, email, note, plan, token_hash, type, invited_by, befriend_inviter, expires_at)
    values (
      p_id, v_email, nullif(btrim(p_note), ''), p_plan,
      encode(extensions.digest(v_token, 'sha256'), 'hex'),
      p_type, coalesce(v_caller, p_invited_by), p_befriend_inviter, v_expires
    );

  return query select p_id, v_token, v_expires;
end;
$$;

revoke execute on function public.create_invite(uuid, text, text, text, text, uuid, boolean, uuid) from public, anon;
grant execute on function public.create_invite(uuid, text, text, text, text, uuid, boolean, uuid) to authenticated, service_role;

-- accept-invite 在建好 Auth 使用者之後呼叫：同一個交易裡先認領邀請、再建立註冊資料。
-- 任何一步失敗都整個還原；呼叫端接著刪掉剛建的 Auth 使用者，不留下一半的資料。
create function public.complete_invite_signup(
  p_invite_id uuid,
  p_user_id uuid,
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
  v_kitchen_id uuid;
begin
  update public.invites
    set status = 'accepted', accepted_at = now(), accepted_user_id = p_user_id, accepted_via = 'password'
    where id = p_invite_id and status = 'pending' and expires_at > now() and type = 'account';
  if not found then
    raise exception 'invite_not_usable' using errcode = 'P0001';
  end if;

  v_kitchen_id := public.setup_new_user(p_user_id, p_display_name, true, '我家', p_timezone, p_region);
  update public.user_profiles set invite_id = p_invite_id where user_id = p_user_id;
  return v_kitchen_id;
end;
$$;

revoke execute on function public.complete_invite_signup(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_invite_signup(uuid, uuid, text, text, text) to service_role;

-- 「至少一位管理者」的檢查是延後到交易結束才執行的，那時候的身分是最外層的呼叫者。
-- 服務權限（accept-invite 呼叫 complete_invite_signup）沒有 kitchen_members 的讀取權限，
-- 所以這個檢查改用函式擁有者的權限執行。
alter function private.check_kitchen_has_admin() security definer;
