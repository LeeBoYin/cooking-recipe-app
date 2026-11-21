// accept-invite：持有邀請連結的人用密碼註冊（16 第六節）。M1a-01a 只做密碼註冊。
// 流程：驗證 token → 用 admin API 建立已確認 email 的使用者（不寄信）→ 一個資料庫交易認領邀請並建立註冊資料。
// 任何一步失敗就刪掉剛建立的使用者，不留下一半的資料。
// 不開 JWT 驗證：呼叫的人還沒有帳號，憑邀請連結的 token 驗證。回應與紀錄不含 email、token。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkInvite, hashToken, parseSignupBody, type InviteRow } from './invite.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
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
  const parsed = parseSignupBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;

  const { data: invite, error: lookupError } = await client
    .from('invites')
    .select('id, email, status, type, expires_at')
    .eq('token_hash', await hashToken(input.token))
    .maybeSingle<InviteRow>();
  if (lookupError) {
    console.error('accept-invite: lookup failed', lookupError.code);
    return json({ error: 'server_error' }, 500);
  }
  const problem = checkInvite(invite, input.email, new Date());
  if (problem || !invite) return json({ error: problem ?? 'invalid_invite' }, problem === 'email_mismatch' ? 403 : 400);

  // 持有邀請連結就代表是受邀者本人，所以直接標成已確認，不寄驗證信
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
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
    p_invite_id: invite.id,
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
});
