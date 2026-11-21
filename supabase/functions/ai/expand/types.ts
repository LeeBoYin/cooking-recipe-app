// 展開做法（M1a-09）的型別：ai_expand_get 回來的資料、AI 的輸出。存下來與回給手機的格式放在 core（RecipeDraft）。
import type { AiIdea, RecipeDraft } from '../../../../packages/core/src/index.ts';

// ai_expand_get 的回傳（snake_case 是資料庫函式的欄位；idea 與 draft 是存進 jsonb 的 camelCase 格式）
export interface ExpandRow {
  household_size: number;
  idea: AiIdea | null; // 首頁或對話的點子本身；收藏的點子在快取已經清掉時是 null
  snapshot: { title: string; why?: string; baseDishId?: string; suggestionId?: string; recipeDraft?: RecipeDraft } | null; // 對應的收藏快照
  ingredient_ids: string[]; // 收藏時定下的主要食材
  draft: RecipeDraft | null; // 已經展開過的做法
  cache_id: string | null;
  idea_id: string | null;
  bookmark_id: string | null;
}

export interface RawDraftIngredient {
  name: string;
  amount: number | null;
  amount_max: number | null;
  unit: string;
  optional: boolean;
  group: string | null;
}

export interface RawDraftStep {
  text: string;
  timer_seconds: number | null;
  techniques: string[];
  equipment: string[];
  target_temp_c: number | null;
}

export interface RawDraft {
  ingredients: RawDraftIngredient[];
  steps: RawDraftStep[];
  tips: string | null;
}

// 檢查沒過的原因（只有類別，不含內容）
export type DraftProblem =
  | 'format' | 'unit' | 'allergen' | 'allergen_unknown_ingredient' | 'keyword' | 'technique' | 'equipment' | 'safety' | 'wording';
