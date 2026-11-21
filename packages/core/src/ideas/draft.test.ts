import { describe, expect, it } from 'vitest';
import { UNIT_CODES, type UnitLabels } from '../units/units.ts';
import { draftIngredientText, draftStepText } from './draft.ts';

const labels = Object.fromEntries(UNIT_CODES.map((u) => [u, { g: '克', ml: '毫升', tbsp: '大匙', tsp: '小匙', piece: '個', clove: '瓣', pinch: '少許', to_taste: '適量', kg: '公斤' }[u as string] ?? u])) as UnitLabels;
const ing = (over: object) => ({ id: 'i', name: '醬油', ingredientId: 'soy-sauce', optional: false, ...over }) as Parameters<typeof draftIngredientText>[0];
const metric = { system: 'metric', both: false } as const;
const us = { system: 'us', both: false } as const;

describe('draftIngredientText', () => {
  it('公制：名稱加數量與單位', () => {
    expect(draftIngredientText(ing({ amount: 15, unit: 'ml' }), metric, labels)).toBe('醬油 15 毫升');
    expect(draftIngredientText(ing({ name: '蒜頭', amount: 2, amountMax: 3, unit: 'clove' }), metric, labels)).toBe('蒜頭 2–3 瓣');
    expect(draftIngredientText(ing({ name: '豬絞肉', amount: 150, unit: 'g' }), metric, labels)).toBe('豬絞肉 150 克');
  });
  it('依偏好換成美制', () => {
    expect(draftIngredientText(ing({ name: '豬絞肉', amount: 453.592, unit: 'g' }), us, labels)).toBe('豬絞肉 16 oz');
  });
  it('適量與少許不帶數字', () => {
    expect(draftIngredientText(ing({ name: '鹽', unit: 'to_taste' }), metric, labels)).toBe('鹽 適量');
    expect(draftIngredientText(ing({ name: '鹽', unit: 'pinch' }), metric, labels)).toBe('鹽 少許');
  });
  it('編輯頁的食材原文能被存檔時的解析器拆回食材與數量', async () => {
    const { buildIngredientIndex, parseIngredientLineNamed } = await import('../units/ingredient-line.ts');
    const index = buildIngredientIndex([{ id: 'soy-sauce', name: { 'zh-TW': '醬油' }, aliases: { 'zh-TW': [] } }] as never);
    const parsed = parseIngredientLineNamed(draftIngredientText(ing({ amount: 2, unit: 'tbsp' }), metric, labels), index);
    expect(parsed.ingredientId).toBe('soy-sauce');
    expect(parsed.amount).toBe(2);
  });
});

describe('draftStepText', () => {
  it('溫度標記依偏好轉成華氏，計時與目標溫度接在後面', () => {
    const step = { id: 's', order: 1, text: '預熱 {{temp:180:C}}，放入烤盤。', timerSeconds: 600, targetTemp: { value: 180, unit: 'C' as const } };
    expect(draftStepText(step, { unit: 'C', both: false }, (m) => `約 ${m} 分鐘`)).toBe('預熱 180°C，放入烤盤。（180°C，約 10 分鐘）');
    expect(draftStepText(step, { unit: 'F', both: false })).toContain('355');
  });
});
