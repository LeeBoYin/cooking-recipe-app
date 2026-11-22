import { describe, expect, it } from 'vitest';
import { mainIngredientTags } from './mainIngredients.ts';

describe('mainIngredientTags', () => {
  it('不超過 3 個就全部顯示', () => {
    expect(mainIngredientTags(['蛋', '番茄'])).toEqual({ shown: ['蛋', '番茄'], more: 0 });
  });
  it('超過 3 個顯示前 3 個，其餘併成 +N', () => {
    expect(mainIngredientTags(['蛋', '番茄', '蔥', '豆腐', '豬肉'])).toEqual({ shown: ['蛋', '番茄', '蔥'], more: 2 });
  });
  it('重複的只算一次、空的沒有標籤', () => {
    expect(mainIngredientTags(['蛋', '蛋'])).toEqual({ shown: ['蛋'], more: 0 });
    expect(mainIngredientTags([])).toEqual({ shown: [], more: 0 });
  });
});
