import { describe, expect, it } from 'vitest';
import fsisSource from '../safety/US/sources/FSIS_Sous_Vide_Meat_Cooking_Guidance.md?raw';
import { donenessFor, donenessRegions, donenessTableFor, sousVideDwellSeconds, sousVideEligible, sousVidePresetsFor, sousVideRulesFor, sousVideTempMark, strictestDoneness } from './index.ts';

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

describe('舒肥預設組合表（US，只有肉類）', () => {
  // 來源文件 Table 2 的每一列都要和 JSON 對得上（數值照文件，不是憑記憶）
  it('每一組都和來源文件 Table 2 的那一列一致', () => {
    const table = fsisSource.split('### Table 2')[1]!.split('**Interpretation notes')[0]!;
    const rows = [...table.matchAll(/^\s+(\d{3})\s+([\d.]+)\s+(\d+) (min|sec)\s+(\d+) (min|sec)\s*$/gm)];
    expect(rows.length).toBe(31);
    const secs = (v: string, u: string) => Number(v) * (u === 'min' ? 60 : 1);
    const presets = sousVidePresetsFor('US');
    const listed = rows.filter((r) => Number(r[1]) < 158); // 158 °F 以上維持 0 秒，不是舒肥，不列
    expect(presets.length).toBe(listed.length);
    for (const r of listed) {
      const p = presets.find((x) => x.tempF === Number(r[1]))!;
      expect(p, r[1]).toBeDefined();
      expect([p.tempC, p.dwell65Seconds, p.dwell7Seconds]).toEqual([Number(r[2]), secs(r[3]!, r[4]!), secs(r[5]!, r[6]!)]);
    }
  });

  it('7-log 一定不短於 6.5-log；短時間組合是 140°F（60°C）以上、維持 12 分鐘內', () => {
    for (const p of sousVidePresetsFor('US')) {
      expect(p.dwell7Seconds, p.id).toBeGreaterThanOrEqual(p.dwell65Seconds);
      expect(p.short, p.id).toBe(p.tempF >= 140);
      if (p.short) expect(p.dwell7Seconds, p.id).toBeLessThanOrEqual(720);
    }
    expect(sousVidePresetsFor('US', { shortOnly: true }).every((p) => p.short)).toBe(true);
  });

  it('台灣、日本沒有當地表，用美國的；不帶 short 時全部', () => {
    expect(sousVidePresetsFor('TW')).toEqual(sousVidePresetsFor('US'));
    expect(sousVidePresetsFor('JP')).toEqual(sousVidePresetsFor('US'));
    expect(sousVidePresetsFor('US-CA').length).toBeGreaterThan(0);
  });

  it('只有豬、牛、羊肉能舒肥；禽肉、海鮮、蛋、沒有肉都不行，混在一起也不行', () => {
    expect(sousVideEligible([['animal', 'meat', 'pork']])).toBe(true);
    expect(sousVideEligible([['meat', 'beef'], ['vegetable']])).toBe(true);
    expect(sousVideEligible([['meat', 'poultry']])).toBe(false);
    expect(sousVideEligible([['meat', 'pork'], ['meat', 'poultry']])).toBe(false);
    expect(sousVideEligible([['meat', 'pork'], ['egg']])).toBe(false);
    expect(sousVideEligible([['seafood']])).toBe(false);
    expect(sousVideEligible([[]])).toBe(false);
  });

  it('牛肉用 6.5-log 欄；豬、羊或混合用 7-log 欄', () => {
    const p = sousVidePresetsFor('US').find((x) => x.tempF === 131)!;
    expect(sousVideDwellSeconds(p, [['beef']])).toBe(89 * 60);
    expect(sousVideDwellSeconds(p, [['pork']])).toBe(97 * 60);
    expect(sousVideDwellSeconds(p, [['beef'], ['lamb']])).toBe(97 * 60);
    expect(sousVideTempMark(p)).toBe('{{temp:131:F:min:55}}');
  });

  it('規則：溫度計確認、come-up time 的 6 小時、做完盡快吃', () => {
    const ids = sousVideRulesFor('TW').map((r) => r.id);
    expect(ids).toEqual(['core-temp', 'come-up-time', 'after-cooking']);
  });
});
