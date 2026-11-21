// 管理後台的資料存取（呼叫 `admin` Edge Function，見 16 第六節）與兩步驟驗證（Supabase Auth 的 TOTP）。
// 後台只拿得到帳號資料與統計；回應與畫面都不把 email、token 寫進紀錄或網址。
import { supabase } from './supabase.ts';

export type AdminError =
  | 'unauthorized'
  | 'forbidden'
  | 'mfa_required'
  | 'invite_not_usable'
  | 'invite_pending_exists'
  | 'already_registered'
  | 'invite_capacity'
  | 'invalid_invite_input'
  | 'invalid_input'
  | 'invalid_request'
  | 'cannot_target_self'
  | 'cannot_target_admin'
  | 'user_not_found'
  | 'network'
  | 'server_error';

const KNOWN: ReadonlySet<string> = new Set<AdminError>([
  'unauthorized',
  'forbidden',
  'mfa_required',
  'invite_not_usable',
  'invite_pending_exists',
  'already_registered',
  'invite_capacity',
  'invalid_invite_input',
  'invalid_input',
  'invalid_request',
  'cannot_target_self',
  'cannot_target_admin',
  'user_not_found',
  'server_error',
]);

export function toAdminError(body: unknown): AdminError {
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof code === 'string' && KNOWN.has(code) ? (code as AdminError) : 'server_error';
}

export class AdminCallError extends Error {
  constructor(readonly code: AdminError) {
    super(code);
  }
}

// 失敗時丟 AdminCallError，讓 TanStack Query 的 mutation／query 直接用
export async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await supabase().functions.invoke('admin', { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) throw new AdminCallError(toAdminError(await context.json().catch(() => null)));
      throw new AdminCallError('network');
    }
    return (data as { data: T }).data;
  } catch (e) {
    throw e instanceof AdminCallError ? e : new AdminCallError('network');
  }
}

export function adminErrorOf(e: unknown): AdminError {
  return e instanceof AdminCallError ? e.code : 'server_error';
}

export interface AdminConfig {
  max_users: number;
  soft_delete_retention_days: number;
  registered_count: number;
  pending_invite_count: number;
}

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'system_admin';
  status: 'active' | 'suspended';
  created_at: string;
  last_active_at: string | null;
  accepted_via: 'password' | 'google' | null;
}

export type InviteState = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface AdminInvite {
  id: string;
  email: string;
  note: string | null;
  plan: 'free' | 'plus';
  state: InviteState;
  befriend_inviter: boolean;
  inviter_name: string | null;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

export interface AuditLog {
  id: string;
  admin_user_id: string;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface LinkResult {
  token: string;
  expires_at: string;
}

export const adminApi = {
  config: () => adminCall<AdminConfig>({ action: 'get_config' }),
  users: () => adminCall<AdminUser[]>({ action: 'list_users' }),
  invites: () => adminCall<AdminInvite[]>({ action: 'list_invites' }),
  auditLogs: (before?: string) => adminCall<AuditLog[]>({ action: 'list_audit_logs', limit: 50, before }),
  createInvite: (input: { email: string; note: string; plan: 'free' | 'plus'; befriendInviter: boolean }) =>
    adminCall<{ invite_id: string; token: string; expires_at: string }>({ action: 'create_invite', ...input }),
  regenerateInvite: (inviteId: string) =>
    adminCall<{ invite_id: string; token: string; expires_at: string }>({ action: 'regenerate_invite', inviteId }),
  revokeInvite: (inviteId: string) => adminCall<null>({ action: 'revoke_invite', inviteId }),
  extendInvite: (inviteId: string, days: number) => adminCall<string>({ action: 'extend_invite', inviteId, days }),
  updateInviteEmail: (inviteId: string, email: string) => adminCall<null>({ action: 'update_invite_email', inviteId, email }),
  setUserStatus: (userId: string, status: 'active' | 'suspended') => adminCall<null>({ action: 'set_user_status', userId, status }),
  createResetLink: (userId: string) => adminCall<{ link_id: string; token: string; expires_at: string }>({ action: 'create_reset_link', userId }),
  updateConfig: (input: { maxUsers?: number; softDeleteRetentionDays?: number }) =>
    adminCall<{ max_users: number; soft_delete_retention_days: number }>({ action: 'update_config', ...input }),
};

// 連結格式（02 K）：邀請 /invite/<token>、重設密碼 /reset/<token>。token 是 base64url，不需要再編碼。
export function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite/${token}`;
}
export function resetUrl(origin: string, token: string): string {
  return `${origin}/reset/${token}`;
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── 兩步驟驗證（TOTP）──

export type MfaError = 'invalid_code' | 'network';

export async function verifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error) throw new AdminCallError('network');
  return data.totp[0]?.id ?? null; // data.totp 只含已驗證的
}

export interface TotpEnrollment {
  factorId: string;
  qrCode: string; // SVG 的 data URI
  secret: string;
}

// 開始綁定：先清掉之前沒綁完的（一個帳號同時只留一個）再建立新的
export async function enrollTotp(): Promise<TotpEnrollment> {
  const auth = supabase().auth;
  const { data: factors } = await auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) throw new AdminCallError('network');
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

// 驗證碼（綁定時與每次登入）。成功後這個登入階段升級成 aal2，Auth 會換發新的 token。
export async function verifyTotp(factorId: string, code: string): Promise<MfaError | null> {
  const auth = supabase().auth;
  const { data: challenge, error: challengeError } = await auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) return 'network';
  const { error } = await auth.mfa.verify({ factorId, challengeId: challenge.id, code });
  if (!error) return null;
  return error.status && error.status >= 500 ? 'network' : 'invalid_code';
}
