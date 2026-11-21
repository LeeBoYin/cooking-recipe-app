// 首頁點子的評估集：10 組假想的使用者（M1a-06）。同一份資料有兩種用途：
// 1. 自動測試（home.test.ts）：用假的 AI 回應，測「檢查會拿掉違規的點子」，進 CI。
// 2. 手動實跑（run.ts）：真的呼叫 Claude，看輸出合不合理、口吻對不對；不進 CI（要花錢，也需要人打分）。
// 全部是假的資料，沒有任何真實使用者的內容。
import type { HomeContextRow, HomeIdea } from '../types.ts';
import type { HomeEnv } from '../env.ts';

export const NOW = new Date('2026-11-21T10:00:00Z'); // 台灣傍晚 6 點、加州凌晨 2 點（案例 6 另外指定時間）

const AT = '2026-11-01T00:00:00Z';
const dim = (affinity = 0.8, confidence = 0.8) => ({ affinity, confidence, source: 'explored' as const, updated_at: AT });
export const likes = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, dim()]));
export const pantry = (...ids: string[]) => ids.map((ingredient_id) => ({ ingredient_id, want_to_use_soon: false, expires_at: null as string | null }));
export const eq = (...ids: string[]) => ids.map((equipment_type_id) => ({ equipment_type_id, enabled_optional_techniques: [] as string[] }));

export const FREQ = { adventure: 0.3, goals: [] as string[], festive_dishes: false };

export function ctx(over: Partial<HomeContextRow> & { frequency?: string; adventure?: number; persona?: string }): HomeContextRow {
  const { frequency, adventure, persona, ...rest } = over;
  const base: HomeContextRow = {
    kitchen: { id: '0192f000-0000-7000-8000-000000000001', region: 'TW', timezone: 'Asia/Taipei' },
    settings: { locale: 'zh-TW', chef_persona: persona ?? 'warm' },
    taste: { dims: {}, context: { ...FREQ, ...(frequency ? { cooking_frequency: frequency } : {}), ...(adventure !== undefined ? { adventure } : {}) } },
    dietary: { allergen_ids: [], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false },
    pantry: [],
    equipment: [],
    recipes: [],
    recent: [],
  };
  return { ...base, ...rest, taste: rest.taste ?? base.taste };
}

export interface EvalCase {
  id: string;
  name: string;
  ctx: HomeContextRow;
  now?: Date;
  // 這一組該不該叫 AI（案例 4：新手門檻，不叫）
  callsAi: boolean;
  // 說給人看的期待（人工打分時對照）
  expectation: string;
  // 自動判斷（程式能判斷的部分）：回傳沒過的項目；空陣列是全過
  assert(ideas: HomeIdea[], env: HomeEnv): string[];
}

const textOf = (i: HomeIdea) => [i.title, i.why, ...i.otherIngredients.map((o) => o.name), ...i.substitutions.flatMap((s) => [s.need, s.use])].join(' ');
const mentions = (ideas: HomeIdea[], terms: string[]) => ideas.flatMap((i) => terms.filter((t) => textOf(i).includes(t)).map((t) => `${i.title}：提到「${t}」`));
const usesId = (ideas: HomeIdea[], ids: string[]) => ideas.flatMap((i) => ids.filter((id) => i.usesPantryIds.includes(id)).map((id) => `${i.title}：用了 ${id}`));

const SAMPLE_TASTE_TW = likes('cuisine.taiwan', 'cuisine.taiwan.home', 'form.stir_fry', 'protein.egg', 'protein.tofu_soy');

