// accept-invite 的純邏輯（不碰網路與資料庫，方便測試）。
// 只用標準 Web API，Deno 2.1 相容。

export interface SignupInput {
  token: string;
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

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// 手機送來的時區與地區只是預設值，不合格就用預設，不讓註冊失敗
export function parseSignupBody(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_request' };
  const b = body as Record<string, unknown>;
  if (typeof b.token !== 'string' || b.token.length < 16 || b.token.length > 200) {
    return { ok: false, error: 'invalid_invite' };
  }
  if (typeof b.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(b.email.trim())) {
    return { ok: false, error: 'invalid_request' };
  }
  if (typeof b.password !== 'string' || new TextEncoder().encode(b.password).length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: 'weak_password' };
  }
  if ([...b.password].length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'weak_password' };

  const name = typeof b.displayName === 'string' ? b.displayName.trim() : '';
  const timezone = typeof b.timezone === 'string' && validTimezone(b.timezone) ? b.timezone : DEFAULT_TIMEZONE;
  const region = typeof b.region === 'string' && /^[A-Z]{2}$/.test(b.region) ? b.region : DEFAULT_REGION;
  return {
    ok: true,
    value: {
      token: b.token,
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
  if (!invite) return 'invalid_invite';
  if (invite.status === 'revoked') return 'invalid_invite';
  if (invite.status === 'accepted') return 'invite_used';
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return 'invite_expired';
  if (invite.type !== 'account') return 'invite_type_unsupported';
  if (invite.email !== email.trim().toLowerCase()) return 'email_mismatch';
  return null;
}
