// 口味地圖的字典檔格式（05 PreferenceDimension、QuizItem、BaseDish；13 第八節）。
// 字典檔用 camelCase；匯入資料庫時轉成 snake_case 的欄位。
export type LanguageTag = string;
export type RegionCode = string;
export type LocalizedText = { 'zh-TW': string } & Record<LanguageTag, string>;

export const DIMENSION_GROUPS = [
  'cuisine', 'taste', 'spice_type', 'seasoning', 'texture', 'form', 'protein', 'ingredient', 'richness',
] as const;
export type DimensionGroup = (typeof DIMENSION_GROUPS)[number];

// 維度 key 用點分層：cuisine.southeast_asia.thai（第一段一定是群組）
export interface PreferenceDimension {
  key: string;
  group: DimensionGroup;
  name: LocalizedText;
  parentKey?: string;
  impact: number; // 0–1，對點子的影響力，挑題目時用
  deprecated?: boolean;
  replacedBy?: string;
}

export const QUIZ_ITEM_TYPES = ['dish_card', 'this_or_that', 'spectrum', 'quick_fire', 'constraint', 'context'] as const;
export type QuizItemType = (typeof QUIZ_ITEM_TYPES)[number];

export interface QuizItem {
  id: string; // 小寫英文、數字、底線：card_tom_yum
  type: QuizItemType;
  title: LocalizedText;
  description?: LocalizedText; // 描述菜卡的感官描述，30 字以內
  regions: RegionCode[]; // 哪些地區的使用者會看到
  mapping: Record<string, number>; // 回答「喜歡」時各維度的加減（−1～1）；「不愛」時反向
  excludedAllergenIds?: string[]; // 有這些過敏原的人不會看到
  excludedRestrictionIds?: string[]; // 有這些飲食限制的人不會看到
  followUps?: string[];
  deprecated?: boolean;
  replacedBy?: string;
}

export interface BaseDishDifficulty {
  ingredients: 1 | 2 | 3 | 4 | 5;
  equipment: 1 | 2 | 3 | 4 | 5;
  time: 1 | 2 | 3 | 4 | 5;
  technique: 1 | 2 | 3 | 4 | 5;
  failureRisk: 1 | 2 | 3 | 4 | 5;
}

export interface BaseDish {
  id: string;
  name: LocalizedText;
  regions: RegionCode[]; // 空的代表各地都適合推薦
  cuisineKeys: string[];
  ingredientIds: string[];
  techniques: string[];
  equipmentTypeIds: string[];
  difficulty: BaseDishDifficulty;
  deprecated?: boolean;
  replacedBy?: string;
}
