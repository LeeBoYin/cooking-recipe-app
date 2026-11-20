// 地區設定字典（05 RegionProfile）。換地區或新增地區只要加一筆，不用改程式（步驟見 15）。
// 目前只有台灣：常見食材是約 34 樣的範例，正式清單依 15 的流程換成當地超市常見的約 40 樣；
// 節日與當季資料做到推薦功能時再補，所以 dataStatus 是 partial。
import type { RegionProfile } from './types.ts';

export const regionProfiles: RegionProfile[] = [
  {
    code: 'TW',
    name: { 'zh-TW': '台灣' },
    hemisphere: 'north',
    defaultTimezone: 'Asia/Taipei',
    defaultLocale: 'zh-TW',
    defaultUnits: { temperature: 'C', measure: 'metric' },
    seasons: [
      { key: 'spring', months: [3, 4, 5] },
      { key: 'summer', months: [6, 7, 8] },
      { key: 'autumn', months: [9, 10, 11] },
      { key: 'winter', months: [12, 1, 2] },
    ],
    usesSolarTerms: false,
    holidays: [],
    commonPantryIngredientIds: [
      'soy-sauce', 'rice-wine', 'sesame-oil', 'salt', 'sugar', 'black-pepper', 'mirin', 'fish-sauce', 'rock-sugar', 'honey',
      'garlic', 'scallion', 'ginger', 'onion', 'chili-pepper', 'cabbage', 'tomato', 'eggplant', 'shiitake', 'thai-basil',
      'egg', 'tofu', 'milk', 'pork-belly', 'ground-pork', 'chicken-thigh', 'beef-slices', 'shrimp', 'salmon',
      'rice', 'noodles', 'flour', 'peanut', 'cooking-oil',
    ],
    dataStatus: 'partial',
  },
];

export function getRegionProfile(code: string): RegionProfile | undefined {
  return regionProfiles.find((r) => r.code === code);
}

// 快速盤點與常買清單的起點。沒有該地區的設定時用台灣的
export function commonIngredientIdsFor(region: string): string[] {
  return (getRegionProfile(region) ?? getRegionProfile('TW'))?.commonPantryIngredientIds ?? [];
}
