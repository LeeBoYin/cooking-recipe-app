// 地區設定字典（05 RegionProfile）。換地區或新增地區只要加一筆，不用改程式（步驟見 15）。
// 目前三個地區：台灣（TW）、美國加州（US-CA）、日本（JP）。US-CA 與 JP 的節日、常見食材、常備食材照 15 第三節補好；
// 當季月份是一般性的估計、安全標準還在等人審，所以三個地區的 dataStatus 都還是 partial。
// 沒有該地區的清單時（例如其他地區），常見食材退回用台灣的。
import type { Holiday, RegionProfile } from './types.ts';

const NORTH_SEASONS: RegionProfile['seasons'] = [
  { key: 'spring', months: [3, 4, 5] },
  { key: 'summer', months: [6, 7, 8] },
  { key: 'autumn', months: [9, 10, 11] },
  { key: 'winter', months: [12, 1, 2] },
];

const US_HOLIDAYS: Holiday[] = [
  { id: 'memorial-day', name: { 'zh-TW': '陣亡將士紀念日' }, date: { type: 'rule', rule: 'last-weekday:5:1' }, dishIdeas: ['cheeseburger'], leadDays: 3 },
  { id: 'independence-day', name: { 'zh-TW': '美國獨立紀念日' }, date: { type: 'fixed', month: 7, day: 4 }, dishIdeas: ['cheeseburger', 'baked-bbq-ribs'], leadDays: 5 },
  { id: 'labor-day', name: { 'zh-TW': '勞動節（美國）' }, date: { type: 'rule', rule: 'nth-weekday:9:1:1' }, dishIdeas: ['cheeseburger', 'baked-bbq-ribs'], leadDays: 3 },
  { id: 'halloween', name: { 'zh-TW': '萬聖節' }, date: { type: 'fixed', month: 10, day: 31 }, dishIdeas: ['pumpkin-soup'], leadDays: 7 },
  { id: 'thanksgiving', name: { 'zh-TW': '感恩節' }, date: { type: 'rule', rule: 'nth-weekday:11:4:4' }, dishIdeas: ['roast-turkey-breast', 'mashed-potatoes', 'pumpkin-soup'], leadDays: 7 },
  { id: 'christmas', name: { 'zh-TW': '聖誕節' }, date: { type: 'fixed', month: 12, day: 25 }, dishIdeas: ['roast-turkey-breast', 'roast-chicken-potatoes', 'mashed-potatoes'], leadDays: 7 },
];

