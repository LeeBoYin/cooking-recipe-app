// ai 函式的主流程（純邏輯：Claude、資料庫、任務都由外面傳進來，方便用假的回應測試）。
// 依序：帳號啟用中 → AI 總開關 → 任務在白名單 → 輸入格式與長度 → 【用量保護的掛載點】→ 組 prompt
//      → 呼叫 Claude → 檢查 stop_reason → 用 JSON Schema 驗證輸出 → 回傳輸出與 token 用量。
// 紀錄與錯誤都不含使用者輸入與 AI 的回應。
import { AI_TASKS, isTaskName, type TaskConfig, type TaskName } from '../_shared/ai-models.ts';
import { type JsonSchema, validate } from '../_shared/json-schema.ts';

// 前端依這些代號決定走哪條退路（見 03〈AI 不能用時〉）
export type AiErrorCode =
  | 'unauthorized' //        401 沒登入或 token 無效
  | 'account_inactive' //    403 帳號停用
  | 'ai_paused' //           403 管理員暫停了這個人的 AI
  | 'ai_disabled' //         503 AI 總開關關閉
  | 'unknown_task' //        400 不在白名單
  | 'task_not_available' //  400 在白名單但還沒實作，或正式環境的內部任務
  | 'invalid_input' //       400 格式或長度不符
  | 'rate_limited' //        429 速率限制（M1a-04）
  | 'over_limit' //          429 合理使用上限（M1a-04）
  | 'budget_exhausted' //    503 每月預算用完（M1a-04）
  | 'refused' //             502 Claude 拒答（stop_reason: refusal）
  | 'truncated' //           502 輸出被截斷（max_tokens）
  | 'invalid_output' //      502 輸出不是合法 JSON 或不符合 schema
  | 'upstream_error' //      502 Claude 服務出錯或逾時
  | 'not_configured' //      500 沒有設定金鑰
  | 'server_error'; //       500

export const ERROR_STATUS: Record<AiErrorCode, number> = {
  unauthorized: 401,
  account_inactive: 403,
  ai_paused: 403,
  ai_disabled: 503,
  unknown_task: 400,
  task_not_available: 400,
  invalid_input: 400,
  rate_limited: 429,
  over_limit: 429,
  budget_exhausted: 503,
  refused: 502,
  truncated: 502,
  invalid_output: 502,
  upstream_error: 502,
  not_configured: 500,
  server_error: 500,
};

export interface AiContext {
  status: 'active' | 'suspended';
  ai_paused: boolean;
  plan: 'free' | 'plus';
  ai_enabled: boolean;
}

// 組好的 prompt：stable 放角色、規則與輸出格式（每次相同，會被快取）；
// volatile 放這次才有的內容（口味摘要、廚具…，同一段對話內不變的接在後面）；messages 是對話。
export interface PromptParts {
  stable: string;
  volatile?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface TaskDefinition<I = unknown> {
  parseInput(raw: unknown): { ok: true; value: I } | { ok: false };
  buildPrompt(input: I, ctx: AiContext): PromptParts;
  outputSchema: JsonSchema;
}

export interface ClaudeRequest {
  model: string;
  maxTokens: number;
  effort: TaskConfig['effort'];
  thinking: TaskConfig['thinking'];
  system: { text: string; cache: boolean }[];
  messages: PromptParts['messages'];
  outputSchema: JsonSchema;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ClaudeResponse {
  stopReason: string | null;
  text: string; // 第一個文字區塊；沒有就是空字串
  usage: Usage;
  model: string;
}

export class UpstreamError extends Error {}

export interface Deps {
  getContext(userId: string): Promise<AiContext | null>;
  claude(req: ClaudeRequest): Promise<ClaudeResponse>;
  tasks: Partial<Record<TaskName, TaskDefinition<never>>>;
  allowInternalTasks: boolean;
  // 【M1a-04 的掛載點】速率限制、合理使用上限、每月預算降級／停用都在這裡檢查：
  // 回傳錯誤代號就擋下（rate_limited／over_limit／budget_exhausted），回傳 null 放行。
  // 也可以改寫這次用的設定（例如預算快用完時把首頁點子降成 Haiku）。
  guard?(call: { userId: string; task: TaskName; ctx: AiContext; config: TaskConfig }): Promise<AiErrorCode | { config: TaskConfig } | null>;
  // 【M1a-04】每次呼叫 Claude 之後（成功或失敗）把 token 用量交出去寫紀錄
  onUsage?(record: { userId: string; task: TaskName; model: string; usage: Usage; ok: boolean }): Promise<void>;
}

export type AiResult =
  | { ok: true; output: unknown; usage: Usage; model: string }
  | { ok: false; error: AiErrorCode };

const fail = (error: AiErrorCode): AiResult => ({ ok: false, error });

export async function runAi(deps: Deps, userId: string, rawTask: unknown, rawInput: unknown): Promise<AiResult> {
  // 1. 帳號
  const ctx = await deps.getContext(userId);
  if (!ctx || ctx.status !== 'active') return fail('account_inactive');
  if (ctx.ai_paused) return fail('ai_paused');
  if (!ctx.ai_enabled) return fail('ai_disabled');

  // 2. 任務白名單
  if (!isTaskName(rawTask)) return fail('unknown_task');
  const task: TaskName = rawTask;
  let config: TaskConfig = AI_TASKS[task];
  if (config.internal && !deps.allowInternalTasks) return fail('task_not_available');
  const def = deps.tasks[task] as TaskDefinition | undefined;
  if (!def) return fail('task_not_available');

  // 3. 輸入格式與長度
  const parsed = def.parseInput(rawInput);
  if (!parsed.ok) return fail('invalid_input');

  // 4. 用量保護（M1a-04）
  if (deps.guard) {
    const verdict = await deps.guard({ userId, task, ctx, config });
    if (typeof verdict === 'string') return fail(verdict);
    if (verdict) config = verdict.config;
  }

  // 5. 組 prompt、呼叫 Claude
  const prompt = def.buildPrompt(parsed.value, ctx);
  const system = [{ text: prompt.stable, cache: true }, ...(prompt.volatile ? [{ text: prompt.volatile, cache: false }] : [])];
  let response: ClaudeResponse;
  try {
    response = await deps.claude({
      model: config.model,
      maxTokens: config.maxOutputTokens,
      effort: config.effort,
      thinking: config.thinking,
      system,
      messages: prompt.messages,
      outputSchema: def.outputSchema,
    });
  } catch (e) {
    if (e instanceof UpstreamError) return fail('upstream_error');
    throw e;
  }
  await deps.onUsage?.({ userId, task, model: response.model, usage: response.usage, ok: response.stopReason === 'end_turn' });

  // 6. stop_reason：拒答與截斷都不用半截的輸出
  if (response.stopReason === 'refusal') return fail('refused');
  if (response.stopReason === 'max_tokens') return fail('truncated');
  if (response.stopReason !== 'end_turn' && response.stopReason !== 'stop_sequence') return fail('invalid_output');

  // 7. 輸出要是合法 JSON，而且符合 schema
  let output: unknown;
  try {
    output = JSON.parse(response.text);
  } catch {
    return fail('invalid_output');
  }
  if (validate(def.outputSchema, output).length > 0) return fail('invalid_output');

  return { ok: true, output, usage: response.usage, model: response.model };
}
