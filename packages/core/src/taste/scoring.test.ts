import { describe, expect, it } from 'vitest';
import { applyAnswer, mainCuisineKey } from './scoring.ts';
import { emptyProfile, type TasteDimension, type TasteQuizItem } from './types.ts';

const NOW = '2026-11-20T00:00:00.000Z';
const dims: TasteDimension[] = [
  { key: 'cuisine.southeast_asia', group: 'cuisine', impact: 0.9 },
  { key: 'cuisine.southeast_asia.thai', group: 'cuisine', parentKey: 'cuisine.southeast_asia', impact: 0.6 },
  { key: 'taste.spicy', group: 'taste', impact: 0.8 },
  { key: 'form.soup', group: 'form', impact: 0.7 },
  { key: 'form.rice', group: 'form', impact: 0.7 },
  { key: 'richness.rich', group: 'richness', impact: 0.5 },
];
const card: TasteQuizItem = {
  id: 'card_a', type: 'dish_card', regions: ['TW'],
  mapping: { 'cuisine.southeast_asia.thai': 0.8, 'taste.spicy': 0.5, 'form.soup': 0.4 },
};

describe('applyAnswer：菜卡', () => {
  it('第一次答「喜歡」：把握 = 1 − (1 − 0)(1 − 0.5·s)，喜好 = 0.5·s / (0.5·|s|) = 1', () => {
    const p = applyAnswer(emptyProfile(), card, { type: 'dish_card', value: 'love' }, dims, NOW);
    expect(p.dims['taste.spicy']?.confidence).toBeCloseTo(0.25);
    expect(p.dims['taste.spicy']?.affinity).toBeCloseTo(1);
    expect(p.dims['cuisine.southeast_asia.thai']?.confidence).toBeCloseTo(0.4);
    expect(p.dims['taste.spicy']?.source).toBe('explored');
    expect(p.answeredItemIds).toEqual(['card_a']);
  });

  it('上層維度同時更新，力道 ×0.5', () => {
    const p = applyAnswer(emptyProfile(), card, { type: 'dish_card', value: 'love' }, dims, NOW);
    // s = 0.8 × 0.5 = 0.4 → 把握 = 1 − (1 − 0.2) = 0.2
    expect(p.dims['cuisine.southeast_asia']?.confidence).toBeCloseTo(0.2);
    expect(p.dims['cuisine.southeast_asia']?.affinity).toBeGreaterThan(0);
  });

  it('再答一題：喜好以把握當權重混合，把握變高但不到 1', () => {
    const first = applyAnswer(emptyProfile(), card, { type: 'dish_card', value: 'love' }, dims, NOW);
    const second = applyAnswer(first, { ...card, id: 'card_b' }, { type: 'dish_card', value: 'nope' }, dims, NOW);
    const spicy = second.dims['taste.spicy']!;
    // a' = (1·0.25 + 0.5·(−0.5)) / (0.25 + 0.25) = 0
    expect(spicy.affinity).toBeCloseTo(0);
    expect(spicy.confidence).toBeCloseTo(1 - 0.75 * 0.75);
    expect(spicy.confidence).toBeLessThan(1);
  });

  it('「你設定的」不會被覆蓋', () => {
    const p0 = emptyProfile();
    p0.dims['taste.spicy'] = { affinity: -1, confidence: 1, source: 'user_set', updatedAt: 'x' };
    const p = applyAnswer(p0, card, { type: 'dish_card', value: 'love' }, dims, NOW);
    expect(p.dims['taste.spicy']).toEqual(p0.dims['taste.spicy']);
    expect(p.dims['form.soup']?.source).toBe('explored');
  });

  it('答「想試試」：挑戰意願 +0.05，主菜系加進想學；重複不會重複加', () => {
    const once = applyAnswer(emptyProfile(), card, { type: 'dish_card', value: 'try' }, dims, NOW);
    expect(once.context.adventure).toBeCloseTo(0.25);
    expect(once.context.goals).toEqual(['cuisine.southeast_asia.thai']);
    const twice = applyAnswer(once, { ...card, id: 'card_b' }, { type: 'dish_card', value: 'try' }, dims, NOW);
    expect(twice.context.goals).toEqual(['cuisine.southeast_asia.thai']);
  });

  it('挑戰意願最高 1', () => {
    const p0 = emptyProfile();
    p0.context.adventure = 0.99;
    expect(applyAnswer(p0, card, { type: 'dish_card', value: 'try' }, dims, NOW).context.adventure).toBe(1);
  });

  it('題型和回答不符會丟錯', () => {
    expect(() => applyAnswer(emptyProfile(), card, { type: 'quick_fire', value: 'love' }, dims, NOW)).toThrow('answer_type_mismatch');
  });

  it('不改傳進來的物件', () => {
    const p0 = emptyProfile();
    applyAnswer(p0, card, { type: 'dish_card', value: 'try' }, dims, NOW);
    expect(p0).toEqual(emptyProfile());
  });
});

