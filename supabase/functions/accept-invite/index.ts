// accept-invite（16 第六節）。不開 JWT 驗證：呼叫的人還沒有帳號，憑邀請連結的 token、6 碼邀請碼或重設連結驗證。
// 動作（body.action，沒填當作 signup）：
// - signup：密碼註冊。驗證邀請（token 或邀請碼）→ 用 admin API 建立已確認 email 的使用者（不寄信）→
//   一個資料庫交易認領邀請並建立註冊資料。任何一步失敗就刪掉剛建立的使用者，不留下一半的資料。
// - open：打開邀請連結時產生 6 碼邀請碼（1 小時內有效，只存雜湊，重新產生時舊的作廢）。
// - redeem_code：從主畫面打開 App 時，用邀請碼換回邀請（email）；同一個來源錯 5 次暫停 15 分鐘。
// - reset_password：用管理員產生的重設連結改密碼（24 小時、只能用一次）。
// 回應與紀錄不含 email、token、邀請碼。
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  checkInvite,
  checkInviteState,
  clientIp,
  generateInviteCode,
  hashCode,
  hashSource,
  hashToken,
  parseAction,
  parseOpenBody,
  parseRedeemBody,
  parseResetBody,
  parseSignupBody,
  type InviteRow,
} from './invite.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

type Db = SupabaseClient;

async function lookupByToken(client: Db, token: string) {
  return await client
    .from('invites')
    .select('id, email, status, type, expires_at')
    .eq('token_hash', await hashToken(token))
    .maybeSingle<InviteRow>();
}

interface Redeemed {
  result: 'ok' | 'invalid' | 'locked';
  invite_id: string | null;
  email: string | null;
  locked_until: string | null;
}

// 兌換邀請碼並記錄錯誤次數（資料庫一個函式做完，見 redeem_invite_code）
async function redeem(client: Db, req: Request, code: string): Promise<{ row: Redeemed } | { response: Response }> {
  const { data, error } = await client.rpc('redeem_invite_code', {
    p_source_hash: await hashSource(clientIp(req.headers)),
    p_code_hash: await hashCode(code),
  });
  const row = (Array.isArray(data) ? data[0] : data) as Redeemed | undefined;
  if (error || !row) {
    console.error('accept-invite: redeem failed', error?.code);
    return { response: json({ error: 'server_error' }, 500) };
  }
  if (row.result === 'locked') return { response: json({ error: 'code_locked', lockedUntil: row.locked_until }, 429) };
  if (row.result !== 'ok') return { response: json({ error: 'invalid_code' }, 400) };
  return { row };
}

async function signup(client: Db, req: Request, raw: unknown): Promise<Response> {
  const parsed = parseSignupBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;

  let inviteId: string;
  if (input.code) {
    const r = await redeem(client, req, input.code);
    if ('response' in r) return r.response;
    if (r.row.email !== input.email) return json({ error: 'email_mismatch' }, 403);
    inviteId = r.row.invite_id!;
  } else {
    const { data: invite, error: lookupError } = await lookupByToken(client, input.token!);
    if (lookupError) {
      console.error('accept-invite: lookup failed', lookupError.code);
      return json({ error: 'server_error' }, 500);
    }
    const problem = checkInvite(invite, input.email, new Date());
    if (problem || !invite) return json({ error: problem ?? 'invalid_invite' }, problem === 'email_mismatch' ? 403 : 400);
    inviteId = invite.id;
  }

  // 持有邀請連結就代表是受邀者本人，所以直接標成已確認，不寄驗證信。
  // app_metadata.invite_signup 讓 Auth 的「建立使用者前」hook 放行：公開的 /auth/v1/signup 填不了這個欄位。
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: { invite_signup: true },
  });
  if (createError || !created.user) {
    const code = createError?.code ?? '';
    if (code === 'email_exists' || code === 'user_already_exists') return json({ error: 'already_registered' }, 409);
    if (code === 'weak_password') return json({ error: 'weak_password' }, 400);
    console.error('accept-invite: createUser failed', code || createError?.status);
    return json({ error: 'server_error' }, 500);
  }
  const userId = created.user.id;

  const { error: completeError } = await client.rpc('complete_invite_signup', {
    p_invite_id: inviteId,
    p_user_id: userId,
    p_display_name: input.displayName,
    p_timezone: input.timezone,
    p_region: input.region,
  });
  if (completeError) {
    // 交易已整個還原；把剛建的使用者也刪掉（相關資料表都是連動刪除）
    const { error: rollbackError } = await client.auth.admin.deleteUser(userId);
    if (rollbackError) console.error('accept-invite: rollback failed', rollbackError.status);
    // 邀請在中間被別人用掉、撤銷或過期（併發）
    if (completeError.message.includes('invite_not_usable')) return json({ error: 'invalid_invite' }, 400);
    console.error('accept-invite: complete failed', completeError.code);
    return json({ error: 'server_error' }, 500);
  }

  return json({ ok: true });
}

