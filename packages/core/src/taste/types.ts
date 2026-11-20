// 口味探索用的型別（13 第四節）。只描述 core 用得到的欄位，字典套件（@zhusha/taste）的型別符合這些形狀。

export interface TasteDimension {
  key: string;
  group: string;
  parentKey?: string;
  impact: number; // 0–1，對點子的影響力
  deprecated?: boolean;
}

export type TasteQuizItemType = 'dish_card' | 'this_or_that' | 'spectrum' | 'quick_fire' | 'constraint' | 'context';
export type TasteContextField = 'time_preference' | 'cooks_for' | 'adventure';

export interface TasteQuizOption {
  mapping?: Record<string, number>;
  value?: string | number;
  addGoal?: string;
}

export interface TasteQuizItem {
  id: string;
  type: TasteQuizItemType;
  regions: string[];
  mapping: Record<string, number>;
  options?: TasteQuizOption[];
  spectrum?: { dimension: string };
  contextField?: TasteContextField;
  excludedAllergenIds?: string[];
  excludedRestrictionIds?: string[];
  followUps?: string[];
  deprecated?: boolean;
}

export type DimensionSource = 'user_set' | 'explored' | 'learned';

export interface DimensionState {
  affinity: number; // −1 很不喜歡 ～ +1 很喜歡
  confidence: number; // 0 ～ 1，把握程度
  source: DimensionSource;
  updatedAt: string; // ISO 時間
}

export interface TasteContext {
  timePreference?: 'quick' | 'normal' | 'relaxed';
  cooksFor?: ('self' | 'partner' | 'family' | 'guests')[];
  adventure: number; // 0–1
  goals: string[]; // 想學的方向（維度 key）
  festiveDishes: boolean;
}

// 口味地圖（05 PreferenceProfile 中會被探索改動的部分）
export interface TasteProfile {
  dims: Record<string, DimensionState>;
  context: TasteContext;
  answeredItemIds: string[];
  lastExploredAt?: string;
}

export type QuizAnswer =
  | { type: 'dish_card'; value: 'love' | 'try' | 'ok' | 'nope' } // 喜歡／想試試／普通／不愛
  | { type: 'quick_fire'; value: 'love' | 'ok' | 'no' } // 愛／還好／不行
  | { type: 'this_or_that'; choice: 0 | 1 }
  | { type: 'spectrum'; point: 0 | 1 | 2 | 3 | 4 } // 由「最不要」到「最愛」
  | { type: 'context'; choices: number[] }; // 選項的索引；cooks_for 可複選，其他只收第一個

export const EMPTY_CONTEXT: TasteContext = { adventure: 0.2, goals: [], festiveDishes: false };

export function emptyProfile(): TasteProfile {
  return { dims: {}, context: { ...EMPTY_CONTEXT, goals: [] }, answeredItemIds: [] };
}