describe('applyAnswer：其他題型', () => {
  it('快問快答：愛 +1、不行 −1；「還好」喜好不動、只加把握', () => {
    const qf: TasteQuizItem = { id: 'qf_x', type: 'quick_fire', regions: ['TW'], mapping: { 'form.rice': 1 } };
    expect(applyAnswer(emptyProfile(), qf, { type: 'quick_fire', value: 'no' }, dims, NOW).dims['form.rice']?.affinity).toBeCloseTo(-1);
    const ok = applyAnswer(emptyProfile(), qf, { type: 'quick_fire', value: 'ok' }, dims, NOW);
    expect(ok.dims['form.rice']?.affinity).toBe(0);
    expect(ok.dims['form.rice']?.confidence).toBeGreaterThan(0);
    expect(ok.dims['form.rice']?.confidence).toBeLessThan(0.25);
  });

  it('二選一：選的那邊照 mapping，沒選的反向、力道減半', () => {
    const tot: TasteQuizItem = {
      id: 'tot_x', type: 'this_or_that', regions: ['TW'], mapping: {},
      options: [{ mapping: { 'richness.rich': 0.8 } }, { mapping: { 'form.soup': 0.6 } }],
    };
    const p = applyAnswer(emptyProfile(), tot, { type: 'this_or_that', choice: 0 }, dims, NOW);
    expect(p.dims['richness.rich']?.affinity).toBeGreaterThan(0);
    expect(p.dims['form.soup']?.affinity).toBeLessThan(0);
    // 選的力道 0.8，沒選的 0.3：把握 0.4 vs 0.15
    expect(p.dims['richness.rich']?.confidence).toBeCloseTo(0.4);
    expect(p.dims['form.soup']?.confidence).toBeCloseTo(0.15);
  });

  it('光譜：第 n 點對應 −1～1，把握直接拉到 0.8', () => {
    const sp: TasteQuizItem = { id: 'spec_x', type: 'spectrum', regions: ['TW'], mapping: {}, spectrum: { dimension: 'taste.spicy' } };
    const points = [0, 1, 2, 3, 4] as const;
    expect(points.map((point) => applyAnswer(emptyProfile(), sp, { type: 'spectrum', point }, dims, NOW).dims['taste.spicy']?.affinity)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(applyAnswer(emptyProfile(), sp, { type: 'spectrum', point: 3 }, dims, NOW).dims['taste.spicy']?.confidence).toBe(0.8);
  });

  it('光譜不蓋掉「你設定的」', () => {
    const sp: TasteQuizItem = { id: 'spec_x', type: 'spectrum', regions: ['TW'], mapping: {}, spectrum: { dimension: 'taste.spicy' } };
    const p0 = emptyProfile();
    p0.dims['taste.spicy'] = { affinity: 0.2, confidence: 1, source: 'user_set', updatedAt: 'x' };
    expect(applyAnswer(p0, sp, { type: 'spectrum', point: 0 }, dims, NOW).dims['taste.spicy']?.affinity).toBe(0.2);
  });

  it('情境題寫進情境，不動喜好維度', () => {
    const time: TasteQuizItem = {
      id: 'ctx_time', type: 'context', regions: ['TW'], mapping: {}, contextField: 'time_preference',
      options: [{ value: 'quick' }, { value: 'normal' }],
    };
    const p = applyAnswer(emptyProfile(), time, { type: 'context', choices: [1] }, dims, NOW);
    expect(p.context.timePreference).toBe('normal');
    expect(p.dims).toEqual({});
    const who: TasteQuizItem = {
      id: 'ctx_who', type: 'context', regions: ['TW'], mapping: {}, contextField: 'cooks_for',
      options: [{ value: 'self' }, { value: 'partner' }, { value: 'family' }],
    };
    expect(applyAnswer(emptyProfile(), who, { type: 'context', choices: [0, 2] }, dims, NOW).context.cooksFor).toEqual(['self', 'family']);
  });

  it('週末題：挑戰意願以選項為基準，加上「想試試」累積的部分；烤甜點加進想學', () => {
    const weekend: TasteQuizItem = {
      id: 'ctx_weekend', type: 'context', regions: ['TW'], mapping: {}, contextField: 'adventure',
      options: [{ value: 0.8 }, { value: 0.4, addGoal: 'form.dessert_baking' }],
    };
    const p0 = emptyProfile();
    p0.context.adventure = 0.3; // 答過 2 次「想試試」
    const p = applyAnswer(p0, weekend, { type: 'context', choices: [1] }, dims, NOW);
    expect(p.context.adventure).toBeCloseTo(0.5);
    expect(p.context.goals).toContain('form.dessert_baking');
    expect(applyAnswer(emptyProfile(), weekend, { type: 'context', choices: [0] }, dims, NOW).context.adventure).toBeCloseTo(0.8);
  });
});

describe('mainCuisineKey', () => {
  it('取權重最大的菜系維度', () => {
    expect(mainCuisineKey({ mapping: { 'cuisine.taiwan.street_food': 0.5, 'cuisine.taiwan.home': 0.3, 'protein.beef': 0.9 } })).toBe('cuisine.taiwan.street_food');
    expect(mainCuisineKey({ mapping: { 'taste.spicy': 1 } })).toBeUndefined();
  });
});