async function open(client: Db, raw: unknown): Promise<Response> {
  const parsed = parseOpenBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { data: invite, error: lookupError } = await lookupByToken(client, parsed.token);
  if (lookupError) {
    console.error('accept-invite: lookup failed', lookupError.code);
    return json({ error: 'server_error' }, 500);
  }
  const problem = checkInviteState(invite, new Date());
  if (problem || !invite) return json({ error: problem ?? 'invalid_invite' }, 400);

  // 6 碼的雜湊剛好撞到別筆邀請的碼時（機率極低）換一組再試
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode();
    const { data: expiresAt, error } = await client.rpc('set_invite_code', {
      p_invite_id: invite.id,
      p_code_hash: await hashCode(code),
    });
    if (!error) return json({ ok: true, code, email: invite.email, expiresAt });
    if (error.code === '23505') continue;
    if (error.message.includes('invite_not_usable')) return json({ error: 'invalid_invite' }, 400);
    console.error('accept-invite: set code failed', error.code);
    return json({ error: 'server_error' }, 500);
  }
  return json({ error: 'server_error' }, 500);
}

async function redeemCode(client: Db, req: Request, raw: unknown): Promise<Response> {
  const parsed = parseRedeemBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const r = await redeem(client, req, parsed.code);
  if ('response' in r) return r.response;
  return json({ ok: true, email: r.row.email });
}

async function resetPassword(client: Db, raw: unknown): Promise<Response> {
  const parsed = parseResetBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const tokenHash = await hashToken(parsed.token);

  // 先標成已用再改密碼：同一條連結同時送兩次也只有一次成功
  const { data: userId, error: claimError } = await client.rpc('claim_password_reset_link', { p_token_hash: tokenHash });
  if (claimError) {
    console.error('accept-invite: claim failed', claimError.code);
    return json({ error: 'server_error' }, 500);
  }
  if (!userId) return json({ error: 'invalid_link' }, 400);

  const { error: updateError } = await client.auth.admin.updateUserById(userId as string, { password: parsed.password });
  if (updateError) {
    // 沒改成就把連結還回去，讓對方換個密碼再試
    const { error: releaseError } = await client.rpc('release_password_reset_link', { p_token_hash: tokenHash });
    if (releaseError) console.error('accept-invite: release failed', releaseError.code);
    if (updateError.code === 'weak_password') return json({ error: 'weak_password' }, 400);
    console.error('accept-invite: update password failed', updateError.code || updateError.status);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not_configured' }, 500);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  switch (parseAction(raw)) {
    case 'signup':
      return await signup(client, req, raw);
    case 'open':
      return await open(client, raw);
    case 'redeem_code':
      return await redeemCode(client, req, raw);
    case 'reset_password':
      return await resetPassword(client, raw);
    default:
      return json({ error: 'invalid_request' }, 400);
  }
});
