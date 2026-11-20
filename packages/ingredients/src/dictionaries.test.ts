// 字典資料的一致性檢查。資料庫匯入時也會再檢查一次參照。
import { describe, expect, it } from 'vitest';
import {
  FLAVOR_TAGS, INGREDIENT_CATEGORIES, INGREDIENT_TRAITS, STORAGE_ZONES,
  allergenWithAncestors, allergens, dietaryRestrictions, ingredients,
} from './index.ts';

const DICT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const all = { allergens, ingredients, dietaryRestrictions };

describe.each(Object.entries(all))('%s', (_name, items) => {
  it('ID 是英文小寫加連字號，而且不重複', () => {
    for (const item of items) expect(item.id).toMatch(DICT_ID);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('都有繁中名稱', () => {
    for (const item of items) expect(item.name['zh-TW'].trim()).not.toBe('');
  });

  it('淘汰的項目指向存在的替代', () => {
    const ids = new Set(items.map((i) => i.id));
    for (const item of items) if (item.replacedBy) expect(ids).toContain(item.replacedBy);
  });
});

describe('食材', () => {
  const allergenIds = new Set(allergens.map((a) => a.id));

  it('列舉值都在清單裡', () => {
    for (const i of ingredients) {
      expect(INGREDIENT_CATEGORIES).toContain(i.category);
      expect(STORAGE_ZONES).toContain(i.defaultStorage);
      for (const t of i.traits) expect(INGREDIENT_TRAITS).toContain(t);
      for (const f of i.flavorTags ?? []) expect(FLAVOR_TAGS).toContain(f);
    }
  });

  it('過敏原都存在', () => {
    for (const i of ingredients) for (const a of i.allergenIds ?? []) expect(allergenIds).toContain(a);
  });

  it('飲食特性彼此一致（例：豬肉一定也是肉、也是動物來源）', () => {
    for (const i of ingredients) {
      const t = new Set(i.traits);
      const label = `${i.id}: ${i.traits.join(',')}`;
      if (['pork', 'beef', 'lamb', 'poultry'].some((x) => t.has(x as never))) expect(t.has('meat'), label).toBe(true);
      if (t.has('shellfish')) expect(t.has('seafood'), label).toBe(true);
      if (['meat', 'seafood', 'egg', 'dairy', 'honey'].some((x) => t.has(x as never))) expect(t.has('animal'), label).toBe(true);
    }
  });

  it('只有生鮮才有「最近買的」天數', () => {
    for (const i of ingredients) if (!i.isPerishable) expect(i.recentDays, i.id).toBeUndefined();
  });

  it('當季月份在 1–12', () => {
    for (const i of ingredients)
      for (const months of Object.values(i.seasonMonths ?? {}))
        for (const m of months ?? []) expect(m >= 1 && m <= 12, i.id).toBe(true);
  });
});

describe('過敏原', () => {
  it('上層存在，而且沒有循環', () => {
    const ids = new Set(allergens.map((a) => a.id));
    for (const a of allergens) {
      if (a.parentId) expect(ids).toContain(a.parentId);
      expect(allergenWithAncestors(a.id).length).toBeLessThan(allergens.length);
    }
  });

  it('往上找得到上層：蝦 → 甲殼類', () => {
    expect(allergenWithAncestors('shrimp')).toEqual(['shrimp', 'crustacean']);
  });
});

describe('飲食限制', () => {
  it('排除的特性與食材都存在', () => {
    const ingredientIds = new Set(ingredients.map((i) => i.id));
    for (const r of dietaryRestrictions) {
      for (const t of r.excludesTraits) expect(INGREDIENT_TRAITS).toContain(t);
      for (const id of r.excludesIngredientIds ?? []) expect(ingredientIds).toContain(id);
    }
  });
});
