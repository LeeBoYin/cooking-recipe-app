// 大廚的 AI 點子（M1a-06）：後端存進快取、回給手機的格式。後端（ai 函式）與手機共用同一份型別。
// 卡片不含做法；做法與回饋之後用點子的 id 對應（05 AiSuggestionCache）。
import type { Temperature, UnitCode } from '../units/units.ts';

export type IdeaSlot = 'familiar' | 'twist' | 'adventure';

export interface AiIdea {
  id: string; // UUID v7，由後端程式產生
  slot: IdeaSlot;
  title: string;
  why: string; // 可能含 {{temp:180:C}} 標記，手機依偏好轉成攝氏或華氏
  candidateRef: string | null; // 對應的候選：own:<食譜 id> 或 dish:<家常菜 id>
  usesPantryIds: string[];
  usesMentionedIds?: string[]; // 對話中說的、廚房沒記的食材（只有對話的點子有；抽屜標「你說的」）
  usesPriorityIds: string[];
  otherIngredients: { name: string; ingredientId: string | null }[];
  difficulty: { ingredients: number; equipment: number; time: number; technique: number; failure_risk: number; overall: number };
  techniques: string[];
  equipment: string[];
  substitutions: { need: string; use: string }[];
}

export interface AiIdeasPayload {
  schemaVersion: 1;
  ideas: AiIdea[];
  chefComment: string | null; // 檢查沒過就是 null，手機改用情境句子
  model: string;
}

// `ai` 函式的 home_ideas 回傳
export type HomeIdeasResponse =
  | { status: 'ok'; source: 'ai' | 'cache'; ideas: AiIdea[]; chefComment: string | null; createdAt: string; round: number; suggestionId: string | null } // suggestionId：這一組點子在快取裡的 id，收藏用
  | { status: 'not_enough' } // 新手門檻：口味不夠把握、又沒有自己的食譜
  | { status: 'unavailable'; reason: 'no_kitchen' | 'shuffle_limit' }; // 這一輪不給新點子：沒有廚房、或「換一組」換太多次（手機維持上一組並說想不出新的）

// ---------------------------------------------------------------------------------------------
// 展開做法（M1a-09）：`ai` 函式 expand_steps 任務的輸入與回傳。存進 ai_suggestion_cache.drafts 與 bookmarks.idea.recipeDraft 的格式
// ---------------------------------------------------------------------------------------------
// 份量與溫度只放結構化欄位（公制與攝氏），手機依偏好換算；食材一列一個，rawText 由手機依單位偏好組
export interface DraftIngredient {
  id: string; // UUID v7，後端產生
  name: string; // 食材名稱（不含數量）
  ingredientId: string | null; // 比對到字典的標準食材 ID
  amount?: number;
  amountMax?: number;
  unit?: UnitCode; // 公制單位或個、瓣…；適量與少許不帶 amount
  optional: boolean;
  group?: string; // 「醃料」「醬汁」
}

export interface DraftStep {
  id: string;
  order: number;
  text: string; // 不含帶單位的數字；溫度用 {{temp:180:C}} 標記
  timerSeconds?: number;
  techniques?: string[];
  equipmentTypeIds?: string[];
  targetTemp?: Temperature;
}

export interface RecipeDraft {
  schemaVersion: 1;
  servings: number; // 份量依這個人數寫
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  tips?: string;
  model: string;
}

// expand_steps 的輸入：首頁或對話的點子（快取列的 id＋點子的 id），或收藏的點子
export type ExpandInput = { suggestionId: string; ideaId: string } | { bookmarkId: string };

export type ExpandResponse = { status: 'ok'; source: 'ai' | 'cache'; draft: RecipeDraft };

// 自由文字裡的標記：{{temp:180:C}}（數字用攝氏或華氏，由手機依偏好轉換）
const TEMP_MARK = /\{\{temp:(\d{2,3}):([CF])\}\}/g;
export function replaceTempMarks(text: string, render: (value: number, unit: 'C' | 'F') => string): string {
  return text.replace(TEMP_MARK, (_m, v: string, u: string) => render(Number(v), u as 'C' | 'F'));
}

// ---------------------------------------------------------------------------------------------
// 和大廚聊聊（M1a-07）：`ai` 函式 chat 任務的輸入與回傳
// ---------------------------------------------------------------------------------------------
export const CHAT_MAX_USER_CHARS = 500; // 使用者每則上限
export const CHAT_MAX_TURNS = 20; // 一段對話最多幾輪（使用者一句加大廚一句算一輪）

export const CHAT_MIN_CHEF_TURNS = 3; // 大廚至少回應幾輪（含這一則）才給點子；使用者要求時不受限
export const CHAT_MAX_IDEAS = 2; // 收斂後一次最多幾個點子
export const CHAT_MIN_OPTIONS = 2;
export const CHAT_MAX_OPTIONS = 4;
export const CHAT_GIVE_IDEAS_TEXT = '直接給我點子'; // 「直接給我點子」按鈕代送的話

// 大廚的反問：一個問題加 2 到 4 個選項（multi：可以複選）；使用者也可以自己打字
export interface ChatAsk {
  question: string;
  options: string[];
  multi: boolean;
}

export interface ChatMention {
  text: string;
  ingredientId: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'chef';
  text: string; // 大廚的話可能含 {{temp:180:C}} 標記
  ask?: ChatAsk; // 大廚的反問與選項（有反問就沒有點子）
  suggestionId?: string; // 大廚這一則附的點子（ai_suggestion_cache 的 id）
  at: string;
}

// chat 的輸入：conversationId 空的就開新的一段；continueFrom 是滿 20 輪的那一段，新的一段從它的條件摘要開始
export interface ChatInput {
  message: string;
  conversationId?: string;
  continueFrom?: string;
  wantIdeas?: boolean; // 按了「直接給我點子」：不受「至少 3 輪」限制
}

export type ChatResponse =
  | { status: 'ok'; conversationId: string; turnCount: number; userMessage: ChatMessage; chefMessage: ChatMessage; ideas: AiIdea[]; hint: string | null }
  | { status: 'full' }; // 這一段已經滿 20 輪
