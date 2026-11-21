import { describe, expect, it } from 'vitest';
import { buildChefCatalog, hourInTimeZone, isChefPersona, pickChefLine, timeBand } from './pick.ts';

const keys = [
  'chef.line.home.morning.warm.1', 'chef.line.home.morning.warm.2', 'chef.line.home.morning.warm.3',
  'chef.line.home.morning.coach.1', 'chef.line.home.morning.coach.2',
  'chef.line.taste.ask.dish_card.warm.1', 'chef.line.only.warm.1', 'other.key', 'chef.line.bad.warm.0',
];
const catalog = buildChefCatalog(keys);

describe('buildChefCatalog', () => {
  it('依情境與語氣數句子，情境名稱可以含點', () => {
    expect(catalog['home.morning']).toEqual({ warm: 3, coach: 2 });
    expect(catalog['taste.ask.dish_card']).toEqual({ warm: 1 });
  });
  it('忽略不是大廚句子的代碼與編號 0', () => {
    expect(catalog['bad']).toBeUndefined();
    expect(Object.keys(catalog)).toHaveLength(3);
  });
});

describe('pickChefLine', () => {
  const input = { situation: 'home.morning', persona: 'coach', seedKey: 'u1|2026-11-21' } as const;
  it('同一天同一情境固定一句', () => {
    const first = pickChefLine(catalog, input);
    for (let i = 0; i < 5; i += 1) expect(pickChefLine(catalog, input)).toBe(first);
    expect(first).toMatch(/^chef\.line\.home\.morning\.coach\.[12]$/);
  });
  it('日期不同時會挑到不同的句子（跨很多天看得到每一句）', () => {
    const seen = new Set<string | null>();
    for (let d = 1; d <= 60; d += 1) seen.add(pickChefLine(catalog, { ...input, persona: 'warm', seedKey: `u1|2026-11-${d}` }));
    expect(seen.size).toBe(3);
  });
  it('語氣沒有對應句子時退回 warm', () => {
    expect(pickChefLine(catalog, { ...input, persona: 'minimal' })).toMatch(/^chef\.line\.home\.morning\.warm\./);
    expect(pickChefLine(catalog, { situation: 'only', persona: 'punny', seedKey: 'x' })).toBe('chef.line.only.warm.1');
  });
  it('沒有這個情境就回傳 null', () => {
    expect(pickChefLine(catalog, { ...input, situation: 'missing' })).toBeNull();
  });
  it('連 warm 都沒有時回傳 null', () => {
    const c = buildChefCatalog(['chef.line.x.coach.1']);
    expect(pickChefLine(c, { situation: 'x', persona: 'minimal', seedKey: 's' })).toBeNull();
  });
});

describe('timeBand / hourInTimeZone', () => {
  it('分時段', () => {
    expect([4, 5, 10, 11, 13, 14, 16, 17, 20, 21, 0].map(timeBand)).toEqual([
      'night', 'morning', 'morning', 'noon', 'noon', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night',
    ]);
  });
  it('依時區取小時', () => {
    const now = new Date('2026-11-21T04:30:00Z');
    expect(hourInTimeZone(now, 'Asia/Taipei')).toBe(12);
    expect(hourInTimeZone(new Date('2026-11-21T16:30:00Z'), 'Asia/Taipei')).toBe(0);
  });
  it('isChefPersona', () => {
    expect(isChefPersona('punny')).toBe(true);
    expect(isChefPersona('x')).toBe(false);
  });
});
