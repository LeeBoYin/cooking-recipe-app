import { emptyProfile } from '@zhusha/core';
import { describe, expect, it } from 'vitest';
import { adventureLevel, displayLevel, levelOf, maskEmail, setDimension, visibleDimensions } from './tasteMap.ts';

const now = '2026-11-20T00:00:00.000Z';

describe('levelOf', () => {
  it('五個等級的邊界', () => {
    expect([1, 0.75, 0.5, 0.25, 0, -0.24, -0.25, -0.5, -0.75, -1].map(levelOf)).toEqual([
      'love', 'love', 'like', 'like', 'neutral', 'neutral', 'dislike', 'dislike', 'hate', 'hate',
    ]);
  });
});

describe('displayLevel', () => {
  it('沒有紀錄或把握太低是還不確定；使用者自己設的一定顯示', () => {
    expect(displayLevel(undefined)).toBeUndefined();
    expect(displayLevel({ affinity: 0.9, confidence: 0.1, source: 'explored', updatedAt: now })).toBeUndefined();
    expect(displayLevel({ affinity: 0.9, confidence: 0.5, source: 'explored', updatedAt: now })).toBe('love');
    expect(displayLevel({ affinity: 0, confidence: 0, source: 'user_set', updatedAt: now })).toBe('neutral');
  });
});

describe('setDimension', () => {
  it('標成 user_set、把握拉滿，其他維度不動', () => {
    const base = setDimension(emptyProfile(), 'taste.spicy', 'love', now);
    const next = setDimension(base, 'taste.sour', 'hate', now);
    expect(next.dims['taste.spicy']).toEqual({ affinity: 1, confidence: 1, source: 'user_set', updatedAt: now });
    expect(next.dims['taste.sour']?.affinity).toBe(-1);
  });
});

describe('visibleDimensions', () => {
  const dims = [
    { key: 'cuisine.china' },
    { key: 'cuisine.china.sichuan', parentKey: 'cuisine.china' },
    { key: 'cuisine.japan' },
    { key: 'cuisine.japan.washoku', parentKey: 'cuisine.japan' },
    { key: 'cuisine.old', deprecated: true },
  ];
  it('底下的項目：大區喜歡或自己有紀錄才列出；停用的不列', () => {
    let p = emptyProfile();
    expect(visibleDimensions(dims, p).map((d) => d.key)).toEqual(['cuisine.china', 'cuisine.japan']);
    p = setDimension(p, 'cuisine.china', 'love', now);
    p = setDimension(p, 'cuisine.japan.washoku', 'neutral', now);
    expect(visibleDimensions(dims, p).map((d) => d.key)).toEqual(['cuisine.china', 'cuisine.china.sichuan', 'cuisine.japan', 'cuisine.japan.washoku']);
  });
});

describe('adventureLevel / maskEmail', () => {
  it('挑戰意願分四級', () => {
    expect([0, 0.2, 0.5, 0.9].map(adventureLevel)).toEqual(['safe', 'sometimes', 'curious', 'always']);
  });
  it('email 只露出第一個字', () => {
    expect(maskEmail('alice@gmail.com')).toBe('a•••@gmail.com');
    expect(maskEmail('weird')).toBe('weird');
  });
});
