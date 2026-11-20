import { describe, expect, it } from 'vitest';
import { emptyProfile, type TasteProfile } from '../taste/types.ts';
import { hasNextIdeaSet, ideaSet, todayInTimeZone } from './pick.ts';
import { buildIdeaPool, confidentLikeCount, longAgoValue } from './score.ts';
import type { Idea, IdeaBaseDish, IdeaIngredient, IdeaInput, IdeaLimits, IdeaOwnRecipe } from './types.ts';

const ing = (id: string, over: Partial<IdeaIngredient> = {}): IdeaIngredient => ({
  id, category: 'vegetable', traits: [], allergenIds: [], ...over,
});
const ingredients = new Map<string, IdeaIngredient>(
  [
    ing('tofu', { category: 'tofu-bean', allergenIds: ['soy'] }),
    ing('pork', { category: 'meat', traits: ['animal', 'meat', 'pork'] }),
    ing('shrimp', { category: 'seafood', traits: ['animal', 'seafood', 'shellfish'], allergenIds: ['shrimp', 'crustacean'] }),
    ing('rice-wine', { category: 'seasoning', traits: ['alcohol'] }),
    ing('tomato', { seasonMonths: { TW: [5, 6, 7] } }),
    ing('egg', { category: 'egg', traits: ['animal', 'egg'], allergenIds: ['egg'] }),
    ing('cilantro'),
    ing('soy-sauce', { category: 'sauce' }),
  ].map((i) => [i.id, i]),
);
const noLimits: IdeaLimits = { allergenIds: [], excludedTraits: [], excludedIngredientIds: [], dislikeIngredientIds: [], noCookingAlcohol: false };
const dimensionKeys = new Set(['cuisine.taiwan', 'cuisine.taiwan.home', 'protein.pork', 'protein.tofu_soy', 'form.stir_fry', 'protein.egg']);

function profileWith(keys: string[], affinity = 0.8, confidence = 0.8): TasteProfile {
  const p = emptyProfile();
  for (const k of keys) p.dims[k] = { affinity, confidence, source: 'explored', updatedAt: '2026-01-01T00:00:00Z' };
  return p;
}
const dish = (id: string, ingredientIds: string[], over: Partial<IdeaBaseDish> = {}): IdeaBaseDish => ({
  id, name: id, regions: ['TW'], cuisineKeys: ['cuisine.taiwan.home'], ingredientIds, techniques: ['stir-fry'], ...over,
});
const own = (id: string, over: Partial<IdeaOwnRecipe> = {}): IdeaOwnRecipe => ({
  id, title: id, ingredientIds: ['tofu'], declaredAllergenIds: [], declaredTraits: [], highlights: ['make_again'],
  lastCookedAt: '2025-06-01T00:00:00Z', ...over,
});
const base = (over: Partial<IdeaInput> = {}): IdeaInput => ({
  profile: profileWith(['cuisine.taiwan', 'cuisine.taiwan.home', 'protein.pork']),
  limits: noLimits,
  pantry: [],
  canDoTechnique: () => true,
  ingredients,
  baseDishes: [],
  ownRecipes: [],
  context: { region: 'TW', month: 6, today: '2026-06-15', now: '2026-06-15T04:00:00Z' },
  ...over,
});

describe('口味夠不夠', () => {
  it('把握程度 ≥ 0.5 的喜好維度要有 3 個', () => {
    expect(confidentLikeCount(profileWith(['a', 'b']))).toBe(2);
    expect(buildIdeaPool(base({ profile: profileWith(['a', 'b']), baseDishes: [dish('d', ['tofu'])] }), dimensionKeys).tasteEnough).toBe(false);
    expect(confidentLikeCount(profileWith(['a', 'b', 'c'], 0.8, 0.4))).toBe(0);
  });
  it('不夠時不給基礎菜色，但自己的食譜照給', () => {
    const pool = buildIdeaPool(base({ profile: profileWith([]), baseDishes: [dish('d', ['tofu'])], ownRecipes: [own('r')] }), dimensionKeys);
    expect(pool.ideas.map((i) => i.key)).toEqual(['own:r']);
  });
});

