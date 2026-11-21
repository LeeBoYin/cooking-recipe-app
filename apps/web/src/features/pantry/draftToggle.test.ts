import { describe, expect, it } from 'vitest';
import { toggleIngredientDraft } from './draftToggle.ts';

type D = { id: string; ingredient_id: string | null; note?: string };

describe('toggleIngredientDraft', () => {
  it('還沒選就加一張卡', () => {
    const next = toggleIngredientDraft<D>([], 'egg', () => ({ id: 'a', ingredient_id: 'egg' }));
    expect(next).toEqual([{ id: 'a', ingredient_id: 'egg' }]);
  });
  it('已經選了就移除，填過的內容一起丟掉', () => {
    const before: D[] = [
      { id: 'a', ingredient_id: 'egg', note: '已填' },
      { id: 'b', ingredient_id: 'tofu' },
    ];
    expect(toggleIngredientDraft(before, 'egg', () => ({ id: 'c', ingredient_id: 'egg' }))).toEqual([
      { id: 'b', ingredient_id: 'tofu' },
    ]);
  });
  it('再點一次可以再加回來，且不動自訂名稱的卡', () => {
    const custom: D = { id: 'x', ingredient_id: null };
    const once = toggleIngredientDraft([custom], 'egg', () => ({ id: 'a', ingredient_id: 'egg' }));
    const twice = toggleIngredientDraft(once, 'egg', () => ({ id: 'z', ingredient_id: 'egg' }));
    expect(twice).toEqual([custom]);
    expect(toggleIngredientDraft(twice, 'egg', () => ({ id: 'n', ingredient_id: 'egg' }))).toHaveLength(2);
  });
});
