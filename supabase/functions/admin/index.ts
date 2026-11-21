// admin（16 第六節、04 ADR-15）：管理後台所有的讀取與操作都經過這裡。
// 每次請求依序檢查：已登入（Auth 驗證 token）→ 是啟用中的系統管理員 → 這次登入通過兩步驟驗證（JWT 的 aal2）。
// 設計上只回傳帳號資料與統計，沒有讀取使用者食譜、食材、照片的動作。
// 寫入動作都是資料庫函式，在同一個交易裡檢查、操作並寫入 admin_audit_logs。
// 回應與紀錄不含 email、token。
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { publicTaskList } from '../_shared/ai-models.ts';
import { type AdminRequest, jwtClaims, mapDbError, parseRequest, uuidV7 } from './guard.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

// 停用就封鎖登入與換發 token；資料庫的 status 另外讓既有的 token 立刻失效（RLS 看 status）
const BAN = '876000h';

async function run(client: SupabaseClient, admin: string, req: AdminRequest): Promise<{ data: unknown } | { error: string; status: number }> {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, { p_admin: admin, ...args });
    if (error) {
      const mapped = mapDbError(error.message);
      if (mapped.status === 500) console.error(`admin: ${fn} failed`, error.code);
      return { error: mapped.error, status: mapped.status };
    }
    return { data };
  };
  const first = (r: { data: unknown } | { error: string; status: number }) =>
    'error' in r ? r : { data: Array.isArray(r.data) ? r.data[0] : r.data };

  switch (req.action) {
    case 'get_config':
      return await rpc('admin_get_config', {});
    case 'get_ai_models':
      return { data: publicTaskList() }; // 設定檔唯讀顯示，不經資料庫
    case 'get_ai_protection':
      return await rpc('admin_get_ai_protection', {});
    case 'get_ai_usage':
      return await rpc('admin_get_ai_usage', {});
    case 'update_ai_protection':
      return await rpc('admin_update_ai_protection', { p_protection: req.protection });
    case 'set_user_fair_use':
      return await rpc('admin_set_user_fair_use', {
        p_user_id: req.userId,
        p_daily_usd: req.dailyUsd,
        p_monthly_usd: req.monthlyUsd,
        p_clear: req.clear,
      });
    case 'set_user_ai_paused':
      return await rpc('admin_set_user_ai_paused', { p_user_id: req.userId, p_paused: req.paused });
    case 'list_ai_alerts':
      return await rpc('admin_list_ai_alerts', { p_status: req.status, p_limit: req.limit, p_before: req.before });
    case 'resolve_ai_alert':
      return await rpc('admin_resolve_ai_alert', { p_alert_id: req.alertId, p_resolution: req.resolution });
    case 'list_users':
      return await rpc('admin_list_users', {});
    case 'set_user_plan':
      return await rpc('admin_set_user_plan', { p_user_id: req.userId, p_plan: req.plan });
    case 'list_invites':
      return await rpc('admin_list_invites', {});
    case 'list_audit_logs':
      return await rpc('admin_list_audit_logs', { p_limit: req.limit, p_before: req.before });
    case 'create_invite':
      return first(
        await rpc('admin_create_invite', {
          p_id: uuidV7(),
          p_email: req.email,
          p_note: req.note,
          p_plan: req.plan,
          p_befriend_inviter: req.befriendInviter,
        }),
      );
    case 'regenerate_invite':
      return first(await rpc('admin_regenerate_invite', { p_invite_id: req.inviteId }));
    case 'revoke_invite':
      return await rpc('admin_revoke_invite', { p_invite_id: req.inviteId });
    case 'extend_invite':
      return await rpc('admin_extend_invite', { p_invite_id: req.inviteId, p_days: req.days });
    case 'update_invite_email':
      return await rpc('admin_update_invite_email', { p_invite_id: req.inviteId, p_email: req.email });
    case 'create_reset_link':
      return first(await rpc('admin_create_reset_link', { p_id: uuidV7(), p_user_id: req.userId }));
    case 'update_config':
      return await rpc('admin_update_config', {
        p_max_users: req.maxUsers,
        p_soft_delete_retention_days: req.softDeleteRetentionDays,
        p_ai_enabled: req.aiEnabled,
        p_ai_monthly_budget_usd: req.aiMonthlyBudgetUsd,
      });
    case 'set_user_status': {
      // 先改 Auth 的封鎖，再改資料庫（含紀錄）；資料庫那步失敗就把封鎖還原
      const ban = req.status === 'suspended';
      const { error: banError } = await client.auth.admin.updateUserById(req.userId, { ban_duration: ban ? BAN : 'none' });
      if (banError) {
        if (banError.status === 404 || banError.code === 'user_not_found') return { error: 'user_not_found', status: 404 };
        console.error('admin: ban failed', banError.code ?? banError.status);
        return { error: 'server_error', status: 500 };
      }
      const result = await rpc('admin_set_user_status', { p_user_id: req.userId, p_status: req.status });
      if ('error' in result) {
        await client.auth.admin.updateUserById(req.userId, { ban_duration: ban ? 'none' : BAN }).catch(() => undefined);
      }
      return result;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'not_configured' }, 500);
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. 已登入：token 交給 Auth 驗證（簽章、有沒有過期、帳號有沒有被封鎖）
  const claims = jwtClaims(req.headers.get('authorization'));
  if (!claims) return json({ error: 'unauthorized' }, 401);
  const { data: auth, error: authError } = await client.auth.getUser(claims.token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const adminId = auth.user.id;

  // 2. 啟用中的系統管理員（不是的人只會看到 forbidden，不透露後台有什麼）
  const { data: isAdmin, error: adminError } = await client.rpc('admin_is_admin', { p_user: adminId });
  if (adminError) {
    console.error('admin: admin_is_admin failed', adminError.code);
    return json({ error: 'server_error' }, 500);
  }
  if (isAdmin !== true) return json({ error: 'forbidden' }, 403);

  // 3. 這次登入通過了兩步驟驗證；沒有的話前端會引導綁定或輸入驗證碼
  if (claims.aal !== 'aal2') return json({ error: 'mfa_required' }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await run(client, adminId, parsed.value);
  if ('error' in result) return json({ error: result.error }, result.status);
  return json({ data: result.data ?? null });
});
