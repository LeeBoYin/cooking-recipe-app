// 對話評估用的「模擬後端」：和 handler.ts 同一套流程（組環境、提示詞、檢查），但資料存在記憶體、AI 的回應由外面給。
// 自動測試給假的 AI 回應（進 CI），run.ts 給真的 Claude（不進 CI）。存對話的規則和 ai_chat_append 一致。
import { CHAT_MAX_TURNS, type ChatMessage } from '../../../../../packages/core/src/index.ts';
import type { PromptParts } from '../../pipeline.ts';
import { checkChatOutput, retryHint, type ChatCheck } from '../check.ts';
import { buildChatEnv, type ChatEnv } from '../env.ts';
import { buildChatPrompt } from '../prompt.ts';
import type { ChatConversationRow, RawChatOutput } from '../types.ts';
import type { HomeContextRow } from '../../home/types.ts';

// attempt：0 是第一次，1 是程式請大廚重寫的那一次
export type Responder = (prompt: PromptParts, turnIndex: number, ce: ChatEnv, attempt: number) => Promise<RawChatOutput | null> | RawChatOutput | null;

// 劇本裡的一句使用者的話
export type ScriptedUser = string;
export const userText = (u: ScriptedUser): string => u;

export interface TurnResult {
  user: string;
  chefTurn: number; // 大廚在這段對話的第幾輪回應
  attempts: number; // 呼叫了幾次 AI（2 = 程式請大廚重寫過）
  prompt: PromptParts;
  raw: RawChatOutput | null; // 沒有 = AI 呼叫失敗或輸出不合 schema
  checked: ChatCheck | null;
  full: boolean; // 這一段已經滿了，沒有送出
}

export interface Simulation {
  conv: ChatConversationRow | null;
  turns: TurnResult[];
}

export function emptyConversation(over: Partial<ChatConversationRow> = {}): ChatConversationRow {
  return { id: '0192f000-0000-7000-8000-0000000000c1', kitchen_id: null, summary: null, turn_count: 0, messages: [], mentioned_ingredients: [], last_message_at: '2026-11-21T09:00:00Z', suggestions: [], ...over };
}

export async function simulate(ctx: HomeContextRow, now: Date, users: ScriptedUser[], respond: Responder, start: ChatConversationRow | null = null): Promise<Simulation> {
  let conv = start;
  const turns: TurnResult[] = [];
  let n = 0;
  for (const scripted of users) {
    const user = userText(scripted);
    const chefTurn = (conv?.messages ?? []).filter((m) => m.role === 'chef').length + 1;
    if (conv && conv.turn_count >= CHAT_MAX_TURNS) {
      turns.push({ user, chefTurn, attempts: 0, prompt: { stable: '', messages: [] }, raw: null, checked: null, full: true });
      continue;
    }
    const ce = buildChatEnv(ctx, now, conv, user);
    let hint: string | undefined;
    let prompt: PromptParts = { stable: '', messages: [] };
    let raw: RawChatOutput | null = null;
    let checked: ChatCheck | null = null;
    let fallback: { raw: RawChatOutput; checked: ChatCheck } | null = null;
    let attempts = 0;
    // 和 handler.ts 同一套：太早給點子、或點子用到的提到食材太少時重寫一次
    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++;
      prompt = buildChatPrompt(ce, conv, null, user, { chefTurn, carried: false, gaveBefore: (conv?.suggestions.length ?? 0) > 0, ...(hint ? { retryHint: hint } : {}) });
      raw = await respond(prompt, n, ce, attempt);
      checked = raw ? checkChatOutput(raw, ce, { makeId: () => `idea-${n}`, chefTurn, gaveBefore: (conv?.suggestions.length ?? 0) > 0 }) : null;
      hint = attempt === 0 && checked ? retryHint(checked, chefTurn) : undefined;
      if (!hint) break;
      if (checked?.ok && raw) fallback = { raw, checked };
    }
    if (fallback && (!checked || !checked.ok)) ({ raw, checked } = fallback);
    n++;
    turns.push({ user, chefTurn, attempts, prompt, raw, checked, full: false });
    if (!checked || !checked.ok) continue; // 沒過檢查：什麼都不存，下一則還是從同一個狀態開始
    const at = now.toISOString();
    const suggestionId = checked.ideas.length ? `s-${n}` : undefined;
    const cur: ChatConversationRow = conv ?? emptyConversation();
    const chef: ChatMessage = { id: `m-${n}b`, role: 'chef', text: checked.reply, ...(checked.ask ? { ask: checked.ask } : {}), ...(suggestionId ? { suggestionId } : {}), at };
    const seen = new Set(cur.mentioned_ingredients.map((m) => m.text));
    conv = {
      ...cur,
      turn_count: cur.turn_count + 1,
      summary: checked.summary ?? cur.summary,
      messages: [...cur.messages, { id: `m-${n}a`, role: 'user', text: user, at }, chef],
      mentioned_ingredients: [...cur.mentioned_ingredients, ...checked.mentioned.filter((m) => !seen.has(m.text))],
      suggestions: suggestionId ? [...cur.suggestions, { id: suggestionId, payload: { ideas: checked.ideas.map((i) => ({ title: i.title })) } }] : cur.suggestions,
    };
  }
  return { conv, turns };
}
