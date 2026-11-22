// 和大廚聊聊（M1a-07）的型別：ai_chat_get 回來的對話、AI 的輸出。回給手機的格式放在 core（ChatResponse）。
import type { ChatMention, ChatMessage } from '../../../../packages/core/src/index.ts';
import type { RawIdea } from '../home/types.ts';

export type { ChatMention };

export interface ChatSignal {
  dimensionKey: string;
  affinity: number;
  scope: 'long_term' | 'today';
}

// ai_chat_get 的回傳（訊息的欄位是 camelCase：存進 jsonb 的格式）
export interface ChatConversationRow {
  id: string;
  kitchen_id: string | null;
  summary: string | null;
  turn_count: number;
  messages: ChatMessage[];
  mentioned_ingredients: ChatMention[];
  last_message_at: string;
  suggestions: { id: string; payload: { ideas?: { title?: string }[] } }[];
}

export interface RawChatOutput {
  reply: string;
  ask: { question: string; options: string[]; multi: boolean } | null;
  suggestions: RawIdea[];
  mentioned_ingredients: { text: string; ingredient_id: string | null }[];
  preference_signals: { dimension_key: string; affinity: number; scope: 'long_term' | 'today' }[];
  summary: string;
  user_wants_ideas: boolean; // 使用者這一則是不是明說要點子（按了「直接給我點子」由程式另外帶）
}

export type ChatDropReason = 'reply_wording' | 'reply_excluded' | 'ask_wording' | 'ask_excluded' | 'ask_options' | 'mention' | 'signal' | 'too_early' | 'low_coverage' | 'summary';