const JP_HOLIDAYS: Holiday[] = [
  { id: 'shogatsu', name: { 'zh-TW': '正月（元旦）' }, date: { type: 'fixed', month: 1, day: 1 }, dishIdeas: ['zoni'], leadDays: 7 },
  { id: 'nanakusa', name: { 'zh-TW': '七草（人日）' }, date: { type: 'fixed', month: 1, day: 7 }, dishIdeas: ['nanakusa-gayu'], leadDays: 2 },
  { id: 'setsubun', name: { 'zh-TW': '節分' }, date: { type: 'fixed', month: 2, day: 3 }, dishIdeas: ['ehomaki'], leadDays: 3 },
  { id: 'hinamatsuri', name: { 'zh-TW': '女兒節（雛祭）' }, date: { type: 'fixed', month: 3, day: 3 }, dishIdeas: ['chirashizushi'], leadDays: 5 },
  { id: 'tanabata', name: { 'zh-TW': '七夕' }, date: { type: 'fixed', month: 7, day: 7 }, dishIdeas: ['somen'], leadDays: 5 },
  { id: 'doyo-ushi', name: { 'zh-TW': '土用丑日' }, date: { type: 'rule', rule: 'jp-doyo-ushi:summer' }, dishIdeas: ['unagi-don'], leadDays: 5 },
  { id: 'tsukimi', name: { 'zh-TW': '中秋賞月（月見）' }, date: { type: 'lunar', month: 8, day: 15 }, dishIdeas: ['tsukimi-udon'], leadDays: 3 },
  { id: 'toji', name: { 'zh-TW': '冬至' }, date: { type: 'solar_term', term: 'dongzhi' }, dishIdeas: ['kabocha-nimono'], leadDays: 3 },
  { id: 'omisoka', name: { 'zh-TW': '除夕（大晦日）' }, date: { type: 'fixed', month: 12, day: 31 }, dishIdeas: ['toshikoshi-soba'], leadDays: 5 },
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
    pantrySeasoningIds: [
      'soy-sauce', 'dark-soy-sauce', 'rice-wine', 'mirin', 'fish-sauce', 'sesame-oil', 'salt', 'sugar', 'rock-sugar', 'black-pepper',
      'white-pepper', 'honey', 'white-vinegar', 'black-vinegar', 'oyster-sauce', 'doubanjiang', 'ketchup', 'mayonnaise', 'chili-sauce', 'sha-cha-sauce',
      'sesame-paste', 'chicken-powder', 'tapioca-starch', 'five-spice', 'cumin', 'sichuan-pepper', 'star-anise', 'curry-powder', 'miso', 'olive-oil',
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
    holidays: US_HOLIDAYS,
    commonPantryIngredientIds: [
      'salt', 'black-pepper', 'sugar', 'olive-oil', 'butter', 'cooking-oil', 'soy-sauce', 'ketchup', 'mayonnaise', 'mustard', 'bbq-sauce',
      'garlic', 'onion', 'potato', 'tomato', 'carrot', 'broccoli', 'bell-pepper', 'lettuce', 'spinach', 'avocado', 'lemon', 'cucumber', 'button-mushroom',
      'egg', 'milk', 'cheddar-cheese', 'yogurt',
      'chicken-breast', 'chicken-thigh', 'ground-beef', 'bacon', 'pork-chop', 'salmon', 'shrimp',
      'rice', 'spaghetti', 'bread', 'tortilla', 'flour', 'banana',
    ],
    stapleIngredientIds: [
      'rice', 'spaghetti', 'macaroni', 'flour', 'oats', 'instant-noodles', 'tortilla',
      'peanut-butter', 'raisins', 'almond', 'walnut',
      'black-beans-can', 'chickpea-can', 'tuna-can', 'corn-can', 'canned-tomato', 'chicken-broth', 'pasta-sauce',
      'frozen-peas', 'frozen-berries', 'frozen-mixed-veg', 'frozen-edamame', 'frozen-dumplings',
      'egg', 'onion', 'potato', 'sweet-potato', 'carrot', 'garlic', 'ginger',
    ],
    pantrySeasoningIds: [
      'salt', 'black-pepper', 'sugar', 'honey', 'olive-oil', 'ketchup', 'mayonnaise', 'mustard', 'bbq-sauce', 'hot-sauce',
      'soy-sauce', 'white-vinegar', 'curry-powder', 'cumin', 'chili-sauce', 'oyster-sauce', 'sesame-oil', 'fish-sauce', 'miso', 'white-pepper',
      'tapioca-starch', 'mirin', 'rice-wine', 'sesame-paste', 'five-spice', 'star-anise', 'chicken-powder', 'wasabi',
    ],
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
    holidays: JP_HOLIDAYS,
    commonPantryIngredientIds: [
      'soy-sauce', 'miso', 'mirin', 'sake', 'salt', 'sugar', 'white-vinegar', 'cooking-oil', 'dashi-powder', 'mayonnaise', 'sesame-oil',
      'garlic', 'ginger', 'scallion', 'onion', 'cabbage', 'napa-cabbage', 'daikon', 'carrot', 'potato', 'tomato', 'eggplant', 'spinach', 'cucumber',
      'green-pepper', 'bean-sprouts', 'shiitake', 'enoki',
      'tofu', 'aburaage', 'natto', 'egg', 'milk',
      'pork-slices', 'ground-pork', 'chicken-thigh', 'chicken-breast', 'salmon', 'mackerel',
      'rice',
    ],
    stapleIngredientIds: [
      'rice', 'udon', 'soba', 'somen', 'spaghetti', 'instant-noodles', 'flour', 'panko', 'potato-starch',
      'kombu', 'katsuobushi', 'wakame', 'hijiki', 'seaweed', 'dried-shiitake', 'umeboshi', 'dashi-powder',
      'sesame-seed', 'red-bean', 'curry-roux', 'mochi',
      'tuna-can', 'corn-can', 'canned-tomato',
      'frozen-dumplings', 'frozen-edamame', 'frozen-mixed-veg',
      'egg', 'onion', 'potato', 'sweet-potato', 'carrot', 'garlic', 'ginger',
    ],
    pantrySeasoningIds: [
      'soy-sauce', 'mirin', 'sake', 'miso', 'salt', 'sugar', 'white-vinegar', 'sesame-oil', 'dashi-powder', 'mayonnaise',
      'ketchup', 'tonkatsu-sauce', 'ponzu', 'wasabi', 'black-pepper', 'white-pepper', 'honey', 'curry-powder', 'chili-sauce', 'sesame-paste',
      'oyster-sauce', 'doubanjiang', 'tapioca-starch', 'mustard', 'rice-wine', 'olive-oil', 'five-spice', 'sichuan-pepper', 'chicken-powder', 'fish-sauce',
    ],
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

// 新手引導 ⑦ 的醬料櫃：沒有該地區的設定、或該地區還沒有清單時，用台灣的
export function pantrySeasoningIdsFor(region: string): string[] {
  const own = getRegionProfile(region)?.pantrySeasoningIds ?? [];
  return own.length > 0 ? own : (getRegionProfile('TW')?.pantrySeasoningIds ?? []);
}
