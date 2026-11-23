// `ai` Edge Function 的呼叫（16 第六節）。前端不直接呼叫 Claude，也不自己判斷額度；
// 失敗時只拿到錯誤代號，由各畫面依代號顯示「目前無法使用」的說法（03〈AI 不能用時〉），不顯示次數，也不改用別的挑法。
import type { DictationInput, DictationResponse, RefineInput, RefineResponse, AiIdea, AiIdeasPayload, ChatInput, ChatMention, ChatMessage, ChatResponse, ExpandInput, ExpandResponse, HomeIdeasResponse, ImportInput, ImportResponse } from '@zhusha/core';
import { supabase } from './supabase.ts';
import { trackAiError } from './trackError.ts';

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
  | 'import_url_invalid'
  | 'import_fetch_failed'
  | 'import_no_recipe'
  | 'not_configured'
  | 'server_error'
  | 'network';

const KNOWN: ReadonlySet<string> = new Set<AiError>([
  'unauthorized', 'account_inactive', 'ai_paused', 'ai_disabled', 'unknown_task', 'task_not_available', 'invalid_input',
  'rate_limited', 'over_limit', 'budget_exhausted', 'refused', 'truncated', 'invalid_output', 'upstream_error', 'not_configured',
  'import_url_invalid', 'import_fetch_failed', 'import_no_recipe', 'server_error',
]);

export function toAiError(body: unknown): AiError {
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof code === 'string' && KNOWN.has(code) ? (code as AiError) : 'server_error';
}

export class AiCallError extends Error {
  constructor(readonly code: AiError) {
    super(code);
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
    const err = e instanceof AiCallError ? e : new AiCallError('network');
    trackAiError(err.code);
    throw err;
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
    .select('id, payload, created_at, round')
    .eq('kind', 'home')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.payload as unknown as AiIdeasPayload | undefined;
  if (!data || !payload || payload.schemaVersion !== 1 || !Array.isArray(payload.ideas) || payload.ideas.length === 0) return null;
  return { status: 'ok', source: 'cache', ideas: payload.ideas, chefComment: payload.chefComment, createdAt: data.created_at, round: data.round, suggestionId: data.id };
}

// ---------------------------------------------------------------------------------------------
// 和大廚聊聊（chat，M1a-07）
// ---------------------------------------------------------------------------------------------
// 送出一則話：後端用串流呼叫 Claude、整段收完才回；失敗時丟 AiCallError，這一則什麼都不會存
export async function sendChat(input: ChatInput): Promise<ChatResponse> {
  return await callAi<ChatResponse>('chat', input);
}

export interface ChatConversation {
  id: string;
  kitchenId: string | null;
  turnCount: number;
  messages: ChatMessage[];
  mentioned: ChatMention[]; // 使用者在這段對話提過的食材（點子卡片列「你提到的食材」）
  lastMessageAt: string;
  // 大廚每一則回應附的點子：key 是 ChatMessage.suggestionId
  suggestions: Map<string, AiIdea[]>;
}

const asMessages = (v: unknown): ChatMessage[] => (Array.isArray(v) ? (v as ChatMessage[]) : []);

async function withSuggestions(row: { id: string; kitchen_id: string | null; turn_count: number; messages: unknown; mentioned_ingredients: unknown; last_message_at: string }): Promise<ChatConversation> {
  const { data, error } = await supabase().from('ai_suggestion_cache').select('id, payload').eq('conversation_id', row.id);
  if (error) throw error;
  const suggestions = new Map<string, AiIdea[]>();
  for (const s of data) {
    const p = s.payload as unknown as AiIdeasPayload;
    if (p?.schemaVersion === 1 && Array.isArray(p.ideas)) suggestions.set(s.id, p.ideas);
  }
  return { id: row.id, kitchenId: row.kitchen_id, turnCount: row.turn_count, messages: asMessages(row.messages), mentioned: Array.isArray(row.mentioned_ingredients) ? (row.mentioned_ingredients as ChatMention[]) : [], lastMessageAt: row.last_message_at, suggestions };
}

const CONVERSATION_COLUMNS = 'id, kitchen_id, turn_count, messages, mentioned_ingredients, last_message_at';

// 一段對話（只有本人讀得到，RLS）
export async function getChatConversation(id: string): Promise<ChatConversation | null> {
  const { data, error } = await supabase().from('chef_conversations').select(CONVERSATION_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? await withSuggestions(data) : null;
}

// 最近的一段：同一時間只有一段進行中的對話（開了新的一段，舊的就不是最近的）
export async function getLatestChatConversation(): Promise<ChatConversation | null> {
  const { data, error } = await supabase().from('chef_conversations').select(CONVERSATION_COLUMNS).order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? await withSuggestions(data) : null;
}

// 首頁的「接著聊」：6 小時內、同一個廚房才出現（03〈對話的一段〉）
export const CHAT_RESUME_HOURS = 6;
export function isResumable(conv: ChatConversation | null | undefined, kitchenId: string | undefined, now: number = Date.now()): conv is ChatConversation {
  return !!conv && !!kitchenId && conv.kitchenId === kitchenId && now - Date.parse(conv.lastMessageAt) < CHAT_RESUME_HOURS * 3_600_000;
}

// ---------------------------------------------------------------------------------------------
// 點子抽屜的做法（expand_steps，M1a-09）
// ---------------------------------------------------------------------------------------------
// 第一次打開才叫 Claude（十幾秒），寫好的做法後端存起來，之後直接回；失敗時丟 AiCallError，什麼都沒存
export async function expandSteps(input: ExpandInput): Promise<ExpandResponse> {
  return await callAi<ExpandResponse>('expand_steps', input);
}

// ---------------------------------------------------------------------------------------------
// 從網址匯入（import_url，M1b-05）：後端抓網頁或讀貼上的文字，回傳預填編輯頁的食譜。
// import_* 三個代號是匯入自己的失敗（網址不行、抓不到、找不到食譜），畫面請使用者貼上食譜文字；其他代號是 AI 不能用。
// ---------------------------------------------------------------------------------------------
export async function importRecipe(input: ImportInput): Promise<ImportResponse> {
  return await callAi<ImportResponse>('import_url', input);
}

// ---------------------------------------------------------------------------------------------
// 用說的（dictation，M1b-03）：把口述整理進編輯頁的欄位，保留作者已經填的內容、只補新的。
// 後端什麼都不存；失敗時丟 AiCallError，編輯頁把原話放進心得（之後可以按「讓大廚整理」再跑一次）。
// ---------------------------------------------------------------------------------------------
export async function dictateRecipe(input: DictationInput): Promise<DictationResponse> {
  return await callAi<DictationResponse>('dictation', input);
}

// ---------------------------------------------------------------------------------------------
// 用說的改食譜（edit_by_voice，M1b-04a）：說一句要改的地方，後端只回要改的欄位與新值（驗證過的變更清單）。
// 後端什麼都不存；作者確認後才套進編輯頁還沒儲存的狀態。失敗時丟 AiCallError，畫面顯示目前無法使用、改用手動編輯。
// ---------------------------------------------------------------------------------------------
export async function refineRecipe(input: RefineInput): Promise<RefineResponse> {
  return await callAi<RefineResponse>('edit_by_voice', input);
}
