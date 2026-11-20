import { describe, expect, it } from 'vitest';
import { REGION_CODE_PATTERN, commonIngredientIdsFor, getRegionProfile, regionChain, regionProfiles } from './index.ts';

describe('地區', () => {
  it('支援台灣、美國加州、日本，代碼格式正確、不重複', () => {
    expect(regionProfiles.map((r) => r.code).sort()).toEqual(['JP', 'TW', 'US-CA']);
    for (const r of regionProfiles) expect(r.code).toMatch(REGION_CODE_PATTERN);
  });

  it('地區代碼的格式', () => {
    for (const ok of ['TW', 'JP', 'US-CA', 'US']) expect(ok).toMatch(REGION_CODE_PATTERN);
    for (const bad of ['tw', 'USA', 'US-', 'US-ca', 'US-CAAA', '']) expect(bad).not.toMatch(REGION_CODE_PATTERN);
  });

  it('由近到遠列出上層', () => {
    expect(regionChain('US-CA')).toEqual(['US-CA', 'US']);
    expect(regionChain('TW')).toEqual(['TW']);
  });

  it('找不到地區時退回上層，都沒有就是沒有', () => {
    expect(getRegionProfile('US-CA')?.code).toBe('US-CA');
    expect(getRegionProfile('US-CA')?.defaultUnits).toEqual({ temperature: 'F', measure: 'us' });
    expect(getRegionProfile('TW-TPE')?.code).toBe('TW');
    expect(getRegionProfile('US-TX')).toBeUndefined(); // 沒有 US，不會憑空亂猜
    expect(getRegionProfile('KR')).toBeUndefined();
  });

  it('還沒有常見食材清單的地區，退回用台灣的', () => {
    const tw = commonIngredientIdsFor('TW');
    expect(tw.length).toBeGreaterThan(0);
    expect(commonIngredientIdsFor('JP')).toEqual(tw);
    expect(commonIngredientIdsFor('US-CA')).toEqual(tw);
    expect(commonIngredientIdsFor('KR')).toEqual(tw);
  });
});
