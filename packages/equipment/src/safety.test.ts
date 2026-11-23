import { describe, expect, it } from 'vitest';
import { donenessFor, donenessRegions, donenessTableFor, strictestDoneness } from './index.ts';

describe('中心溫度表', () => {
  it('每份表都有來源網址與審查狀態；每一列都有溫度', () => {
    for (const region of donenessRegions) {
      const t = donenessTableFor(region)!;
      expect(t.source.urls.length, region).toBeGreaterThan(0);
      for (const u of t.source.urls) expect(u).toMatch(/^https:\/\//);
      expect(['pending-review', 'verified'], region).toContain(t.source.reviewStatus);
      for (const r of t.rows) expect(r.minTempC, `${region}/${r.id}`).toBeGreaterThan(0);
    }
  });

  it('美國加州用 US 的表；日本用 JP 的；其他地區沒有自己的表', () => {
    expect(donenessTableFor('US-CA')?.region).toBe('US');
    expect(donenessTableFor('JP')?.region).toBe('JP');
    expect(donenessTableFor('TW')).toBeUndefined();
  });

  it('美國：禽肉 165°F、整塊肉 145°F 並靜置 3 分鐘', () => {
    expect(donenessFor('US-CA', 'poultry')?.minTempF).toBe(165);
    expect(donenessFor('US-CA', 'whole-cut-meat')).toMatchObject({ minTempF: 145, restMinutes: 3 });
  });

  it('美國的攝氏與華氏都是 USDA 公布的數值（73.9／71.1／62.8）', () => {
    const us = donenessTableFor('US')!;
    expect(us.source.reviewStatus).toBe('verified');
    const row = (id: string) => us.rows.find((r) => r.id === id)!;
    expect([row('poultry').minTempC, row('ground-meat').minTempC, row('whole-cut-meat').minTempC]).toEqual([73.9, 71.1, 62.8]);
    expect([row('fish-seafood').minTempC, row('egg').minTempC, row('leftovers').minTempC]).toEqual([62.8, 71.1, 73.9]);
  });

  it('沒有當地表的地區用最嚴格的：每一類都不低於各地區的表', () => {
    const strict = strictestDoneness();
    for (const region of donenessRegions) {
      for (const row of donenessTableFor(region)!.rows) {
        const s = strict.find((x) => x.id === row.id)!;
        expect(s.minTempC, row.id).toBeGreaterThanOrEqual(row.minTempC);
        expect(s.restMinutes ?? 0, row.id).toBeGreaterThanOrEqual(row.restMinutes ?? 0);
      }
    }
    const whole = donenessFor('TW', 'whole-cut-meat')!;
    expect(whole.minTempC).toBe(75); // 日本的 75°C 比美國的 63°C 嚴格
    expect(whole.restMinutes).toBe(3); // 靜置時間取美國的
    expect(whole.holdSeconds).toBe(60); // 維持時間取日本的
    expect(whole.minTempF).toBeUndefined(); // 數值來自日本，沒有官方華氏值，不自己換算
  });
});
