// 展開做法的評估集：5 組假想的使用者與點子（M1a-09）。同一份資料兩種用途：
// 1. 自動測試（expand.test.ts）：用假的 AI 回應，測「檢查擋得下違規的做法」與整條流程，進 CI。
// 2. 手動實跑（run.ts）：真的呼叫 Claude，看步驟合不合理、口吻對不對；不進 CI（要花錢，也需要人打分）。
// 全部是假的資料，沒有任何真實使用者的內容。
import type { AiIdea, RecipeDraft } from '../../../../../packages/core/src/index.ts';
import { ctx, eq, FREQ, likes, NOW, pantry } from '../../home/eval/cases.ts';
import type { HomeEnv } from '../../home/env.ts';
import type { HomeContextRow } from '../../home/types.ts';
import type { ExpandRow } from '../types.ts';

export { NOW };

export interface ExpandCase {
  id: string;
  name: string;
  ctx: HomeContextRow;
  row: ExpandRow;
  // 說給人看的期待（人工打分時對照）
  expectation: string;
  // 自動判斷（程式能判斷的部分）：回傳沒過的項目；空陣列是全過
  assert(draft: RecipeDraft, env: HomeEnv): string[];
}

const DIFF = { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 1, overall: 3 };
const ID = (n: number) => `0192f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export function aiIdea(over: Partial<AiIdea>): AiIdea {
  return {
    id: ID(1), slot: 'twist', title: '測試小炒', why: '手邊的食材剛好。', candidateRef: null, usesPantryIds: [], usesPriorityIds: [],
    otherIngredients: [], difficulty: DIFF, techniques: [], equipment: [], substitutions: [], ...over,
  };
}

export function rowOf(over: Partial<ExpandRow>): ExpandRow {
  return { household_size: 2, idea: null, snapshot: null, ingredient_ids: [], draft: null, cache_id: ID(2), idea_id: ID(1), bookmark_id: null, ...over };
}

const allText = (d: RecipeDraft) => [...d.ingredients.map((i) => i.name), ...d.steps.map((s) => s.text), d.tips ?? ''].join(' ');
const mentions = (d: RecipeDraft, terms: string[]) => terms.filter((t) => allText(d).includes(t)).map((t) => `提到「${t}」`);

export const EXPAND_CASES: ExpandCase[] = [
  {
    id: '01-dish-skeleton',
    name: '收藏的家常菜（麻婆豆腐），只有骨架：主要食材、手法、廚具',
    ctx: ctx({
      taste: { dims: likes('cuisine.taiwan', 'taste.spicy'), context: FREQ },
      pantry: pantry('tofu', 'ground-pork', 'garlic', 'scallion', 'soy-sauce', 'chili-pepper'),
      equipment: eq('gas-stove', 'wok'),
    }),
    row: rowOf({
      snapshot: { title: '麻婆豆腐', why: '豆腐和絞肉都在。', baseDishId: 'mapo-tofu' },
      ingredient_ids: ['tofu', 'ground-pork', 'chili-pepper', 'garlic', 'scallion'],
      idea_id: null, cache_id: null, bookmark_id: ID(3),
    }),
    expectation: '照麻婆豆腐的做法寫：豆腐、絞肉、辣、蒜與蔥；步驟 5 到 8 步；用炒鍋；份量是 2 人份。',
    assert: (d) => [
      ...(d.ingredients.length < 4 ? ['食材太少'] : []),
      ...(d.steps.length < 3 ? ['步驟太少'] : []),
      ...(d.servings !== 2 ? ['份量不是 2 人份'] : []),
      ...d.steps.flatMap((s) => (s.equipmentTypeIds ?? []).filter((e) => !['wok', 'gas-stove'].includes(e)).map((e) => `用了沒有的廚具 ${e}`)),
    ],
  },
  {
    id: '02-ai-new-idea',
    name: 'AI 想的變化版（高麗菜蛋餅卷），用了手邊的食材',
    ctx: ctx({
      taste: { dims: likes('cuisine.taiwan', 'cuisine.taiwan.home', 'protein.egg'), context: FREQ },
      pantry: pantry('cabbage', 'egg', 'scallion', 'salt', 'flour'),
      equipment: eq('gas-stove', 'frying-pan'),
    }),
    row: rowOf({
      idea: aiIdea({
        title: '高麗菜蛋餅卷', why: '高麗菜和雞蛋剛好，捲起來就是一餐。', usesPantryIds: ['cabbage', 'egg', 'scallion', 'flour'],
        techniques: ['pan-fry'], equipment: ['frying-pan'],
      }),
    }),
    expectation: '食材大多取自手邊；步驟順；用平底鍋煎；小提醒（如果有）是失敗關鍵。',
    assert: (d) => [
      ...(d.steps.length < 3 ? ['步驟太少'] : []),
      ...d.steps.flatMap((s) => (s.techniques ?? []).filter((t) => !['pan-fry', 'stir-fry', 'boil'].includes(t)).map((t) => `手法 ${t} 不在預期內`)),
    ],
  },
  {
    id: '03-shrimp-peanut-allergy',
    name: '對蝦、花生過敏；點子是泰式雞肉',
    ctx: ctx({
      taste: { dims: likes('cuisine.southeast_asia', 'cuisine.southeast_asia.thai', 'taste.spicy'), context: FREQ },
      dietary: { allergen_ids: ['shrimp', 'peanut'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false },
      pantry: pantry('chicken-thigh', 'thai-basil', 'fish-sauce', 'chili-pepper', 'garlic', 'rice'),
      equipment: eq('gas-stove', 'wok'),
    }),
    row: rowOf({
      idea: aiIdea({
        title: '打拋雞', why: '雞腿肉和九層塔，配飯剛好。', usesPantryIds: ['chicken-thigh', 'thai-basil', 'fish-sauce', 'chili-pepper', 'garlic'],
        techniques: ['stir-fry'], equipment: ['wok'],
      }),
    }),
    expectation: '沒有蝦、花生（含蝦醬、花生粉、花生油）；食材名稱都對得到字典；雞肉要煮熟（小提醒由程式附上）。',
    assert: (d) => [
      ...mentions(d, ['蝦', '花生']),
      ...d.ingredients.filter((i) => i.ingredientId === null).map((i) => `${i.name} 對不到字典`),
      ...(d.tips?.includes('{{temp:') ? [] : ['沒有附上雞肉的中心溫度提醒']),
    ],
  },
  {
    id: '04-sous-vide',
    name: '有舒肥棒；點子是舒肥雞胸（安全表是空的，程式要擋下舒肥）',
    ctx: ctx({
      taste: { dims: likes('cuisine.taiwan', 'protein.poultry'), context: FREQ },
      pantry: pantry('chicken-breast', 'salt', 'black-pepper'),
      equipment: eq('gas-stove', 'frying-pan', 'sous-vide-circulator'),
    }),
    row: rowOf({
      idea: aiIdea({
        title: '香煎雞胸', why: '雞胸肉配黑胡椒，簡單就好吃。', usesPantryIds: ['chicken-breast', 'salt', 'black-pepper'],
        techniques: ['pan-fry'], equipment: ['frying-pan'],
      }),
    }),
    expectation: '用煎的把雞胸煮熟，不寫舒肥；小提醒由程式附上雞肉的中心溫度。',
    assert: (d) => [
      ...d.steps.filter((s) => (s.techniques ?? []).includes('sous-vide') || /舒肥|低溫慢煮/.test(s.text)).map(() => '寫了舒肥'),
      ...(d.tips?.includes('{{temp:') ? [] : ['沒有附上雞肉的中心溫度提醒']),
    ],
  },
  {
    id: '05-rice-cooker-only',
    name: '廚具很少：只有電鍋；點子是電鍋蒸蛋',
    ctx: ctx({
      frequency: 'occasional',
      taste: { dims: likes('cuisine.taiwan', 'form.steamed', 'protein.egg'), context: { ...FREQ, cooking_frequency: 'occasional' } },
      pantry: pantry('egg', 'scallion', 'soy-sauce', 'salt'),
      equipment: eq('tatung-rice-cooker'),
    }),
    row: rowOf({
      idea: aiIdea({
        title: '電鍋蒸蛋', why: '雞蛋和蔥，電鍋就能做。', usesPantryIds: ['egg', 'scallion', 'soy-sauce', 'salt'],
        techniques: ['steam'], equipment: ['tatung-rice-cooker'],
      }),
    }),
    expectation: '全部用電鍋做完；步驟少、語氣輕鬆；不用爐子、烤箱、平底鍋。',
    assert: (d) => [
      ...d.steps.flatMap((s) => (s.equipmentTypeIds ?? []).filter((e) => e !== 'tatung-rice-cooker').map((e) => `用了沒有的廚具 ${e}`)),
      ...d.steps.flatMap((s) => (s.techniques ?? []).filter((t) => !['steam', 'boil', 'toss'].includes(t)).map((t) => `電鍋做不到的手法 ${t}`)),
      ...(d.steps.length > 8 ? ['步驟太多'] : []),
    ],
  },
];
