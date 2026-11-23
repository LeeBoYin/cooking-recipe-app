// admin 的純邏輯（不碰網路與資料庫，方便測試）：JWT 內容、請求格式、資料庫錯誤對應。
// 只用標準 Web API，Deno 2.1 相容。

export interface Claims {
  sub: string | null;
  aal: string | null;
}

// 只解碼內容，不驗簽：呼叫前已經用 Auth 的 getUser 驗證過這個 token
export function jwtClaims(authorization: string | null): Claims & { token: string } | null {
  const token = (authorization ?? '').replace(/^Bearer /i, '').trim();
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    return {
      token,
      sub: typeof payload.sub === 'string' ? payload.sub : null,
      aal: typeof payload.aal === 'string' ? payload.aal : null,
    };
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidV7(now = Date.now(), random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const b = new Uint8Array(16);
  const ts = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  b.set(random(10), 6);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type AdminRequest =
  | { action: 'get_config' | 'list_users' | 'list_invites' | 'get_ai_models' | 'get_ai_protection' }
  | { action: 'get_ai_usage'; month: string | null }
  | { action: 'update_ai_protection'; protection: Record<string, unknown> }
  | { action: 'set_user_fair_use'; userId: string; dailyUsd: number | null; monthlyUsd: number | null; clear: boolean }
  | { action: 'set_user_ai_paused'; userId: string; paused: boolean }
  | { action: 'list_ai_alerts'; status: 'open' | 'resolved' | 'all'; limit: number; before: string | null }
  | { action: 'resolve_ai_alert'; alertId: string; resolution: 'ok' | 'override_raised' | 'ai_paused' }
  | { action: 'list_audit_logs'; limit: number; before: string | null }
  | { action: 'create_invite'; email: string; note: string | null; plan: 'free' | 'plus'; befriendInviter: boolean }
  | { action: 'regenerate_invite' | 'revoke_invite'; inviteId: string }
  | { action: 'extend_invite'; inviteId: string; days: number }
  | { action: 'update_invite_email'; inviteId: string; email: string }
  | { action: 'set_user_status'; userId: string; status: 'active' | 'suspended' }
  | { action: 'create_reset_link'; userId: string }
  | { action: 'set_user_plan'; userId: string; plan: 'free' | 'plus' }
  | {
      action: 'update_config';
      maxUsers: number | null;
      softDeleteRetentionDays: number | null;
      aiEnabled: boolean | null;
      aiMonthlyBudgetUsd: number | null;
    };

export type ParseResult = { ok: true; value: AdminRequest } | { ok: false; error: string };

const bad: ParseResult = { ok: false, error: 'invalid_request' };

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

export function parseRequest(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) return bad;
  const b = body as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

  switch (b.action) {
    case 'get_config':
    case 'list_users':
    case 'list_invites':
    case 'get_ai_models':
    case 'get_ai_protection':
      return { ok: true, value: { action: b.action } };
    case 'get_ai_usage': {
      // month：'YYYY-MM'（UTC 的月份），不帶就是本月
      const month = b.month === undefined || b.month === null ? null : typeof b.month === 'string' && /^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(b.month) ? b.month : false;
      return month === false ? bad : { ok: true, value: { action: 'get_ai_usage', month } };
    }
    case 'update_ai_protection':
      // 格式與範圍由資料庫的 ai_protection_valid 檢查，這裡只確認是物件
      return typeof b.protection === 'object' && b.protection !== null && !Array.isArray(b.protection)
        ? { ok: true, value: { action: 'update_ai_protection', protection: b.protection as Record<string, unknown> } }
        : bad;
    case 'set_user_fair_use': {
      const usd = (v: unknown) => (v === undefined || v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v * 100) / 100 : undefined);
      const daily = usd(b.dailyUsd);
      const monthly = usd(b.monthlyUsd);
      const clear = b.clear === undefined ? false : b.clear;
      if (!id(b.userId) || daily === undefined || monthly === undefined || typeof clear !== 'boolean') return bad;
      if (!clear && daily === null && monthly === null) return bad;
      return { ok: true, value: { action: 'set_user_fair_use', userId: b.userId, dailyUsd: daily, monthlyUsd: monthly, clear } };
    }
    case 'set_user_ai_paused':
      return id(b.userId) && typeof b.paused === 'boolean'
        ? { ok: true, value: { action: 'set_user_ai_paused', userId: b.userId, paused: b.paused } }
        : bad;
    case 'list_ai_alerts': {
      const status = b.status === undefined ? 'open' : b.status;
      const limit = b.limit === undefined ? 50 : int(b.limit, 1, 200);
      const before = b.before === undefined || b.before === null ? null : typeof b.before === 'string' && !Number.isNaN(Date.parse(b.before)) ? b.before : false;
      if ((status !== 'open' && status !== 'resolved' && status !== 'all') || limit === null || before === false) return bad;
      return { ok: true, value: { action: 'list_ai_alerts', status, limit, before } };
    }
    case 'resolve_ai_alert':
      return id(b.alertId) && (b.resolution === 'ok' || b.resolution === 'override_raised' || b.resolution === 'ai_paused')
        ? { ok: true, value: { action: 'resolve_ai_alert', alertId: b.alertId, resolution: b.resolution } }
        : bad;
    case 'list_audit_logs': {
      const limit = b.limit === undefined ? 50 : int(b.limit, 1, 200);
      const before = b.before === undefined || b.before === null ? null : typeof b.before === 'string' && !Number.isNaN(Date.parse(b.before)) ? b.before : false;
      if (limit === null || before === false) return bad;
      return { ok: true, value: { action: 'list_audit_logs', limit, before } };
    }
    case 'create_invite': {
      const email = typeof b.email === 'string' ? b.email.trim() : '';
      if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 254) return { ok: false, error: 'invalid_invite_input' };
      const note = b.note === undefined || b.note === null ? null : typeof b.note === 'string' ? b.note.trim() || null : false;
      if (note === false || (note !== null && [...note].length > 100)) return { ok: false, error: 'invalid_invite_input' };
      const plan = b.plan === undefined ? 'free' : b.plan;
      if (plan !== 'free' && plan !== 'plus') return { ok: false, error: 'invalid_invite_input' };
      const befriend = b.befriendInviter === undefined ? true : b.befriendInviter;
      if (typeof befriend !== 'boolean') return bad;
      return { ok: true, value: { action: 'create_invite', email, note, plan, befriendInviter: befriend } };
    }
    case 'regenerate_invite':
    case 'revoke_invite':
      return id(b.inviteId) ? { ok: true, value: { action: b.action, inviteId: b.inviteId } } : bad;
    case 'extend_invite': {
      const days = int(b.days, 1, 60);
      return id(b.inviteId) && days !== null ? { ok: true, value: { action: 'extend_invite', inviteId: b.inviteId, days } } : bad;
    }
    case 'update_invite_email': {
      const email = typeof b.email === 'string' ? b.email.trim() : '';
      if (!id(b.inviteId)) return bad;
      if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 254) return { ok: false, error: 'invalid_invite_input' };
      return { ok: true, value: { action: 'update_invite_email', inviteId: b.inviteId, email } };
    }
    case 'set_user_status':
      return id(b.userId) && (b.status === 'active' || b.status === 'suspended')
        ? { ok: true, value: { action: 'set_user_status', userId: b.userId, status: b.status } }
        : bad;
    case 'create_reset_link':
      return id(b.userId) ? { ok: true, value: { action: 'create_reset_link', userId: b.userId } } : bad;
    case 'set_user_plan':
      return id(b.userId) && (b.plan === 'free' || b.plan === 'plus')
        ? { ok: true, value: { action: 'set_user_plan', userId: b.userId, plan: b.plan } }
        : bad;
    case 'update_config': {
      const maxUsers = b.maxUsers === undefined || b.maxUsers === null ? null : int(b.maxUsers, 1, 1000);
      const days =
        b.softDeleteRetentionDays === undefined || b.softDeleteRetentionDays === null ? null : int(b.softDeleteRetentionDays, 1, 365);
      const aiEnabled = b.aiEnabled === undefined || b.aiEnabled === null ? null : typeof b.aiEnabled === 'boolean' ? b.aiEnabled : undefined;
      const budget =
        b.aiMonthlyBudgetUsd === undefined || b.aiMonthlyBudgetUsd === null
          ? null
          : typeof b.aiMonthlyBudgetUsd === 'number' && Number.isFinite(b.aiMonthlyBudgetUsd) && b.aiMonthlyBudgetUsd >= 0 && b.aiMonthlyBudgetUsd <= 10000
            ? Math.round(b.aiMonthlyBudgetUsd * 100) / 100
            : undefined;
      if ((b.maxUsers != null && maxUsers === null) || (b.softDeleteRetentionDays != null && days === null)) return bad;
      if (aiEnabled === undefined || budget === undefined) return bad;
      if (maxUsers === null && days === null && aiEnabled === null && budget === null) return bad;
      return {
        ok: true,
        value: { action: 'update_config', maxUsers, softDeleteRetentionDays: days, aiEnabled, aiMonthlyBudgetUsd: budget },
      };
    }
    default:
      return bad;
  }
}

// 資料庫函式丟出的錯誤（訊息是我們自己寫的代號）轉成 HTTP 狀態與代號；沒見過的一律 500，不外洩內容
const DB_ERRORS: ReadonlyArray<readonly [string, number]> = [
  ['forbidden', 403],
  ['invite_not_usable', 409],
  ['invite_pending_exists', 409],
  ['already_registered', 409],
  ['invite_capacity', 409],
  ['invalid_invite_input', 400],
  ['invalid_input', 400],
  ['cannot_target_self', 400],
  ['cannot_target_admin', 400],
  ['user_not_found', 404],
  ['alert_not_found', 404],
];

export function mapDbError(message: string | undefined): { error: string; status: number } {
  const hit = DB_ERRORS.find(([code]) => message?.includes(code));
  return hit ? { error: hit[0], status: hit[1] } : { error: 'server_error', status: 500 };
}
