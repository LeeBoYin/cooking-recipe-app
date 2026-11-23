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
  | 'alert_not_found'
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
  'alert_not_found',
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
  ai_enabled: boolean;
  ai_monthly_budget_usd: number;
  registered_count: number;
  pending_invite_count: number;
}

export type Plan = 'free' | 'plus';

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'system_admin';
  status: 'active' | 'suspended';
  plan: Plan;
  created_at: string;
  last_active_at: string | null;
  accepted_via: 'password' | 'google' | null;
  ai_paused: boolean;
  // 管理員個別調整的合理使用上限；沒有覆寫是 null，只覆寫一邊時另一邊沒有欄位
  fair_use_override: { daily_usd?: number; monthly_usd?: number } | null;
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

// 設定檔唯讀：每個 AI 任務用的模型（後端 _shared/ai-models.ts）
export interface AiModelRow {
  task: string;
  model: string;
  effort: string;
  thinking: 'adaptive' | 'off';
  max_output_tokens: number;
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

// ── AI 用量與保護（M1a-04 的後端、M1a-13 的畫面）──

export type BudgetState = 'ok' | 'degraded' | 'exhausted';

export interface AiUsageTaskRow {
  task: string;
  model: string;
  calls: number;
  failures: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  // 輸出檢查的結果（只有首頁點子、對話、展開做法會記；其他任務三個都是 0）
  passed: number;
  rewritten: number;
  blocked: number;
}

export interface AiUsageUser {
  user_id: string;
  display_name: string | null;
  cost_usd: number;
  calls: number;
}

export interface AiUsage {
  month: string; // 'YYYY-MM'（UTC）
  spent_usd: number;
  budget_usd: number;
  ratio: number;
  state: BudgetState;
  call_count: number;
  console: { hard_cap_usd: number; budget_usd: number; margin_usd: number; spent_vs_cap_ratio: number | null };
  open_alert_count: number;
  paused_user_count: number;
  by_task: AiUsageTaskRow[];
  top_users: AiUsageUser[];
}

export type AiAlertKind =
  | 'rate_limited'
  | 'fair_use_daily'
  | 'fair_use_monthly'
  | 'repeated_input'
  | 'oversized_input'
  | 'multi_device_burst'
  | 'budget_80'
  | 'budget_100';

export type AiAlertResolution = 'ok' | 'override_raised' | 'ai_paused';
export type AiAlertStatus = 'open' | 'resolved';

export interface AiAlert {
  id: string;
  user_id: string | null; // 空的是全站的提醒（預算 80%／100%）
  display_name: string | null;
  ai_paused: boolean | null;
  kind: AiAlertKind;
  detail: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution: AiAlertResolution | null;
}

export interface FairUseLimit {
  dailyUsd: number;
  monthlyUsd: number;
}

export interface AiProtection {
  schemaVersion: 1;
  perMinute: number;
  perHour: number;
  fairUse: { free: FairUseLimit; plus: FairUseLimit };
  anomaly: {
    rateBlockAlerts: number;
    repeatedInputCount: number;
    oversizedStreak: number;
    oversizedRatio: number;
    burstCalls: number;
    burstDevices: number;
    burstWindowMinutes: number;
  };
  consoleHardCapUsd: number;
}

export interface AiProtectionInfo {
  protection: AiProtection;
  ai_monthly_budget_usd: number;
  ai_budget_alert_ratio: number;
  console: { hard_cap_usd: number; budget_usd: number; margin_usd: number; budget_within_cap: boolean };
}

// 前端先擋掉資料庫會拒絕的值（`ai_protection_valid`，見 16），回傳第一個不合格欄位的代號；都合格回 null。
// 欄位的範圍和資料庫的 JSON Schema 一致；資料庫仍是最後一道。
export type ProtectionIssue =
  | 'perMinute'
  | 'perHour'
  | 'perHourBelowMinute'
  | 'fairUse'
  | 'fairUseMonthlyBelowDaily'
  | 'anomaly'
  | 'consoleHardCapUsd';

function inRange(v: unknown, min: number, max: number, integer: boolean): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
}

