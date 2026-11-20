import { describe, expect, it } from 'vitest';
import { commonIngredientIdsFor, getIngredient, regionProfiles, isRecentlyBought, rankFrequent, searchIngredients } from './index.ts';

describe('地區常見食材', () => {
  it('每個 ID 都在字典裡', () => {
    for (const { commonPantryIngredientIds: ids } of regionProfiles) {
      for (const id of ids) expect(getIngredient(id), id).toBeDefined();
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('每個月份剛好屬於一個季節', () => {
    for (const r of regionProfiles) {
      const months = r.seasons.flatMap((s) => s.months).sort((a, b) => a - b);
      expect(months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
  });
  it('沒有設定的地區用台灣的', () => {
    expect(commonIngredientIdsFor('XX')).toEqual(commonIngredientIdsFor('TW'));
  });
});

describe('searchIngredients', () => {
  it('用名稱與別名找，完全相同的排最前面', () => {
    expect(searchIngredients('醬油')[0]?.id).toBe('soy-sauce');
    expect(searchIngredients('生抽')[0]?.id).toBe('soy-sauce');
  });
  it('空字串回傳空', () => {
    expect(searchIngredients('  ')).toEqual([]);
  });
  it('找不到回傳空', () => {
    expect(searchIngredients('不存在的東西')).toEqual([]);
  });
});

describe('isRecentlyBought', () => {
  it('生鮮在天數內才算（蔥 5 天）', () => {
    expect(isRecentlyBought('scallion', '2026-11-16', '2026-11-20')).toBe(true);
    expect(isRecentlyBought('scallion', '2026-11-15', '2026-11-20')).toBe(false);
  });
  it('非生鮮與沒對應字典的不算', () => {
    expect(isRecentlyBought('soy-sauce', '2026-11-20', '2026-11-20')).toBe(false);
    expect(isRecentlyBought(null, '2026-11-20', '2026-11-20')).toBe(false);
  });
});

describe('rankFrequent', () => {
  it('次數多的在前，再用地區常見食材補', () => {
    const out = rankFrequent(['egg', 'tofu', 'egg', null, 'unknown-id'], ['soy-sauce', 'egg', 'tofu', 'salt']);
    expect(out).toEqual(['egg', 'tofu', 'soy-sauce', 'salt']);
  });
  it('沒有紀錄時就是地區清單', () => {
    expect(rankFrequent([], ['salt', 'sugar'])).toEqual(['salt', 'sugar']);
  });
});
