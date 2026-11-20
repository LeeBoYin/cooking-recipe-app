import { emptyProfile } from '@zhusha/core';
import { describe, expect, it } from 'vitest';
import { profileFromRow, rowFromProfile } from './taste.ts';

describe('口味地圖的資料轉換', () => {
  it('寫出去再讀回來，內容一樣；snake_case 欄位', () => {
    const p = emptyProfile();
    p.dims['taste.spicy'] = { affinity: 0.5, confidence: 0.4, source: 'explored', updatedAt: '2026-11-20T00:00:00.000Z' };
    p.context = { timePreference: 'quick', cooksFor: ['self', 'family'], adventure: 0.5, goals: ['form.dessert_baking'], festiveDishes: false };
    p.answeredItemIds = ['card_a'];
    p.lastExploredAt = '2026-11-20T00:00:00.000Z';
    const row = rowFromProfile(p);
    expect((row.dims as Record<string, { updated_at: string }>)['taste.spicy']?.updated_at).toBe('2026-11-20T00:00:00.000Z');
    expect(row.context).toMatchObject({ time_preference: 'quick', cooks_for: ['self', 'family'], festive_dishes: false });
    expect(profileFromRow(row)).toEqual(p);
  });

  it('沒有答過的情境欄位不寫出去；下廚頻率原樣保留', () => {
    const row = rowFromProfile(emptyProfile(), { adventure: 0.2, goals: [], festive_dishes: false, cooking_frequency: 'weekly' });
    expect(row.context).toEqual({ adventure: 0.2, goals: [], festive_dishes: false, cooking_frequency: 'weekly' });
  });
});
