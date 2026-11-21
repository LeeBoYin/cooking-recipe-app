// 邀請與註冊（呼叫 `accept-invite` Edge Function，見 16 第六節）。
// 連結格式：邀請 `/invite/<token>`、重設密碼 `/reset/<token>`。回應與紀錄都不放 email、token、邀請碼。
import { supabase } from './supabase.ts';

export type InviteError =
  | 'invalid_invite' // 找不到或已撤銷
  | 'invite_used'
  | 'invite_expired'
  | 'invite_type_unsupported'
  | 'invalid_code'
  | 'code_locked'
  | 'email_mismatch'
  | 'already_registered'
  | 'weak_password'
  | 'invalid_link'
  | 'network'
  | 'unknown';

const KNOWN: ReadonlySet<string> = new Set<InviteError>([
  'invalid_invite',
  'invite_used',
  'invite_expired',
  'invite_type_unsupported',
  'invalid_code',
  'code_locked',
  'email_mismatch',
  'already_registered',
  'weak_password',
  'invalid_link',
]);

// 後端回的 `{ error }` 轉成畫面用的代碼；沒見過的都算 unknown
export function toInviteError(body: unknown): InviteError {
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof code === 'string' && KNOWN.has(code) ? (code as InviteError) : 'unknown';
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: InviteError };

async function call<T>(body: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase().functions.invoke('accept-invite', { body });
    if (!error) return { ok: true, value: data as T };
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      return { ok: false, error: toInviteError(await context.json().catch(() => null)) };
    }
    return { ok: false, error: 'network' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface OpenedInvite {
  email: string;
  code: string; // 6 碼，1 小時內有效
  expiresAt: string;
}

// 打開邀請連結：驗證並產生 6 碼邀請碼。每次呼叫都會讓前一組邀請碼作廢，所以同一個 token 只呼叫一次。
const opened = new Map<string, Promise<Result<OpenedInvite>>>();
export function openInvite(token: string): Promise<Result<OpenedInvite>> {
  let p = opened.get(token);
  if (!p) {
    p = call<OpenedInvite>({ action: 'open', token });
    opened.set(token, p);
  }
  return p;
}

export function redeemInviteCode(code: string): Promise<Result<{ email: string }>> {
  return call<{ email: string }>({ action: 'redeem_code', code });
}

export type Credential = { token: string } | { code: string };

function deviceDefaults() {
  let timezone = 'Asia/Taipei';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
  } catch {
    // 用預設值
  }
  return { timezone };
}

// 密碼註冊成功後接著登入；登入狀態改變，畫面自動換成新手引導
export async function signUpWithPassword(credential: Credential, email: string, password: string): Promise<InviteError | null> {
  const r = await call<{ ok: true }>({ action: 'signup', ...credential, email, password, ...deviceDefaults() });
  if (!r.ok) return r.error;
  try {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    return error ? 'unknown' : null;
  } catch {
    return 'network';
  }
}

export async function resetPassword(token: string, password: string): Promise<InviteError | null> {
  const r = await call<{ ok: true }>({ action: 'reset_password', token, password });
  return r.ok ? null : r.error;
}

// ---- Google ----

export const GOOGLE_RETURN_PATH = '/';

export async function signInWithGoogle(email?: string): Promise<InviteError | null> {
  try {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${GOOGLE_RETURN_PATH}`,
        queryParams: email ? { login_hint: email } : undefined,
      },
    });
    return error ? 'unknown' : null;
  } catch {
    return 'network';
  }
}

// 被 Auth 的「建立使用者前」hook 擋下時，Supabase 會帶著錯誤回到網址（query 或 hash）。
// 讀出來後把網址清乾淨，不留在瀏覽紀錄裡。
export function takeGoogleReturnError(): 'invite_required' | 'other' | null {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
  const description = `${params.get('error_description') ?? ''} ${params.get('error_code') ?? ''}`;
  if (!params.has('error') && !params.has('error_description')) return null;
  window.history.replaceState(null, '', url.pathname);
  return /invite_required|signup_requires_invite/.test(description) ? 'invite_required' : 'other';
}

// Google 第一次登入後還沒有註冊資料：認領邀請並建立（同一個交易）。已經有資料就什麼也不做。
export type GoogleCompleteResult = 'ready' | 'no_invite' | 'network';

export async function completeGoogleSignupIfNeeded(userId: string): Promise<GoogleCompleteResult> {
  try {
    const { data, error } = await supabase().from('user_settings').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) return 'network';
    if (data) return 'ready';
    const { error: rpcError } = await supabase().rpc('complete_google_signup', { p_timezone: deviceDefaults().timezone });
    if (!rpcError) return 'ready';
    return rpcError.message.includes('invite_not_usable') || rpcError.message.includes('not_google_user') ? 'no_invite' : 'network';
  } catch {
    return 'network';
  }
}
