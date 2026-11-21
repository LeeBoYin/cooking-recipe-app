// `ai` Edge Function 的呼叫（16 第六節）。前端不直接呼叫 Claude，也不自己判斷額度；
// 失敗時只拿到錯誤代號，由各畫面依代號走退路（03〈AI 不能用時〉），不顯示次數。
import type { AiIdeasPayload, HomeIdeasResponse } from '@zhusha/core';
import { supabase } from './supabase.ts';

// 和 supabase/functions/ai/pipeline.ts 的 AiErrorCode 一致，加上手機端的 network
export type AiError =
  | 'unauthorized'
  | 'account_inactive'
  | 'ai_paused'
  | 'ai_disabled'
  | 'unknown_task'
  | 'task_not_available'
  | 'invalid_input'
  | 'rate_limited'
  | 'over_limit'
  | 'budget_exhausted'
  | 'refused'
  | 'truncated'
  | 'invalid_output'
  | 'upstream_error'
  | 'not_configured'
  | 'server_error'
  | 'network';

const KNOWN: ReadonlySet<string> = new Set<AiError>([
  'unauthorized', 'account_inactive', 'ai_paused', 'ai_disabled', 'unknown_task', 'task_not_available', 'invalid_input',
  'rate_limited', 'over_limit', 'budget_exhausted', 'refused', 'truncated', 'invalid_output', 'upstream_error', 'not_configured',
  'server_error',
]);

export function toAiError(body: unknown): AiError {
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof code === 'string' && KNOWN.has(code) ? (code as AiError) : 'server_error';
}

// 畫面該走哪條路：
// - slow_down：速率限制，大廚說「點子想太快，燈泡有點燙，等我一分鐘」，過一兩分鐘自動恢復
// - daily_limit：合理使用上限，「今天點子想了好多，我先從你的食譜裡挑」
// - use_rules：其他原因（預算、拒答、出錯、斷線…）一律退回不用 AI 的推薦
export type AiFallback = 'slow_down' | 'daily_limit' | 'use_rules';

export function aiFallbackOf(code: AiError): AiFallback {
  if (code === 'rate_limited') return 'slow_down';
  if (code === 'over_limit') return 'daily_limit';
  return 'use_rules';
}

export class AiCallError extends Error {
  constructor(readonly code: AiError) {
    super(code);
  }
  get fallback(): AiFallback {
    return aiFallbackOf(this.code);
  }
}

// 失敗時丟 AiCallError（TanStack Query 的 mutation／query 直接用）。輸出的格式由各任務自己的型別負責。
export async function callAi<T>(task: string, input: unknown): Promise<T> {
  try {
    const { data, error } = await supabase().functions.invoke('ai', { body: { task, input } });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) throw new AiCallError(toAiError(await context.json().catch(() => null)));
      throw new AiCallError('network');
    }
    return (data as { data: T }).data;
  } catch (e) {
    throw e instanceof AiCallError ? e : new AiCallError('network');
  }
}

// ---------------------------------------------------------------------------------------------
// 首頁的大廚點子（home_ideas，M1a-06）
// ---------------------------------------------------------------------------------------------
// 後端依輸入雜湊與 6 小時的規則決定要不要真的叫 Claude；shuffle 是「換一組」
export async function fetchHomeIdeas(shuffle = false): Promise<HomeIdeasResponse> {
  return await callAi<HomeIdeasResponse>('home_ideas', shuffle ? { shuffle: true } : {});
}

// 上次的點子：打開首頁時先顯示它，接著才問後端。只有本人讀得到（RLS）；飲食限制一改，後端的觸發器會清掉它
export async function getLastHomeIdeas(): Promise<Extract<HomeIdeasResponse, { status: 'ok' }> | null> {
  const { data, error } = await supabase()
    .from('ai_suggestion_cache')
    .select('payload, created_at, round')
    .eq('kind', 'home')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.payload as unknown as AiIdeasPayload | undefined;
  if (!data || !payload || payload.schemaVersion !== 1 || !Array.isArray(payload.ideas) || payload.ideas.length === 0) return null;
  return { status: 'ok', source: 'cache', ideas: payload.ideas, chefComment: payload.chefComment, createdAt: data.created_at, round: data.round };
}
