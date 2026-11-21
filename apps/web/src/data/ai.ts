// `ai` Edge Function 的呼叫（16 第六節）。前端不直接呼叫 Claude，也不自己判斷額度；
// 失敗時只拿到錯誤代號，由各畫面依代號走退路（03〈AI 不能用時〉），不顯示次數。
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
