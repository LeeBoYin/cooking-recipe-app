// 背景任務：食材正規化（M1a-05）。一次領一批對不到字典的詞 → 程式從字典挑候選 → 一次問 AI → 結果寫進全站對應。
// 純邏輯：資料庫呼叫、字典、AI 都由外面傳進來，方便用假的回應測試。
// 紀錄只有數量與錯誤代號，不含使用者輸入的食材原文。
import { type Candidate, type DictRow, pickCandidates } from '../_shared/ingredient-candidates.ts';
import type { AiErrorCode, AiResult } from '../ai/pipeline.ts';

export const BATCH_SIZE = 20;
const MAX_BILLING_TRIES = 3;

export interface ClaimedJob {
  id: string;
  key: string; // 標準寫法（全站對應的鍵）
  text: string | null; // 使用者輸入的原樣（最長 60 字），只用來問 AI，不寫進紀錄
  requested_by: string | null;
  attempts: number;
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;

export interface RunnerDeps {
  rpc: Rpc;
  loadDict(): Promise<DictRow[]>;
  // 以某位使用者的名義呼叫 normalize_ingredients（用量與預算照 M1a-04 計入）
  ask(userId: string, input: { terms: { text: string; candidates: Candidate[] }[] }): Promise<AiResult>;
}

export interface RunSummary {
  claimed: number;
  mapped: number; // 對到字典的
  none: number; // 沒有合適的（含沒有候選）
  failed: number;
  released: number;
  paused: 'budget' | 'ai_disabled' | null;
}

// 這些代號是「這個人／這個時間點不行」，不是任務的錯：換人或晚點再試，不算一次嘗試
export const USER_BLOCKED: AiErrorCode[] = ['over_limit', 'ai_paused', 'account_inactive', 'rate_limited'];
export const PAUSE_ALL: AiErrorCode[] = ['budget_exhausted', 'ai_disabled'];
export const NO_RETRY: AiErrorCode[] = ['invalid_input', 'unknown_task', 'task_not_available'];

export async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) {
    console.error('background-jobs: rpc failed', fn, error.code ?? 'unknown');
    throw new Error('rpc');
  }
  return data as T;
}

export async function runNormalization(deps: RunnerDeps): Promise<RunSummary> {
  const summary: RunSummary = { claimed: 0, mapped: 0, none: 0, failed: 0, released: 0, paused: null };

  // 全站預算用完：暫停，任務留在佇列
  if ((await call<string>(deps.rpc, 'ai_budget_state', {})) === 'exhausted') {
    summary.paused = 'budget';
    return summary;
  }

  const jobs = await call<ClaimedJob[]>(deps.rpc, 'claim_background_jobs', { p_kind: 'normalize_ingredients', p_limit: BATCH_SIZE });
  summary.claimed = jobs.length;
  if (jobs.length === 0) return summary;

  const dict = await deps.loadDict();
  const results: { id: string; ingredient_id: string | null; model: string | null }[] = [];
  const toAsk: { job: ClaimedJob; candidates: Candidate[] }[] = [];
  for (const job of jobs) {
    const candidates = pickCandidates(job.text ?? job.key, dict);
    if (candidates.length === 0) results.push({ id: job.id, ingredient_id: null, model: null }); // 沒有候選：不用問 AI
    else toAsk.push({ job, candidates });
  }

  const release = async (ids: string[], delaySeconds: number) => {
    if (ids.length === 0) return;
    await call(deps.rpc, 'release_background_jobs', { p_ids: ids, p_delay_seconds: delaySeconds });
    summary.released += ids.length;
  };
  const fail = async (ids: string[], code: string, retry: boolean) => {
    for (const id of ids) await call(deps.rpc, 'fail_background_job', { p_id: id, p_code: code, p_retry: retry });
    summary.failed += ids.length;
  };

  if (toAsk.length > 0) {
    const ids = toAsk.map((x) => x.job.id);
    const input = { terms: toAsk.map((x) => ({ text: x.job.text ?? x.job.key, candidates: x.candidates })) };
    const users = [...new Set(toAsk.map((x) => x.job.requested_by).filter((u): u is string => u !== null))].slice(0, MAX_BILLING_TRIES);

    let answered: AiResult | null = null;
    let blocked = false;
    for (const user of users) {
      const r = await deps.ask(user, input);
      if (r.ok) {
        answered = r;
        break;
      }
      if (PAUSE_ALL.includes(r.error)) {
        summary.paused = r.error === 'budget_exhausted' ? 'budget' : 'ai_disabled';
        await release(ids, 600);
        break;
      }
      if (USER_BLOCKED.includes(r.error)) {
        blocked = true;
        continue;
      }
      await fail(ids, r.error, !NO_RETRY.includes(r.error));
      answered = null;
      users.length = 0; // 已處理，結束迴圈
      break;
    }

    if (answered?.ok) {
      const choices = (answered.output as { choices?: unknown }).choices;
      const model = answered.model;
      const okLength = Array.isArray(choices) && choices.length === toAsk.length;
      const bad: string[] = [];
      toAsk.forEach((x, i) => {
        const c = okLength ? (choices as unknown[])[i] : undefined;
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > x.candidates.length) bad.push(x.job.id);
        else results.push({ id: x.job.id, ingredient_id: c === 0 ? null : x.candidates[c - 1].id, model });
      });
      await fail(bad, 'invalid_choice', true);
    } else if (summary.paused === null && summary.failed === 0) {
      // 沒有人能代付（都超過上限或被暫停，或任務沒有請求者）：放回去晚點再試；沒有請求者的直接放棄
      if (users.length === 0 && !blocked) await fail(ids, 'no_requester', false);
      else await release(ids, 300);
    }
  }

  if (results.length > 0) {
    await call(deps.rpc, 'complete_normalization_jobs', { p_results: results });
    for (const r of results) r.ingredient_id ? summary.mapped++ : summary.none++;
  }
  return summary;
}
