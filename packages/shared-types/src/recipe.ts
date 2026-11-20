// 食譜裡內嵌 JSON 的格式（對應資料庫 `private.is_recipe_*` 的 JSON Schema；key 一律 snake_case）。
// 資料表本身的型別由 `pnpm gen:types` 產生；jsonb 欄位的內容產生不出來，所以在這裡寫一份，前端與 Edge Functions 共用。

export type Temperature = { value: number; unit: 'C' | 'F' };

export type RecipeIngredient = {
  id: string; // 穩定 ID，調整順序也不會對錯
  raw_text: string; // 「醬油 2 大匙」原文
  ingredient_id?: string; // 解析後的標準食材；字典裡找不到的視為對應不到
  amount?: number;
  amount_max?: number; // 範圍的上限，例「蒜 2–3 瓣」
  unit?: string; // 原始單位（UnitCode），顯示時才換算
  optional: boolean;
  group?: string; // 「醃料」「醬汁」
  declared_allergen_ids?: string[];
  declared_traits?: string[];
};

export type RecipeStep = {
  id: string; // UUID（照片、烹飪模式進度都指向它）
  order: number;
  text: string; // 溫度、份量用標記，例「烤箱預熱 {{temp:180:C}}」
  timer_seconds?: number;
  techniques?: string[];
  equipment_type_ids?: string[];
  target_temp?: Temperature;
};

export type Rating = 'loved' | 'ok' | 'flop';

export type CookNote = {
  id: string; // UUID（又做了一次的照片指向它）
  cooked_on: string; // YYYY-MM-DD
  text?: string;
  rating?: Rating;
};

export type Highlight =
  | 'first_time'
  | 'hosted_friends'
  | 'improved'
  | 'family_favorite'
  | 'festive'
  | 'make_again'
  | 'funny_flop';

export type RecipeVisibility = 'private' | 'household' | 'friends';

// 五個面向 1–5；overall 由資料庫算，送出去的值會被覆蓋
export type RecipeDifficulty = {
  ingredients: number;
  equipment: number;
  time: number;
  technique: number;
  failure_risk: number;
  overall?: number;
  source: 'author' | 'ai';
  estimated_from?: 'recipe' | 'text';
};

export type RecipeAiTags = {
  cuisine_keys?: string[];
  main_ingredient_ids?: string[];
  techniques?: string[];
  equipment_type_ids?: string[];
  flavors?: string[];
  confirmed_by_user: boolean;
};

export type RecipeSource = {
  type: 'original' | 'url' | 'friend' | 'share_link' | 'ai' | 'external_ai';
  share_link_id?: string;
  url?: string;
  from_user_id?: string;
  from_user_name?: string;
};

export type Diner =
  | { type: 'member'; user_id: string }
  | { type: 'household'; household_profile_id: string }
  | { type: 'friend'; user_id: string }
  | { type: 'text'; name: string };

export type Dictation = { text: string; lang: string; at: string };
