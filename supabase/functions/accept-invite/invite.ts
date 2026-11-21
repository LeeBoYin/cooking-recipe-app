// accept-invite 的純邏輯（不碰網路與資料庫，方便測試）。動作：signup（密碼註冊）、open（打開邀請連結，產生 6 碼邀請碼）、
// redeem_code（用邀請碼換回邀請）、reset_password（用重設連結改密碼）。
// 只用標準 Web API，Deno 2.1 相容。

export interface SignupInput {
  // 邀請連結的 token 或 6 碼邀請碼，擇一（iPhone 從主畫面打開 App 時用邀請碼）
  token?: string;
  code?: string;
  email: string;
  password: string;
  displayName: string;
  timezone: string;
  region: string;
}

export type ParseResult = { ok: true; value: SignupInput } | { ok: false; error: string };

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt 只看前 72 bytes，超過的部分不會被驗證

const DEFAULT_TIMEZONE = 'Asia/Taipei';
const DEFAULT_REGION = 'TW';
// 和資料庫的 private.is_region_code 一致：兩個大寫字母的國碼，或加上子區（US-CA）
const REGION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validToken(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 16 && v.length <= 200;
}

function parseCredential(b: Record<string, unknown>): { token: string } | { code: string } | null {
  if (b.token !== undefined) return validToken(b.token) ? { token: b.token } : null;
  const code = normalizeCode(b.code);
  return code ? { code } : null;
}

// 手機送來的時區與地區只是預設值，不合格就用預設，不讓註冊失敗
export function parseSignupBody(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_request' };
  const b = body as Record<string, unknown>;
  const credential = parseCredential(b);
  if (!credential) return { ok: false, error: 'invalid_invite' };
  if (typeof b.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(b.email.trim())) {
    return { ok: false, error: 'invalid_request' };
  }
  if (typeof b.password !== 'string' || new TextEncoder().encode(b.password).length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: 'weak_password' };
  }
  if ([...b.password].length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'weak_password' };

  const name = typeof b.displayName === 'string' ? b.displayName.trim() : '';
  const timezone = typeof b.timezone === 'string' && validTimezone(b.timezone) ? b.timezone : DEFAULT_TIMEZONE;
  const region = typeof b.region === 'string' && REGION_CODE.test(b.region) ? b.region : DEFAULT_REGION;
  return {
    ok: true,
    value: {
      ...credential,
      email: b.email.trim().toLowerCase(),
      password: b.password,
      displayName: [...name].length >= 1 && [...name].length <= 20 ? name : '我',
      timezone,
      region,
    },
  };
}

// 與資料庫 create_invite 一致：token 的 SHA-256，小寫十六進位
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface InviteRow {
  id: string;
  email: string;
  status: string;
  type: string;
  expires_at: string;
}

// 驗證邀請：存在、沒撤銷、還沒接受、沒過期、email 相符、是一般邀請。
// 回傳錯誤代碼（給畫面決定說明文字），沒有問題回傳 null。
export function checkInvite(invite: InviteRow | null, email: string, now: Date): string | null {
  const state = checkInviteState(invite, now);
  if (state) return state;
  if (invite!.email !== email.trim().toLowerCase()) return 'email_mismatch';
  return null;
}

// ---- 動作：open（打開邀請連結）、redeem_code（兌換邀請碼）、reset_password（重設密碼）----

export type Action = 'signup' | 'open' | 'redeem_code' | 'reset_password';

// 沒有 action 欄位時當作 signup（M1a-01a 的呼叫方式）
export function parseAction(body: unknown): Action | null {
  if (typeof body !== 'object' || body === null) return null;
  const a = (body as Record<string, unknown>).action;
  if (a === undefined) return 'signup';
  return a === 'signup' || a === 'open' || a === 'redeem_code' || a === 'reset_password' ? a : null;
}

// 去掉容易看錯的 0/O、1/I/L
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

// 用拒絕取樣避免取餘數造成的偏差（256 不是 31 的倍數）
export function generateInviteCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const byte of random(16)) {
      if (byte < limit && out.length < CODE_LENGTH) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return out;
}

// 使用者輸入的邀請碼：不分大小寫，容許空白與連字號（畫面顯示成 K7Q 2MX）。不合格回傳 null。
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code) ? code : null;
}

// 邀請碼的雜湊要和來源的雜湊分開，免得同一個字串在兩個地方有相同的雜湊
export async function hashCode(code: string): Promise<string> {
  return await hashToken(`code:${code}`);
}

// 辨識「同一個來源」：用連線的 IP，雜湊後才送進資料庫（不存原始 IP）。
// Supabase 的 Edge Function 在代理後面，真正的 IP 在 cf-connecting-ip／x-forwarded-for 的第一個。
// 拿不到時全部歸在同一個來源（寧可大家一起被暫停，也不讓人繞過）。
export function clientIp(headers: Headers): string {
  const ip = headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0] ?? '';
  return ip.trim() || 'unknown';
}

export async function hashSource(ip: string): Promise<string> {
  return await hashToken(`source:${ip}`);
}

export function parseOpenBody(body: unknown): { ok: true; token: string } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  return validToken(b.token) ? { ok: true, token: b.token } : { ok: false, error: 'invalid_invite' };
}

export function parseRedeemBody(body: unknown): { ok: true; code: string } | { ok: false; error: string } {
  const code = normalizeCode((body as Record<string, unknown> | null)?.code);
  return code ? { ok: true, code } : { ok: false, error: 'invalid_code' };
}

export function validatePassword(password: unknown): password is string {
  return typeof password === 'string'
    && new TextEncoder().encode(password).length <= MAX_PASSWORD_LENGTH
    && [...password].length >= MIN_PASSWORD_LENGTH;
}

export function parseResetBody(body: unknown): { ok: true; token: string; password: string } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!validToken(b.token)) return { ok: false, error: 'invalid_link' };
  if (!validatePassword(b.password)) return { ok: false, error: 'weak_password' };
  return { ok: true, token: b.token, password: b.password };
}

// 打開邀請連結時只看邀請本身的狀態（不需要 email）
export function checkInviteState(invite: InviteRow | null, now: Date): string | null {
  if (!invite) return 'invalid_invite';
  if (invite.status === 'revoked') return 'invalid_invite';
  if (invite.status === 'accepted') return 'invite_used';
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return 'invite_expired';
  if (invite.type !== 'account') return 'invite_type_unsupported';
  return null;
}
