import { emptyProfile, startSession, type QuizStep } from '@zhusha/core';
import { describe, expect, it } from 'vitest';
import { challengeCuisine, parseCardTitle, progressPercent, reactionFor } from './logic.ts';

describe('parseCardTitle', () => {
  it('組合、只有前綴、只有後綴、探險家、沒有', () => {
    expect(parseCardTitle('taste.spicy|cuisine.taiwan')).toEqual({ kind: 'composed', prefix: 'taste.spicy', suffix: 'cuisine.taiwan' });
    expect(parseCardTitle('taste.sour')).toEqual({ kind: 'composed', prefix: 'taste.sour' });
    expect(parseCardTitle('cuisine.korea')).toEqual({ kind: 'composed', suffix: 'cuisine.korea' });
    expect(parseCardTitle('explorer')).toEqual({ kind: 'explorer' });
    expect(parseCardTitle(undefined)).toEqual({ kind: 'none' });
  });
});

describe('progressPercent', () => {
  const s = startSession(emptyProfile(), 'quick', 'x', { items: [] });
  const pref: QuizStep = { kind: 'items', phase: 'preference', items: [] };
  const ctx: QuizStep = { kind: 'items', phase: 'context', items: [] };
  it('喜好題占 85%、情境題每題 +5%、結束 100%', () => {
    expect(progressPercent(s, pref, 0)).toBe(0);
    expect(progressPercent({ ...s, asked: 6 }, pref, 0)).toBe(43);
    expect(progressPercent({ ...s, asked: 12 }, pref, 0)).toBe(85);
    expect(progressPercent(s, ctx, 2)).toBe(95);
    expect(progressPercent(s, { kind: 'done', reason: 'confident' }, 3)).toBe(100);
  });
});

describe('reactionFor / challengeCuisine', () => {
  it('想試試 → 這個我可以教你；其他輪流', () => {
    expect(reactionFor([{ type: 'dish_card', value: 'try' }], 1)).toBe('teach');
    expect(reactionFor([{ type: 'dish_card', value: 'love' }], 2)).toBe('remember');
    expect(reactionFor([{ type: 'dish_card', value: 'love' }], 3)).toBe('next');
  });
  it('想學裡第一個菜系', () => {
    expect(challengeCuisine({ goals: ['form.dessert_baking', 'cuisine.southeast_asia.thai'] })).toBe('cuisine.southeast_asia.thai');
    expect(challengeCuisine({ goals: [] })).toBeUndefined();
  });
});
