// 首頁點子（M1a-06）的型別：ai_home_context 回來的資料、AI 的輸出、存進快取與回給手機的格式。
import type { ComputedTaste, IdeaSlot, TasteSnapshotData } from '../../../../packages/core/src/index.ts';

export type Slot = IdeaSlot;
export const SLOT_LIMITS: Readonly<Record<Slot, number>> = { familiar: 2, twist: 2, adventure: 1 };
export const SLOTS = Object.keys(SLOT_LIMITS) as Slot[];

// ai_home_context 的回傳（snake_case，和資料庫一致）
export interface HomeContextRow {
  read_at?: string; // 讀這份資料的資料庫時間；存口味檔案時用來判斷讀完之後有沒有新的變動
  kitchen: { id: string; region: string; timezone: string };
  settings: { locale: string; chef_persona: string };
  taste: { dims: Record<string, { affinity: number; confidence: number; source: 'user_set' | 'explored' | 'learned'; updated_at: string }>; context: Record<string, unknown> } | null;
  // 口味檔案：快照（不存在是 null）；過期或不存在時 taste_inputs 附上重算用的原始資料
  taste_snapshot?: { stale: boolean; computed_at?: string; data: TasteSnapshotData } | null; // stale 已含「超過 30 天沒重算」
  taste_inputs?: {
    saved: { base_dish_id: string | null; ingredient_ids: string[]; cooked: boolean; at: string }[];
    signals: { at: string; signals: { dimension_key?: string; affinity?: number; scope?: string }[] }[];
  } | null;
  // ai 函式讀口味前算好的（withMergedTaste）：口味地圖加上收藏、回饋、對話與食材；沒有時 buildHomeEnv 退回只用口味地圖
  merged_taste?: ComputedTaste;
  dietary: { allergen_ids: string[]; restriction_ids: string[]; dislike_ingredient_ids: string[]; no_cooking_alcohol: boolean } | null;
  pantry: { ingredient_id: string; want_to_use_soon: boolean; expires_at: string | null }[];
  equipment: { equipment_type_id: string | null; enabled_optional_techniques: string[] }[];
  recipes: {
    id: string;
    title: string | null;
    ingredient_ids: string[];
    ingredients: unknown;
    highlights: string[];
    cooked_dates: string[];
    cooked_at: string | null;
    published_at: string | null;
    difficulty: { overall?: number; ingredients: number; equipment: number; time: number; technique: number; failure_risk: number } | null;
  }[];
  recent: { id: string; input_hash: string; round: number; created_at: string; expires_at: string; payload: unknown }[];
}

export interface RawIdea {
  slot: Slot;
  candidate_ref: string;
  title: string;
  why: string;
  uses_pantry_ids: string[];
  uses_priority_ids: string[];
  other_ingredients: { name: string }[];
  difficulty: { ingredients: number; equipment: number; time: number; technique: number; failure_risk: number };
  techniques: string[];
  equipment: string[];
  substitutions: { need: string; use: string }[];
}

export interface RawOutput {
  suggestions: RawIdea[];
  chef_comment: string;
}

// 存下來、回給手機的格式放在 core（後端與手機共用）
export type { AiIdea as HomeIdea, AiIdeasPayload as HomePayload, HomeIdeasResponse as HomeResponse } from '../../../../packages/core/src/index.ts';

export type DropReason =
  | 'format' | 'slot_limit' | 'duplicate' | 'already_shown' | 'bad_candidate' | 'pantry_not_sent' | 'allergen' | 'allergen_unknown_ingredient'
  | 'keyword' | 'technique' | 'equipment' | 'wording' | 'too_hard';
