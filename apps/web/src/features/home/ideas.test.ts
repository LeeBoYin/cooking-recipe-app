import { describe, expect, it } from 'vitest';
import { emptyProfile } from '@zhusha/core';
import { baseDishes } from '@zhusha/taste';
import { EMPTY_DIETARY } from '../../data/dietary.ts';
import { buildInput, buildPool, limitsFrom, ownRecipeFrom, type IdeaSources } from './ideas.ts';
import { ideaSet } from '@zhusha/core';
import type { Recipe } from '../../data/recipes.ts';

function enough() {
  const p = emptyProfile();
  for (const k of ['cuisine.taiwan', 'cuisine.taiwan.home', 'protein.pork', 'protein.egg']) {
    p.dims[k] = { affinity: 0.9, confidence: 0.9, source: 'explored', updatedAt: '2026-01-01T00:00:00Z' };
  }
  return p;
}
const sources = (over: Partial<IdeaSources> = {}): IdeaSources => ({
  profile: enough(), dietary: EMPTY_DIETARY, pantry: [], equipment: [], recipes: [], region: 'TW', timezone: 'Asia/Taipei',
  now: new Date('2026-06-15T04:00:00Z'), ...over,
});
const recipe = (over: Partial<Recipe> = {}): Recipe =>
  ({
    id: 'r1', title: '滷肉', status: 'published', deleted_at: null, ingredient_ids: ['pork-belly'], ingredients: [],
    highlights: ['family_favorite'], cooked_dates: [], cooked_at: '2025-01-01T00:00:00Z', published_at: '2025-01-02T00:00:00Z',
    difficulty: null, ...over,
  }) as unknown as Recipe;

describe('首頁點子的資料組裝', () => {
  it('用真的字典算得出基礎菜色，而且一天內固定', () => {
    const pool = buildPool(sources());
    expect(pool.tasteEnough).toBe(true);
    expect(pool.ideas.some((i) => i.source === 'dish')).toBe(true);
    const a = ideaSet(pool, 'u|2026-06-15', 0).map((i) => i.key);
    expect(ideaSet(buildPool(sources()), 'u|2026-06-15', 0).map((i) => i.key)).toEqual(a);
  });
  it('廚房沒記任何廚具時不檢查；有廚具但做不到時排除', () => {
    const withNone = buildPool(sources({ equipment: [] })).ideas.filter((i) => i.source === 'dish').length;
    const onlyKettle = buildPool(sources({ equipment: [{ equipmentTypeId: 'kettle' }] })).ideas.filter((i) => i.source === 'dish').length;
    expect(withNone).toBeGreaterThan(0);
    expect(onlyKettle).toBeLessThan(withNone);
  });
  it('過敏原與不用料理酒排除基礎菜色', () => {
    const noWine = limitsFrom({ ...EMPTY_DIETARY, noCookingAlcohol: true });
    expect(noWine.noCookingAlcohol).toBe(true);
    const input = buildInput(sources({ dietary: { ...EMPTY_DIETARY, allergenIds: ['egg'] } }));
    const eggDishes = baseDishes.filter((d) => d.ingredientIds.includes('egg')).map((d) => `dish:${d.id}`);
    const keys = buildPool(sources({ dietary: { ...EMPTY_DIETARY, allergenIds: ['egg'] } })).ideas.map((i) => i.key);
    expect(input.limits.allergenIds).toEqual(['egg']);
    expect(eggDishes.length).toBeGreaterThan(0);
    for (const k of eggDishes) expect(keys).not.toContain(k);
  });
  it('飲食原則：蛋奶素的人沒有肉的菜', () => {
    const veg = buildPool(sources({ dietary: { ...EMPTY_DIETARY, restrictionIds: ['vegetarian'] } })).ideas;
    const meatDishes = baseDishes.filter((d) => d.ingredientIds.some((i) => ['pork-belly', 'ground-pork', 'chicken-thigh', 'beef-slices', 'shrimp'].includes(i))).map((d) => `dish:${d.id}`);
    for (const k of meatDishes) expect(veg.map((i) => i.key)).not.toContain(k);
  });
  it('自己的食譜：只收已發佈、有菜名、沒刪除的', () => {
    expect(ownRecipeFrom(recipe())?.title).toBe('滷肉');
    expect(ownRecipeFrom(recipe({ status: 'draft' }))).toBeNull();
    expect(ownRecipeFrom(recipe({ title: null }))).toBeNull();
    expect(ownRecipeFrom(recipe({ deleted_at: '2026-01-01T00:00:00Z' }))).toBeNull();
  });
  it('又做了一次的日期優先當「最後做的時間」', () => {
    expect(ownRecipeFrom(recipe({ cooked_dates: ['2026-05-01', '2026-06-01'] }))?.lastCookedAt).toBe('2026-06-01');
  });
});
