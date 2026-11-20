import { describe, expect, it } from 'vitest';
import { addDays, addMonths, todayIn } from './dates.ts';

describe('dates', () => {
  it('依時區算當地日期', () => {
    const t = new Date('2026-11-20T18:00:00Z');
    expect(todayIn('Asia/Taipei', t)).toBe('2026-11-21');
    expect(todayIn('America/Los_Angeles', t)).toBe('2026-11-20');
  });
  it('加天數、跨月跨年', () => {
    expect(addDays('2026-11-20', 7)).toBe('2026-11-27');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
  it('加月份，月底不溢出', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-20', 3)).toBe('2027-02-20');
    expect(addMonths('2026-11-20', 6)).toBe('2027-05-20');
  });
});
