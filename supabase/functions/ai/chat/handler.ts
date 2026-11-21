// chat（M1a-07）：和大廚聊聊。每送出一則訊息做一次 AI 呼叫：
// 讀資料 → 這段對話（沒有就開新的一段）→ 組候選與提示詞 → 呼叫 Claude（串流，收完整段）→ 驗證格式 → 程式再檢查 →
// 在同一個動作附加「使用者的話＋大廚的回應」→ 回給手機。AI 不能用、被擋下、輸出沒過檢查時回錯誤代號，手機由大廚說一句；
// 這時什麼都不存（使用者的話留在畫面上，可以再送一次）。紀錄只有數量與原因代號，不含內容。
import { CHAT_MAX_TURNS, CHAT_MAX_USER_CHARS, type AiIdea, type ChatInput, type ChatMessage, type ChatResponse } from '../../../../packages/core/src/index.ts';
import { type AiErrorCode, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import type { Rpc } from '../usage.ts';
import type { HomeContextRow } from '../home/types.ts';
import { checkChatOutput } from './check.ts';
import { buildChatEnv } from './env.ts';
import { buildChatPrompt, buildChatSchema } from './prompt.ts';
import type { ChatConversationRow, RawChatOutput } from './types.ts';

export type ChatResult = { ok: true; data: ChatResponse } | { ok: false; error: AiErrorCode };

export interface ChatDeps {
  ai: Deps;
  rpc: Rpc;
  now?: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseChatInput(raw: unknown): { ok: true; value: ChatInput } | { ok: false } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false };
  const { message, conversationId, continueFrom, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false };
  if (typeof message !== 'string') return { ok: false };
  const text = message.trim();
  if (text.length === 0 || [...text].length > CHAT_MAX_USER_CHARS) return { ok: false };
  if (conversationId !== undefined && (typeof conversationId !== 'string' || !UUID.test(conversationId))) return { ok: false };
  if (continueFrom !== undefined && (typeof continueFrom !== 'string' || !UUID.test(continueFrom))) return { ok: false };
  if (conversationId !== undefined && continueFrom !== undefined) return { ok: false };
  return {
    ok: true,
    value: { message: text, ...(conversationId ? { conversationId } : {}), ...(continueFrom ? { continueFrom } : {}) },
  };
}

export async function runChat(deps: ChatDeps, userId: string, rawInput: unknown): Promise<ChatResult> {
  const parsed = parseChatInput(rawInput);
  if (!parsed.ok) return { ok: false, error: 'invalid_input' };
  const input = parsed.value;
  const now = (deps.now ?? (() => new Date()))();

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  // 這段對話（接著聊），或上一段的條件摘要（開新的一段）
  let conv: ChatConversationRow | null = null;
  let carrySummary: string | null = null;
  if (input.conversationId) {
    const got = await deps.rpc('ai_chat_get', { p_user: userId, p_conversation: input.conversationId });
    if (got.error) {
      console.error('ai: ai_chat_get failed', got.error.code);
      throw new Error('chat_get');
    }
    if (!got.data) return { ok: false, error: 'invalid_input' };
    conv = got.data as ChatConversationRow;
    if (conv.turn_count >= CHAT_MAX_TURNS) return { ok: true, data: { status: 'full' } };
  } else if (input.continueFrom) {
    const prev = await deps.rpc('ai_chat_get', { p_user: userId, p_conversation: input.continueFrom });
    if (prev.error) {
      console.error('ai: ai_chat_get failed', prev.error.code);
      throw new Error('chat_get');
    }
    carrySummary = (prev.data as ChatConversationRow | null)?.summary ?? null;
  }

  const ctxRes = await deps.rpc('ai_home_context', { p_user: userId });
  if (ctxRes.error) {
    console.error('ai: ai_home_context failed', ctxRes.error.code);
    throw new Error('home_context');
  }
  if (!ctxRes.data) return { ok: false, error: 'invalid_input' }; // 沒有廚房：沒有東西可以聊
  const ce = buildChatEnv(ctxRes.data as HomeContextRow, now, conv, input.message);

  const prompt = buildChatPrompt(ce, conv, carrySummary, input.message);
  const def: TaskDefinition<Record<string, never>> = {
    parseInput: () => ({ ok: true, value: {} }),
    buildPrompt: () => prompt,
    outputSchema: buildChatSchema(),
    stream: true,
    inputSize: () => ({ length: [...input.message].length, limit: CHAT_MAX_USER_CHARS }),
  };
  const result = await runAi({ ...deps.ai, tasks: { chat: def as never } }, userId, 'chat', { message: input.message });
  if (!result.ok) return result;

  const checked = checkChatOutput(result.output as RawChatOutput, ce);
  console.log('ai: chat checked', JSON.stringify({ ok: checked.ok, ideas: checked.ok ? checked.ideas.length : 0, dropped: checked.dropped }));
  if (!checked.ok) return { ok: false, error: 'invalid_output' };

  const saved = await deps.rpc('ai_chat_append', {
    p_user: userId,
    p_kitchen: ce.env.ctx.kitchen.id,
    p_conversation: conv?.id ?? null,
    p_carry_summary: carrySummary,
    p_lang: ce.env.ctx.settings.locale,
    p_user_text: input.message,
    p_chef_text: checked.reply,
    p_ask: checked.ask,
    p_ideas: checked.ideas,
    p_model: result.model,
    p_summary: checked.summary,
    p_mentioned: checked.mentioned,
    p_signals: checked.signals,
  });
  if (saved.error) {
    // 同時送了兩則、第二則的時候已經滿 20 輪
    if (saved.error.code === '23514') return { ok: true, data: { status: 'full' } };
    if (saved.error.code === 'P0002') return { ok: false, error: 'invalid_input' };
    console.error('ai: ai_chat_append failed', saved.error.code);
    throw new Error('chat_append');
  }
  const out = saved.data as { conversation_id: string; turn_count: number; user_message: ChatMessage; chef_message: ChatMessage };
  const ideas: AiIdea[] = checked.ideas;
  return {
    ok: true,
    data: { status: 'ok', conversationId: out.conversation_id, turnCount: out.turn_count, userMessage: out.user_message, chefMessage: out.chef_message, ideas },
  };
}