export function protectionIssue(p: AiProtection): ProtectionIssue | null {
  if (!inRange(p.perMinute, 1, 600, true)) return 'perMinute';
  if (!inRange(p.perHour, 1, 6000, true)) return 'perHour';
  if (p.perHour < p.perMinute) return 'perHourBelowMinute';
  for (const plan of ['free', 'plus'] as const) {
    const l = p.fairUse[plan];
    if (!inRange(l.dailyUsd, 0, 100000, false) || !inRange(l.monthlyUsd, 0, 100000, false)) return 'fairUse';
    if (l.monthlyUsd < l.dailyUsd) return 'fairUseMonthlyBelowDaily';
  }
  const a = p.anomaly;
  if (
    !inRange(a.rateBlockAlerts, 1, 10000, true) ||
    !inRange(a.repeatedInputCount, 2, 10000, true) ||
    !inRange(a.oversizedStreak, 2, 1000, true) ||
    !inRange(a.oversizedRatio, 0.5, 1, false) ||
    !inRange(a.burstCalls, 2, 10000, true) ||
    !inRange(a.burstDevices, 2, 100, true) ||
    !inRange(a.burstWindowMinutes, 1, 1440, true)
  ) {
    return 'anomaly';
  }
  if (!inRange(p.consoleHardCapUsd, 0, 100000, false)) return 'consoleHardCapUsd';
  return null;
}

// 個人覆寫的檢查：至少填一邊、不能是負數；兩邊都填時每月不低於每日
export type FairUseIssue = 'empty' | 'range' | 'monthlyBelowDaily';
export function fairUseIssue(daily: number | null, monthly: number | null): FairUseIssue | null {
  if (daily === null && monthly === null) return 'empty';
  if ((daily !== null && !inRange(daily, 0, 100000, false)) || (monthly !== null && !inRange(monthly, 0, 100000, false))) return 'range';
  if (daily !== null && monthly !== null && monthly < daily) return 'monthlyBelowDaily';
  return null;
}

// 用量頁可選的月份：本月加前 12 個月，新的在前（UTC，和後端算月份的方式一樣）
export function usageMonths(now: Date, count = 13): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// 被擋下的比率 = 被擋下 ÷（通過＋重寫後通過＋被擋下）；沒有檢查結果的任務是 null
export function blockedRate(row: Pick<AiUsageTaskRow, 'passed' | 'rewritten' | 'blocked'>): number | null {
  const checked = row.passed + row.rewritten + row.blocked;
  return checked > 0 ? row.blocked / checked : null;
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
  aiUsage: (month?: string) => adminCall<AiUsage>({ action: 'get_ai_usage', month }),
  aiAlerts: (status: AiAlertStatus, before?: string) =>
    adminCall<AiAlert[]>({ action: 'list_ai_alerts', status, limit: 50, before }),
  resolveAiAlert: (alertId: string, resolution: AiAlertResolution) => adminCall<null>({ action: 'resolve_ai_alert', alertId, resolution }),
  setUserAiPaused: (userId: string, paused: boolean) => adminCall<null>({ action: 'set_user_ai_paused', userId, paused }),
  setUserFairUse: (userId: string, input: { dailyUsd?: number | null; monthlyUsd?: number | null; clear?: boolean }) =>
    adminCall<{ daily_usd?: number; monthly_usd?: number } | null>({ action: 'set_user_fair_use', userId, ...input }),
  aiProtection: () => adminCall<AiProtectionInfo>({ action: 'get_ai_protection' }),
  updateAiProtection: (protection: AiProtection) => adminCall<AiProtection>({ action: 'update_ai_protection', protection }),
  aiModels: () => adminCall<AiModelRow[]>({ action: 'get_ai_models' }),
  setUserPlan: (userId: string, plan: Plan) => adminCall<null>({ action: 'set_user_plan', userId, plan }),
  updateConfig: (input: { maxUsers?: number; softDeleteRetentionDays?: number; aiEnabled?: boolean; aiMonthlyBudgetUsd?: number }) =>
    adminCall<{ max_users: number; soft_delete_retention_days: number; ai_enabled: boolean; ai_monthly_budget_usd: number }>({
      action: 'update_config',
      ...input,
    }),
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
