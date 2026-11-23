import { describe, expect, it } from 'vitest';
import { buildIngredientIndex, isPlainSafeIngredient, matchIngredient, matchIngredientExact } from './ingredient-line.ts';

const dict = [
  { id: 'garlic', name: { 'zh-TW': '大蒜' }, aliases: { 'zh-TW': ['蒜頭', '蒜泥'] } },
  { id: 'chicken-broth', name: { 'zh-TW': '雞高湯' }, aliases: { 'zh-TW': ['高湯'] } },
  { id: 'dashi-stock', name: { 'zh-TW': '柴魚高湯' }, aliases: { 'zh-TW': ['日式高湯'] } },
] as unknown as Parameters<typeof buildIngredientIndex>[0];
const index = buildIngredientIndex(dict);

describe('matchIngredientExact（安全用途）', () => {
  it('名稱與別名完全相同才對得到', () => {
    expect(matchIngredientExact('大蒜', index)).toBe('garlic');
    expect(matchIngredientExact('蒜泥', index)).toBe('garlic');
    expect(matchIngredientExact('柴魚高湯', index)).toBe('dashi-stock');
    expect(matchIngredientExact(' 高湯 ', index)).toBe('chicken-broth');
  });
  it('不用「包含」：沒收的說法對不到，不會被對成別的食材', () => {
    expect(matchIngredientExact('自製雞高湯', index)).toBeUndefined();
    expect(matchIngredientExact('神祕調味粉', index)).toBeUndefined();
    expect(matchIngredientExact('', index)).toBeUndefined();
  });
  it('一般比對（非安全用途）仍可用包含', () => {
    expect(matchIngredient('自製雞高湯', index)).toBe('chicken-broth');
  });
});

describe('isPlainSafeIngredient', () => {
  it('水與冰塊一類算基本項', () => {
    for (const n of ['水', '清水', '冰塊', '熱水']) expect(isPlainSafeIngredient(n)).toBe(true);
  });
  it('其他不算', () => {
    for (const n of ['水梨', '水餃', '高湯', '']) expect(isPlainSafeIngredient(n)).toBe(false);
  });
});