describe('先排除', () => {
  const pool = (limits: Partial<IdeaLimits>, input: Partial<IdeaInput> = {}) =>
    buildIdeaPool(base({ limits: { ...noLimits, ...limits }, ...input }), dimensionKeys).ideas.map((i) => i.key);
  const dishes = [dish('shrimp-dish', ['shrimp']), dish('wine-dish', ['pork', 'rice-wine']), dish('plain', ['tofu']), dish('herb', ['cilantro'])];
  const recipes = [own('r-shrimp', { ingredientIds: ['shrimp'] }), own('r-declared', { declaredAllergenIds: ['peanut'] }), own('r-ok')];

  it('過敏原（含上層）排除，自己的食譜也是；食譜自己宣告的過敏原也算', () => {
    const keys = pool({ allergenIds: ['crustacean', 'peanut'] }, { baseDishes: dishes, ownRecipes: recipes });
    expect(keys).not.toContain('dish:shrimp-dish');
    expect(keys).not.toContain('own:r-shrimp');
    expect(keys).not.toContain('own:r-declared');
    expect(keys).toContain('dish:plain');
    expect(keys).toContain('own:r-ok');
  });
  it('飲食原則排除的特性', () => {
    expect(pool({ excludedTraits: ['pork'] }, { baseDishes: dishes })).not.toContain('dish:wine-dish');
  });
  it('不用料理酒', () => {
    expect(pool({ noCookingAlcohol: true }, { baseDishes: dishes })).not.toContain('dish:wine-dish');
    expect(pool({}, { baseDishes: dishes })).toContain('dish:wine-dish');
  });
  it('不吃的食物', () => {
    expect(pool({ dislikeIngredientIds: ['cilantro'] }, { baseDishes: dishes })).not.toContain('dish:herb');
  });
  it('地區不符的基礎菜色排除，空的各地都適合', () => {
    const keys = pool({}, { baseDishes: [dish('jp', ['tofu'], { regions: ['JP'] }), dish('any', ['tofu'], { regions: [] })] });
    expect(keys).toEqual(['dish:any']);
  });
  it('做不到的手法排除基礎菜色，自己的食譜不檢查；沒記廚具（null）不檢查', () => {
    const input = { baseDishes: [dish('d', ['tofu'])], ownRecipes: [own('r')] };
    expect(pool({}, { ...input, canDoTechnique: () => false })).toEqual(['own:r']);
    expect(pool({}, { ...input, canDoTechnique: () => null })).toContain('dish:d');
  });
});

describe('分數與門檻', () => {
  it('基礎菜色：口味 0.45＋覆蓋 0.30＋手邊 0.15＋季節 0.10', () => {
    // 口味：cuisine.taiwan 0.9、cuisine.taiwan.home 0.9（affinity 0.8）→ 1 ；沒廚房食材：覆蓋 0.5、手邊 0、季節 tomato 在季 1
    const idea = buildIdeaPool(base({ baseDishes: [dish('d', ['tomato'])] }), dimensionKeys).ideas[0] as Idea;
    expect(idea.score).toBeCloseTo(0.45 * 0.9 + 0.3 * 0.5 + 0 + 0.1 * 1, 5);
  });
  it('分數低於 0.5 不列入', () => {
    const profile = profileWith(['cuisine.taiwan', 'cuisine.taiwan.home', 'x'], -0.9, 0.9);
    expect(buildIdeaPool(base({ profile, baseDishes: [dish('d', ['tofu'])] }), dimensionKeys).ideas).toEqual([]);
  });
  it('食材覆蓋只看主要食材（醬料不算），過期的不算有', () => {
    const pantry = [
      { ingredientId: 'tofu', wantToUseSoon: false },
      { ingredientId: 'pork', wantToUseSoon: false, expiresOn: '2026-06-10' },
    ];
    const idea = buildIdeaPool(base({ pantry, baseDishes: [dish('d', ['tofu', 'pork', 'soy-sauce'])] }), dimensionKeys).ideas[0] as Idea;
    expect(idea.mainIngredientIds).toEqual(['tofu', 'pork']);
    expect(idea.allInKitchen).toBe(false);
    const all = buildIdeaPool(base({ pantry: [{ ingredientId: 'tofu', wantToUseSoon: false }], baseDishes: [dish('d', ['tofu', 'soy-sauce'])] }), dimensionKeys).ideas[0] as Idea;
    expect(all.allInKitchen).toBe(true);
  });
  it('自己的食譜：標籤 0.5＋久沒做 0.3＋覆蓋 0.2', () => {
    const idea = buildIdeaPool(base({ ownRecipes: [own('r')] }), dimensionKeys).ideas[0] as Idea;
    expect(idea.score).toBeCloseTo(0.5 + 0.3 + 0.2 * 0.5, 5);
    expect(idea.reason).toEqual({ code: 'tag_make_again' });
  });
  it('沒標籤、剛做過的食譜不到門檻', () => {
    const recent = own('r', { highlights: [], lastCookedAt: '2026-06-10T00:00:00Z' });
    expect(buildIdeaPool(base({ ownRecipes: [recent] }), dimensionKeys).ideas).toEqual([]);
  });
  it('久沒做：30 天內 0、180 天以上 1、中間線性', () => {
    const now = '2026-06-15T00:00:00Z';
    expect(longAgoValue('2026-06-01T00:00:00Z', now)).toBe(0);
    expect(longAgoValue('2025-01-01T00:00:00Z', now)).toBe(1);
    expect(longAgoValue('2026-03-17T00:00:00Z', now)).toBeCloseTo((90 - 30) / 150, 2);
  });
  it('理由：家人最愛優先於值得再做；手邊想先用掉的食材可以成為理由', () => {
    const fav = buildIdeaPool(base({ ownRecipes: [own('r', { highlights: ['make_again', 'family_favorite'] })] }), dimensionKeys).ideas[0] as Idea;
    expect(fav.reason).toEqual({ code: 'tag_family_favorite' });
    const pantry = [{ ingredientId: 'tofu', wantToUseSoon: true }, { ingredientId: 'tomato', wantToUseSoon: true }];
    const profile = profileWith(['a', 'b', 'c']);
    const d = buildIdeaPool(base({ profile, pantry, baseDishes: [dish('d', ['tofu', 'tomato', 'pork', 'egg', 'shrimp', 'cilantro'], { cuisineKeys: [] })] }), dimensionKeys).ideas[0] as Idea;
    expect(d.reason.code).toBe('pantry_priority');
  });
});

