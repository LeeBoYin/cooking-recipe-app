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
  recentDays?: number;
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
