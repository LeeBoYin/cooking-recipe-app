// 靈感彩蛋的評估集（M1b-04c）：6 組假想的使用者，每組附「程式會挑哪一樣」與自動判斷。
// 兩種用途：自動測試（egg.test.ts，進 CI，用假的 AI 回應）；手動實跑（run.ts，真的呼叫 Claude，要人打分，不進 CI）。
// 全部是假資料。
import { ctx, eq, FREQ, likes, NOW, pantry } from '../../home/eval/cases.ts';
import type { HomeContextRow, HomeIdea } from '../../home/types.ts';
import type { EggFeature } from '../pick.ts';

export { NOW };

export interface EggCase {
  id: string;
  name: string;
  ctx: HomeContextRow;
  // 程式挑的那一樣（固定，評估才有可比性）
  feature: EggFeature;
  expectation: string;
  assert(idea: HomeIdea): string[];
}

const textOf = (i: HomeIdea) => [i.title, i.why, ...i.otherIngredients.map((o) => o.name), ...i.substitutions.flatMap((s) => [s.need, s.use])].join(' ');
const mentions = (idea: HomeIdea, terms: string[]) => terms.filter((t) => textOf(idea).includes(t)).map((t) => `提到「${t}」`);
const TW_TASTE = likes('cuisine.taiwan', 'cuisine.taiwan.home', 'form.stir_fry', 'protein.egg', 'protein.tofu_soy');

export const EGG_CASES: EggCase[] = [
  {
    id: 'e01-doubanjiang',
    name: '醬料：有豆瓣醬、豆腐、絞肉；喜歡川菜',
    ctx: ctx({
      taste: { dims: likes('cuisine.china.sichuan', 'taste.numbing', 'protein.tofu_soy'), context: FREQ },
      pantry: pantry('doubanjiang', 'tofu', 'ground-pork', 'garlic', 'scallion', 'rice'),
      equipment: eq('gas-stove', 'wok'),
    }),
    feature: { kind: 'sauce', id: 'doubanjiang', name: '豆瓣醬' },
    expectation: '一句話像朋友隨口提「你有豆瓣醬…」，一道用豆瓣醬的家常菜；不催促、不提次數。',
    assert: (i) => (i.usesPantryIds.includes('doubanjiang') ? [] : ['沒用到豆瓣醬']),
  },
  {
    id: 'e02-oven',
    name: '廚具：有烤箱與炒鍋；有雞腿、馬鈴薯、洋蔥',
    ctx: ctx({
      taste: { dims: likes('cuisine.western', 'protein.chicken', 'form.grill', 'form.stir_fry', 'taste.umami'), context: FREQ },
      pantry: pantry('chicken-thigh', 'potato', 'onion', 'garlic', 'salt', 'olive-oil'),
      equipment: eq('gas-stove', 'frying-pan', 'oven'),
    }),
    feature: { kind: 'equipment', id: 'oven', name: '烤箱' },
    expectation: '一句話提烤箱，一道要用烤箱的菜（手法是烤或焗），食材用手邊有的；不寫溫度與時間的數字。',
    assert: (i) => [...(i.equipment.includes('oven') ? [] : ['沒用到烤箱']), ...(/\d/.test(i.why) ? ['一句話裡有數字'] : [])],
  },
  {
    id: 'e03-allergen-sauce',
    name: '花生過敏；有花生醬與芝麻醬，被挑中的是芝麻醬',
    ctx: ctx({
      taste: { dims: TW_TASTE, context: FREQ },
      dietary: { allergen_ids: ['peanut'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false },
      pantry: pantry('sesame-paste', 'peanut-butter', 'cucumber', 'noodles', 'soy-sauce'),
      equipment: eq('gas-stove', 'wok'),
    }),
    feature: { kind: 'sauce', id: 'sesame-paste', name: '芝麻醬' },
    expectation: '用芝麻醬；整道菜與那一句話都沒有花生、花生醬、花生粉。',
    assert: (i) => [...mentions(i, ['花生']), ...(i.usesPantryIds.includes('peanut-butter') ? ['用了花生醬'] : [])],
  },
  {
    id: 'e04-vegetarian-oyster-sauce',
    name: '蛋奶素；有味噌、豆腐、高麗菜、雞蛋',
    ctx: ctx({
      taste: { dims: likes('cuisine.japan', 'protein.tofu_soy', 'form.stew_braise', 'protein.egg', 'taste.umami'), context: FREQ },
      dietary: { allergen_ids: [], restriction_ids: ['vegetarian'], dislike_ingredient_ids: [], no_cooking_alcohol: false },
      pantry: pantry('miso', 'tofu', 'cabbage', 'egg', 'rice'),
      equipment: eq('gas-stove', 'saucepan'),
    }),
    feature: { kind: 'sauce', id: 'miso', name: '味噌' },
    expectation: '用味噌做一道蛋奶素的菜；不能有肉、魚（含柴魚高湯）。',
    assert: (i) => [...(i.usesPantryIds.includes('miso') ? [] : ['沒用到味噌']), ...mentions(i, ['肉', '魚', '雞', '豬', '牛', '蝦'])],
  },
  {
    id: 'e05-air-fryer-occasional',
    name: '廚具：偶爾下廚、有氣炸鍋；有雞腿、鹽、醬油',
    ctx: ctx({
      frequency: 'occasional',
      taste: { dims: likes('cuisine.taiwan', 'protein.chicken', 'form.stir_fry', 'protein.egg', 'taste.umami'), context: { ...FREQ, cooking_frequency: 'occasional' } },
      pantry: pantry('chicken-thigh', 'salt', 'soy-sauce', 'garlic'),
      equipment: eq('gas-stove', 'frying-pan', 'air-fryer'),
    }),
    feature: { kind: 'equipment', id: 'air-fryer', name: '氣炸鍋' },
    expectation: '一道簡單、少步驟、失敗率低的氣炸鍋菜；語氣輕鬆；不寫溫度與時間的數字。',
    assert: (i) => [...(i.equipment.includes('air-fryer') ? [] : ['沒用到氣炸鍋']), ...(i.difficulty.overall > 4 ? [`難度 ${i.difficulty.overall} 太高`] : [])],
  },
  {
    id: 'e06-no-alcohol-mirin',
    name: '不用料理酒；有味醂與醬油，被挑中的是照燒醬',
    ctx: ctx({
      taste: { dims: likes('cuisine.japan', 'protein.chicken', 'form.stew_braise', 'protein.egg', 'taste.umami'), context: FREQ },
      dietary: { allergen_ids: [], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: true },
      pantry: pantry('teriyaki-sauce', 'mirin', 'chicken-thigh', 'rice', 'scallion'),
      equipment: eq('gas-stove', 'frying-pan'),
    }),
    feature: { kind: 'sauce', id: 'teriyaki-sauce', name: '照燒醬' },
    expectation: '用照燒醬；不再另外加味醂、米酒、清酒。',
    assert: (i) => [...(i.usesPantryIds.includes('mirin') ? ['用了味醂'] : []), ...mentions(i, ['味醂', '米酒', '清酒', '料理酒'])],
  },
];