export const EVAL_CASES: EvalCase[] = [
  {
    id: '01-rice-cooker-occasional',
    name: '偶爾下廚、只有電鍋，喜歡台式；有高麗菜、雞蛋、豆腐',
    ctx: ctx({
      frequency: 'occasional',
      taste: { dims: likes('cuisine.taiwan', 'cuisine.taiwan.home', 'form.steamed', 'protein.egg', 'protein.tofu_soy'), context: { ...FREQ, cooking_frequency: 'occasional' } },
      pantry: pantry('cabbage', 'egg', 'tofu', 'soy-sauce', 'salt'),
      equipment: eq('tatung-rice-cooker'),
    }),
    callsAi: true,
    expectation: '都能用電鍋做、步驟少、語氣輕鬆；新挑戰也不超出電鍋。',
    assert: (ideas) => [
      ...ideas.flatMap((i) => i.techniques.filter((t) => !['steam', 'boil', 'braise', 'soy-braise'].includes(t)).map((t) => `${i.title}：手法 ${t} 電鍋做不到`)),
      ...ideas.flatMap((i) => i.equipment.filter((e) => e !== 'tatung-rice-cooker').map((e) => `${i.title}：廚具 ${e}`)),
      ...ideas.filter((i) => i.difficulty.overall > 4).map((i) => `${i.title}：難度 ${i.difficulty.overall} 超過 4`),
    ],
  },
  {
    id: '02-shrimp-peanut-allergy',
    name: '對蝦、花生過敏，喜歡泰式；冰箱有蝦仁',
    ctx: ctx({
      taste: { dims: likes('cuisine.southeast_asia', 'cuisine.southeast_asia.thai', 'taste.spicy', 'seasoning.fish_sauce_lemongrass'), context: FREQ },
      dietary: { allergen_ids: ['shrimp', 'peanut'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false },
      pantry: pantry('shrimp', 'chicken-thigh', 'thai-basil', 'fish-sauce', 'chili-pepper', 'garlic', 'rice'),
      equipment: eq('gas-stove', 'wok'),
    }),
    callsAi: true,
    expectation: '沒有蝦和花生（含蝦醬、花生粉），也不用那包蝦仁；泰式風味的雞肉或其他。',
    assert: (ideas) => [...usesId(ideas, ['shrimp', 'peanut']), ...mentions(ideas, ['蝦', '花生'])],
  },
  {
    id: '03-five-pungent-vegetarian',
    name: '五辛素；有豆腐、菇類、青菜',
    ctx: ctx({
      taste: { dims: likes('cuisine.taiwan.home', 'cuisine.japan.washoku', 'protein.tofu_soy', 'form.soup'), context: FREQ },
      dietary: { allergen_ids: [], restriction_ids: ['buddhist-vegetarian'], dislike_ingredient_ids: [], no_cooking_alcohol: false },
      pantry: pantry('tofu', 'shiitake', 'king-oyster-mushroom', 'bok-choy', 'ginger', 'soy-sauce', 'sesame-oil', 'rice'),
      equipment: eq('gas-stove', 'wok', 'saucepan'),
    }),
    callsAi: true,
    expectation: '沒有肉、蛋以外的動物性食材、蔥、蒜、韭菜、洋蔥（含蔥花、蒜末這類配料）。',
    assert: (ideas) => mentions(ideas, ['肉', '蔥', '蒜', '韭', '洋蔥', '蝦', '魚', '雞', '牛', '豬']),
  },
  {
    id: '04-new-account',
    name: '新帳號，口味只做了 3 題，沒有食譜，食材 2 樣',
    ctx: ctx({
      taste: { dims: { 'cuisine.taiwan': dim(0.6, 0.3), 'protein.egg': dim(0.6, 0.3) }, context: FREQ },
      pantry: pantry('egg', 'tomato'),
    }),
    callsAi: false,
    expectation: '不叫 AI，首頁顯示鼓勵文字（12 第四節）。',
    assert: (_ideas, env) => (env.notEnough ? [] : ['應該要被新手門檻擋下']),
  },
  {
    id: '05-mapo-tofu-familiar',
    name: '記錄過麻婆豆腐並標「值得再做」，愛用豆瓣醬；茄子快到期',
    ctx: ctx({
      taste: { dims: likes('cuisine.china.sichuan', 'seasoning.doubanjiang_mala', 'taste.numbing', 'protein.tofu_soy'), context: FREQ },
      pantry: [
        ...pantry('tofu', 'ground-pork', 'doubanjiang', 'garlic', 'scallion', 'rice'),
        { ingredient_id: 'eggplant', want_to_use_soon: false, expires_at: '2026-11-22' },
      ],
      equipment: eq('gas-stove', 'wok'),
      recipes: [{
        id: '0192f000-0000-7000-8000-0000000000a1', title: '麻婆豆腐',
        ingredient_ids: ['tofu', 'ground-pork', 'doubanjiang', 'garlic', 'scallion'], ingredients: [], highlights: ['make_again'],
        cooked_dates: ['2026-09-01'], cooked_at: '2026-09-01T10:00:00Z', published_at: '2026-09-01T10:00:00Z',
        difficulty: { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 2 },
      }],
    }),
    callsAi: true,
    expectation: '「熟悉的」有麻婆豆腐；變化版用豆瓣醬配茄子；理由提到你標過值得再做、茄子想先用掉（不說快壞了）。',
    assert: (ideas) => [
      ...(ideas.some((i) => i.slot === 'familiar' && i.title === '麻婆豆腐') ? [] : ['熟悉的沒有麻婆豆腐']),
      ...(ideas.some((i) => i.slot === 'twist' && i.usesPantryIds.includes('eggplant') && i.usesPantryIds.includes('doubanjiang')) ? [] : ['變化版沒有用豆瓣醬配茄子']),
    ],
  },
  {
    id: '06-california-taiwanese',
    name: '住美國加州，喜歡台式，沒有九層塔',
    ctx: ctx({
      kitchen: { id: '0192f000-0000-7000-8000-000000000006', region: 'US-CA', timezone: 'America/Los_Angeles' },
      taste: { dims: likes('cuisine.taiwan', 'cuisine.taiwan.home', 'seasoning.soy_sauce', 'form.stir_fry'), context: FREQ },
      pantry: pantry('chicken-thigh', 'eggplant', 'garlic', 'ginger', 'soy-sauce', 'rice-wine', 'sesame-oil', 'rice'),
      equipment: eq('gas-stove', 'frying-pan', 'oven'),
    }),
    now: new Date('2026-11-22T01:00:00Z'), // 加州下午 5 點
    callsAi: true,
    expectation: '想用九層塔的菜（三杯雞、塔香茄子）要換成當地好買的（甜羅勒），或註明可能要去專門店買。',
    assert: (ideas) =>
      ideas.flatMap((i) =>
        textOf(i).includes('九層塔') && !/甜羅勒|專門店|亞洲超市|替代|換成|可省/.test(textOf(i)) ? [`${i.title}：用九層塔卻沒說當地怎麼辦`] : [],
      ),
  },
  {
    id: '07-many-appliances',
    name: '廚具很多（氣炸鍋、烤箱、壓力鍋），喜歡日式；有雞腿、馬鈴薯',
    ctx: ctx({
      adventure: 0.7,
      taste: { dims: likes('cuisine.japan', 'cuisine.japan.washoku', 'seasoning.soy_sauce', 'seasoning.miso_dashi'), context: { ...FREQ, adventure: 0.7 } },
      pantry: pantry('chicken-thigh', 'potato', 'onion', 'carrot', 'soy-sauce', 'mirin', 'sugar', 'rice'),
      equipment: eq('gas-stove', 'frying-pan', 'air-fryer', 'oven', 'pressure-cooker', 'tatung-rice-cooker'),
    }),
    callsAi: true,
    expectation: '新挑戰用到還沒用過的廚具（氣炸鍋、烤箱、壓力鍋），難度只比其他高 1～2。',
    assert: (ideas) => {
      const adventure = ideas.find((i) => i.slot === 'adventure');
      const others = ideas.filter((i) => i.slot !== 'adventure');
      if (!adventure) return ['沒有新挑戰'];
      const max = Math.max(0, ...others.map((i) => i.difficulty.overall));
      return adventure.difficulty.overall - max > 2 ? [`新挑戰難度 ${adventure.difficulty.overall}，比其他最高的 ${max} 高超過 2`] : [];
    },
  },
  {
    id: '08-no-beef-no-cooking-wine',
    name: '不吃牛、不用料理酒；有牛肉',
    ctx: ctx({
      taste: { dims: likes('cuisine.taiwan.home', 'cuisine.japan.washoku', 'seasoning.soy_sauce', 'form.stir_fry'), context: FREQ },
      dietary: { allergen_ids: [], restriction_ids: ['no-beef'], dislike_ingredient_ids: [], no_cooking_alcohol: true },
      pantry: pantry('beef-slices', 'pork-slices', 'rice-wine', 'mirin', 'onion', 'ginger', 'soy-sauce', 'rice'),
      equipment: eq('gas-stove', 'frying-pan'),
    }),
    callsAi: true,
    expectation: '沒有牛肉，也沒有米酒、料理酒、味醂、清酒。',
    assert: (ideas) => [...usesId(ideas, ['beef-slices', 'rice-wine', 'mirin']), ...mentions(ideas, ['牛', '米酒', '料理酒', '紹興', '味醂', '清酒'])],
  },
  {
    id: '09-empty-pantry',
    name: '廚房沒記任何食材，口味資料足夠',
    ctx: ctx({
      taste: { dims: likes('cuisine.taiwan.home', 'cuisine.japan.washoku', 'form.stir_fry', 'protein.egg', 'protein.tofu_soy'), context: FREQ },
      equipment: eq('gas-stove', 'frying-pan'),
    }),
    callsAi: true,
    expectation: '照口味給點子，不提「缺什麼」「沒有什麼」。',
    assert: (ideas) => ideas.flatMap((i) => (/缺|沒有|不夠|少了|先去買/.test(`${i.why}`) ? [`${i.title}：理由提到缺東西`] : [])),
  },
  {
    id: '10-expired-pork',
    name: '有過期的豬絞肉',
    ctx: ctx({
      taste: { dims: SAMPLE_TASTE_TW, context: FREQ },
      pantry: [
        { ingredient_id: 'ground-pork', want_to_use_soon: false, expires_at: '2026-11-15' },
        ...pantry('egg', 'tofu', 'scallion', 'soy-sauce', 'rice'),
      ],
      equipment: eq('gas-stove', 'wok', 'frying-pan'),
    }),
    callsAi: true,
    expectation: '不用那包絞肉，也完全不提醒它過期。',
    assert: (ideas) => [...usesId(ideas, ['ground-pork']), ...mentions(ideas, ['過期', '壞掉', '絞肉'])],
  },
];