describe('抽選與換一組', () => {
  const many = Array.from({ length: 12 }, (_, i) => dish(`d${i}`, ['tofu']));
  const recipes = Array.from({ length: 4 }, (_, i) => own(`r${i}`));
  const pool = buildIdeaPool(base({ baseDishes: many, ownRecipes: recipes }), dimensionKeys);

  it('同一個種子、同一組一定一樣；不同天通常不同', () => {
    const a = ideaSet(pool, 'u1|2026-06-15', 0).map((i) => i.key);
    expect(ideaSet(pool, 'u1|2026-06-15', 0).map((i) => i.key)).toEqual(a);
    const days = new Set(Array.from({ length: 10 }, (_, d) => ideaSet(pool, `u1|2026-06-${10 + d}`, 0).map((i) => i.key).join()));
    expect(days.size).toBeGreaterThan(1);
  });
  it('數量規則：最多 5 個，自己的食譜 ≤ 2、基礎菜色 ≤ 3', () => {
    for (let r = 0; r < 4; r += 1) {
      const set = ideaSet(pool, 'u1|2026-06-15', r);
      expect(set.length).toBeLessThanOrEqual(5);
      expect(set.filter((i) => i.source === 'own').length).toBeLessThanOrEqual(2);
      expect(set.filter((i) => i.source === 'dish').length).toBeLessThanOrEqual(3);
    }
  });
  it('換一組不會重複，換到沒有就沒有下一組', () => {
    const seen = new Set<string>();
    let round = 0;
    while (ideaSet(pool, 'u1|2026-06-15', round).length > 0) {
      for (const i of ideaSet(pool, 'u1|2026-06-15', round)) {
        expect(seen.has(i.key)).toBe(false);
        seen.add(i.key);
      }
      expect(hasNextIdeaSet(pool, 'u1|2026-06-15', round)).toBe(ideaSet(pool, 'u1|2026-06-15', round + 1).length > 0);
      round += 1;
      expect(round).toBeLessThan(30);
    }
    expect(seen.size).toBe(pool.ideas.length);
  });
  it('不夠就少給，不湊數', () => {
    const small = buildIdeaPool(base({ ownRecipes: [own('only')] }), dimensionKeys);
    expect(ideaSet(small, 'k', 0)).toHaveLength(1);
    expect(hasNextIdeaSet(small, 'k', 0)).toBe(false);
  });
});

describe('廚房時區的今天', () => {
  it('跨日以廚房時區為準', () => {
    const t = new Date('2026-06-15T18:30:00Z');
    expect(todayInTimeZone(t, 'Asia/Taipei')).toBe('2026-06-16');
    expect(todayInTimeZone(t, 'America/Los_Angeles')).toBe('2026-06-15');
  });
});
