import { describe, expect, it } from 'vitest';
import { newId } from './id.ts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('產生 UUID v7 格式', () => {
    expect(newId()).toMatch(UUID_V7);
  });

  it('前 48 位是毫秒時間', () => {
    const now = Date.UTC(2026, 10, 20, 8, 0, 0);
    const hex = newId(now).replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(now);
  });

  it('不同時間產生的 ID 依時間排序', () => {
    const earlier = newId(Date.UTC(2026, 0, 1));
    const later = newId(Date.UTC(2026, 0, 2));
    expect(earlier < later).toBe(true);
  });

  it('同一毫秒產生的 ID 也不重複', () => {
    const now = Date.now();
    const ids = new Set(Array.from({ length: 1000 }, () => newId(now)));
    expect(ids.size).toBe(1000);
  });
});
