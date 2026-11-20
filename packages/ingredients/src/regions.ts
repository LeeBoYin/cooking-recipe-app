// 地區設定字典（05 RegionProfile）。換地區或新增地區只要加一筆，不用改程式（步驟見 15）。
// 目前三個地區：台灣（TW）、美國加州（US-CA）、日本（JP）。只有台灣有常見食材的清單（約 34 樣的範例，
// 正式清單依 15 的流程換成當地超市常見的約 40 樣）；US-CA 與 JP 先是骨架（dataStatus 為 partial），
// 節日、當季食材、過敏原標示、安全標準等資料另外補，補完之前常見食材退回用台灣的。
import type { RegionProfile } from './types.ts';

const NORTH_SEASONS: RegionProfile['seasons'] = [
  { key: 'spring', months: [3, 4, 5] },
  { key: 'summer', months: [6, 7, 8] },
  { key: 'autumn', months: [9, 10, 11] },
  { key: 'winter', months: [12, 1, 2] },
];

export const regionProfiles: RegionProfile[] = [
  {
    code: 'TW',
    name: { 'zh-TW': '台灣' },
    hemisphere: 'north',
    defaultTimezone: 'Asia/Taipei',
    defaultLocale: 'zh-TW',
    defaultUnits: { temperature: 'C', measure: 'metric' },
    seasons: NORTH_SEASONS,
    usesSolarTerms: false,
    holidays: [],
    commonPantryIngredientIds: [
      'soy-sauce', 'rice-wine', 'sesame-oil', 'salt', 'sugar', 'black-pepper', 'mirin', 'fish-sauce', 'rock-sugar', 'honey',
      'garlic', 'scallion', 'ginger', 'onion', 'chili-pepper', 'cabbage', 'tomato', 'eggplant', 'shiitake', 'thai-basil',
      'egg', 'tofu', 'milk', 'pork-belly', 'ground-pork', 'chicken-thigh', 'beef-slices', 'shrimp', 'salmon',
      'rice', 'noodles', 'flour', 'peanut', 'cooking-oil',
    ],
    stapleIngredientIds: [
      'rice', 'noodles', 'glass-noodles', 'rice-noodles', 'spaghetti', 'instant-noodles', 'flour', 'oats',
      'dried-shiitake', 'wood-ear', 'dried-shrimp', 'seaweed', 'red-dates', 'goji', 'dried-chili',
      'red-bean', 'mung-bean', 'peanut', 'sesame-seed',
      'tuna-can', 'corn-can', 'canned-tomato',
      'frozen-dumplings', 'frozen-edamame', 'frozen-mixed-veg',
      'egg', 'onion', 'potato', 'sweet-potato', 'carrot', 'garlic', 'ginger',
    ],
    dataStatus: 'partial',
  },
  {
    code: 'US-CA',
    name: { 'zh-TW': '美國加州' },
    hemisphere: 'north',
    defaultTimezone: 'America/Los_Angeles',
    defaultLocale: 'zh-TW',
    defaultUnits: { temperature: 'F', measure: 'us' },
    seasons: NORTH_SEASONS,
    usesSolarTerms: false,
    holidays: [],
    commonPantryIngredientIds: [],
    stapleIngredientIds: [],
    dataStatus: 'partial',
  },
  {
    code: 'JP',
    name: { 'zh-TW': '日本' },
    hemisphere: 'north',
    defaultTimezone: 'Asia/Tokyo',
    defaultLocale: 'zh-TW',
    defaultUnits: { temperature: 'C', measure: 'metric' },
    seasons: NORTH_SEASONS,
    usesSolarTerms: false,
    holidays: [],
    commonPantryIngredientIds: [],
    stapleIngredientIds: [],
    dataStatus: 'partial',
  },
];

// 地區代碼：兩個大寫字母（國家），可以加子區代碼（US-CA）
export const REGION_CODE_PATTERN = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

// 地區和它所有的上層，由近到遠：US-CA → ['US-CA', 'US']
export function regionChain(code: string): string[] {
  const parts = code.split('-');
  return parts.map((_, i) => parts.slice(0, parts.length - i).join('-'));
}

// 找不到該地區就退回上層（US-TX → US）；都沒有就是沒有，呼叫端改用依南北半球的四季
export function getRegionProfile(code: string): RegionProfile | undefined {
  for (const c of regionChain(code)) {
    const found = regionProfiles.find((r) => r.code === c);
    if (found) return found;
  }
  return undefined;
}

// 快速盤點與常買清單的起點。沒有該地區的設定、或該地區還沒有清單時，用台灣的
export function commonIngredientIdsFor(region: string): string[] {
  const own = getRegionProfile(region)?.commonPantryIngredientIds ?? [];
  return own.length > 0 ? own : (getRegionProfile('TW')?.commonPantryIngredientIds ?? []);
}

// 新手引導 ⑦ 的常備食材：沒有該地區的設定、或該地區還沒有清單時，用台灣的
export function stapleIngredientIdsFor(region: string): string[] {
  const own = getRegionProfile(region)?.stapleIngredientIds ?? [];
  return own.length > 0 ? own : (getRegionProfile('TW')?.stapleIngredientIds ?? []);
}
