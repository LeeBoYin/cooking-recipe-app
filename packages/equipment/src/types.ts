// 廚具與手法字典的格式（05 資料模型、07 第五節）。字典檔用 camelCase；匯入資料庫時轉成 snake_case 的欄位。
export type LanguageTag = string;
export type RegionCode = string;
export type LocalizedText = { 'zh-TW': string } & Record<LanguageTag, string>;
export type LocalizedTerms = { 'zh-TW': string[] } & Record<LanguageTag, string[]>;

export const TECHNIQUE_GROUPS = ['heat', 'no-heat', 'time-temp'] as const;
export type TechniqueGroup = (typeof TECHNIQUE_GROUPS)[number];

export const EQUIPMENT_CATEGORIES = [
  'heat-source', 'cookware', 'appliance', 'blending', 'knife-prep', 'special', 'measuring', 'baking',
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const ONBOARDING_MODES = ['default-on', 'show', 'hidden'] as const;
export type OnboardingMode = (typeof ONBOARDING_MODES)[number];

export const DISHWASHER_SAFE = ['yes', 'partial', 'no', 'n/a'] as const;
export type DishwasherSafe = (typeof DISHWASHER_SAFE)[number];

export type TechniqueId = string;

export interface Technique {
  id: TechniqueId;
  name: LocalizedText;
  group: TechniqueGroup;
  safetyRuleId?: string; // 需要安全檢查的手法（舒肥、油炸、壓力烹調…）對應的規則
}

export interface EquipmentType {
  id: string;
  name: LocalizedText;
  aliases: LocalizedTerms;
  regions?: RegionCode[]; // 只在某些地區常見的廚具；空的代表各地都有
  category: EquipmentCategory;
  techniques: TechniqueId[]; // 本身就能做的手法
  optionalTechniques?: TechniqueId[]; // 部分機型才有；使用者只回答「有沒有」，不能自己勾手法
  requiresHeatSource: boolean; // 鍋具類：要有可用的爐具才算做得到
  isHeatSource: boolean;
  assists?: TechniqueId[]; // 量測工具：不做手法，但讓手法更準更安全
  onboarding: { default: OnboardingMode; byRegion?: Partial<Record<RegionCode, OnboardingMode>> };
  dishwasherSafe: DishwasherSafe;
  iconKey: string;
  deprecated?: boolean;
  replacedBy?: string;
}
