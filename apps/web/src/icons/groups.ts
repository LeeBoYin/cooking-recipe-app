import type { EquipmentCategory } from '@zhusha/equipment';
import type { IngredientCategory } from '@zhusha/ingredients';

// 7 個顏色群組：同群組的 icon 共用一個淡色圓底，也共用一個動態載入的檔案（17 第七節）
export const COLOR_GROUPS = ['veg', 'fruit', 'meat', 'dairy', 'staple', 'seasoning', 'equipment'] as const;
export type ColorGroup = (typeof COLOR_GROUPS)[number];

// 用 Record 讓字典新增類別時，型別檢查就會提醒補上對應群組
export const INGREDIENT_GROUP: Record<IngredientCategory, ColorGroup> = {
  vegetable: 'veg',
  mushroom: 'veg',
  herb: 'veg',
  fruit: 'fruit',
  meat: 'meat',
  poultry: 'meat',
  seafood: 'meat',
  egg: 'dairy',
  dairy: 'dairy',
  'tofu-bean': 'dairy',
  grain: 'staple',
  noodle: 'staple',
  'dried-goods': 'staple',
  'nut-seed': 'staple',
  processed: 'staple',
  beverage: 'staple',
  other: 'staple',
  sauce: 'seasoning',
  seasoning: 'seasoning',
  spice: 'seasoning',
  oil: 'seasoning',
};

export const EQUIPMENT_GROUP: Record<EquipmentCategory, ColorGroup> = {
  'heat-source': 'equipment',
  cookware: 'equipment',
  appliance: 'equipment',
  blending: 'equipment',
  'knife-prep': 'equipment',
  special: 'equipment',
  measuring: 'equipment',
  baking: 'equipment',
};

// 圓底顏色放在 styles.css 的 --color-icon-*（含深色）
export const GROUP_BG: Record<ColorGroup, string> = {
  veg: 'var(--color-icon-veg)',
  fruit: 'var(--color-icon-fruit)',
  meat: 'var(--color-icon-meat)',
  dairy: 'var(--color-icon-dairy)',
  staple: 'var(--color-icon-staple)',
  seasoning: 'var(--color-icon-seasoning)',
  equipment: 'var(--color-icon-equipment)',
};
