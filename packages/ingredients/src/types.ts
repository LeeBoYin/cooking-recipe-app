// 字典檔的格式（05 資料模型）。字典檔用 camelCase；匯入資料庫時轉成 snake_case 的欄位。
export type LanguageTag = string;
export type RegionCode = string;
export type LocalizedText = { 'zh-TW': string } & Record<LanguageTag, string>;
export type LocalizedTerms = { 'zh-TW': string[] } & Record<LanguageTag, string[]>;

export const INGREDIENT_TRAITS = [
  'animal', 'meat', 'pork', 'beef', 'lamb', 'poultry', 'seafood', 'shellfish', 'egg', 'dairy', 'honey', 'alcohol', 'allium',
] as const;
export type IngredientTrait = (typeof INGREDIENT_TRAITS)[number];

export const INGREDIENT_CATEGORIES = [
  'vegetable', 'fruit', 'mushroom', 'meat', 'poultry', 'seafood', 'egg', 'dairy', 'tofu-bean', 'grain', 'noodle',
  'seasoning', 'sauce', 'spice', 'herb', 'oil', 'nut-seed', 'dried-goods', 'processed', 'beverage', 'other',
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const STORAGE_ZONES = ['seasoning', 'fridge', 'freezer', 'pantry'] as const;
export type StorageZone = (typeof STORAGE_ZONES)[number];

export const FLAVOR_TAGS = ['salty', 'sweet', 'sour', 'spicy', 'umami', 'aromatic', 'bitter'] as const;
export type FlavorTag = (typeof FLAVOR_TAGS)[number];

export interface Ingredient {
  id: string;
  name: LocalizedText;
  aliases: LocalizedTerms;
  family: string;
  traits: IngredientTrait[];
  category: IngredientCategory;
  defaultStorage: StorageZone;
  isPerishable: boolean;
  recentDays?: number; // 不再使用；資料先留著，之後清掉（08）
  densityGPerMl?: number;
  seasonMonths?: Partial<Record<RegionCode, number[]>>;
  flavorTags?: FlavorTag[];
  allergenIds?: string[];
  deprecated?: boolean;
  replacedBy?: string;
}

export interface Allergen {
  id: string;
  name: LocalizedText;
  aliases: LocalizedTerms;
  parentId?: string;
  regions?: RegionCode[];
  displayLevelByRegion?: Partial<Record<RegionCode, 'self' | 'parent'>>;
  deprecated?: boolean;
  replacedBy?: string;
}

export interface DietaryRestriction {
  id: string;
  name: LocalizedText;
  excludesTraits: IngredientTrait[];
  excludesIngredientIds?: string[];
  deprecated?: boolean;
  replacedBy?: string;
}

export type UiLocale = 'zh-TW';
export type Hemisphere = 'north' | 'south';
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';

// 節日（05 Holiday）。日期規則 rule 的格式：
//   'nth-weekday:月:星期:第幾個'  例 'nth-weekday:11:4:4' = 11 月第 4 個星期四（星期 0 = 週日）
//   'last-weekday:月:星期'        例 'last-weekday:5:1' = 5 月最後一個星期一
//   其他以小寫英文與連字號命名的規則，例 'jp-doyo-ushi:summer'，由日期計算模組認得時才生效
export type HolidayDate =
  | { type: 'fixed'; month: number; day: number }
  | { type: 'lunar'; month: number; day: number }
  | { type: 'solar_term'; term: string }
  | { type: 'rule'; rule: string };

export interface Holiday {
  id: string;
  name: LocalizedText;
  date: HolidayDate;
  dishIdeas: string[]; // 對應 BaseDish 的 ID
  leadDays: number; // 節日前幾天開始出現在季節靈感
}

// 地區設定（05 RegionProfile）
export interface RegionProfile {
  code: RegionCode;
  name: LocalizedText;
  hemisphere: Hemisphere;
  defaultTimezone: string;
  defaultLocale: UiLocale;
  defaultUnits: { temperature: 'C' | 'F'; measure: 'metric' | 'us' };
  seasons: { key: SeasonKey; months: number[] }[];
  usesSolarTerms: boolean;
  holidays: Holiday[];
  commonPantryIngredientIds: string[];
  stapleIngredientIds: string[];
  pantrySeasoningIds: string[];
  dataStatus: 'full' | 'partial';
}
