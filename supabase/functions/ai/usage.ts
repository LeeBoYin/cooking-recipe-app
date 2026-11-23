// 用量保護（M1a-04）：接在 pipeline 的 guard 與 onUsage 掛載點。
// 所有判斷與計數都在資料庫函式裡（原子、同一個交易）；這裡只負責呼叫、套用降級、算費用。
// 資料庫函式用傳入的 rpc 呼叫，單元測試用假的。紀錄只有任務與代號，不含使用者輸入。
import { costUsd, degradeConfig } from '../_shared/ai-models.ts';
import type { Deps } from './pipeline.ts';

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;

type GuardVerdict = 'ok' | 'budget_exhausted' | 'over_limit' | 'rate_limited';

// 檢查本身壞掉時「不放行」：丟出錯誤，ai 函式回 server_error，前端走不用 AI 的退路。
// 寧可暫時不能用，也不讓保護失靈。
export function createProtection(rpc: Rpc, sessionId: string | null): Pick<Deps, 'guard' | 'onUsage'> {
  return {
    async guard({ userId, task, config }) {
      const { data, error } = await rpc('ai_guard_check', { p_user: userId, p_background: config.background === true });
      if (error || typeof data !== 'object' || data === null) {
        console.error('ai: guard failed', error?.code ?? 'bad_response');
        throw new Error('guard');
      }
      const { verdict, degraded } = data as { verdict: GuardVerdict; degraded: boolean };
      if (verdict === 'budget_exhausted') return 'budget_exhausted';
      if (verdict === 'over_limit') return 'over_limit';
      if (verdict === 'rate_limited') return 'rate_limited';
      if (verdict !== 'ok') throw new Error('guard');
      if (!degraded) return null;
      // 預算用到提醒門檻：依模型設定檔的降級規則覆寫（首頁點子改 Haiku、靈感彩蛋改模板）
      const next = degradeConfig(task, config);
      return next === 'use_rules' ? 'budget_exhausted' : { config: next };
    },
    async onUsage(r) {
      try {
        const { error } = await rpc('ai_record_usage', {
          p_user: r.userId,
          p_task: r.task,
          p_model: r.model,
          p_input_tokens: r.usage.inputTokens,
          p_output_tokens: r.usage.outputTokens,
          p_cache_read_tokens: r.usage.cacheReadTokens,
          p_cache_write_tokens: r.usage.cacheWriteTokens,
          p_cost_usd: costUsd(r.model, r.usage),
          p_ok: r.ok,
          p_latency_ms: r.latencyMs,
          p_input_hash: r.inputHash,
          p_input_ratio: r.inputRatio,
          p_session_id: sessionId,
        });
        if (error) console.error('ai: record usage failed', error.code);
      } catch {
        // 回應已經產生了，紀錄寫失敗不影響使用者；只留錯誤代號
        console.error('ai: record usage failed', 'exception');
      }
    },
  };
}

// 輸出檢查的結果（M1a-10b）：passed 第一次就過、rewritten 重寫後過、blocked 沒過（invalid_output）。
// 只有代號；寫不進去不影響使用者拿到的回應，只留錯誤代號。
export type OutputOutcome = 'passed' | 'rewritten' | 'blocked';
export async function recordOutcome(rpc: Rpc, userId: string, task: 'chat' | 'home_ideas' | 'expand_steps' | 'dictation', outcome: OutputOutcome): Promise<void> {
  try {
    const { error } = await rpc('ai_record_outcome', { p_user: userId, p_task: task, p_outcome: outcome });
    if (error) console.error('ai: record outcome failed', error.code);
  } catch {
    console.error('ai: record outcome failed', 'exception');
  }
}

// JWT 的 session_id（登入工作階段，代表一個裝置）；token 已經由 Auth 的 getUser 驗證過，這裡只解碼
export function sessionIdOf(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const id = (JSON.parse(new TextDecoder().decode(bytes)) as { session_id?: unknown }).session_id;
    return typeof id === 'string' && id.length <= 64 ? id : null;
  } catch {
    return null;
  }
}
