import { describe, expect, it } from 'vitest';
import { REGION_CODE_PATTERN, allergens, searchIngredients, commonIngredientIdsFor, getRegionProfile, ingredients, regionChain, pantrySeasoningIdsFor, regionProfiles, stapleIngredientIdsFor } from './index.ts';

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

  it('沒有地區清單的地區（例如韓國），退回用台灣的；美國加州與日本有自己的', () => {
    const tw = commonIngredientIdsFor('TW');
    expect(tw.length).toBeGreaterThan(0);
    expect(commonIngredientIdsFor('KR')).toEqual(tw);
    expect(commonIngredientIdsFor('JP')).not.toEqual(tw);
    expect(commonIngredientIdsFor('US-CA')).not.toEqual(tw);
    expect(commonIngredientIdsFor('JP')).toContain('natto');
    expect(commonIngredientIdsFor('US-CA')).toContain('cheddar-cheese');
  });
});

describe('常見食材（快速盤點）', () => {
  const ids = new Set(ingredients.map((i) => i.id));

  it.each(['TW', 'US-CA', 'JP'])('%s 約 34–44 樣，都在食材字典裡、不重複', (region) => {
    const list = commonIngredientIdsFor(region);
    expect(list.length).toBeGreaterThanOrEqual(34);
    expect(list.length).toBeLessThanOrEqual(44);
    expect(new Set(list).size).toBe(list.length);
    for (const id of list) expect(ids, id).toContain(id);
  });
});

describe('常備食材', () => {
  const ids = new Set(ingredients.map((i) => i.id));

  it.each(['TW', 'US-CA', 'JP'])('%s 約 30–40 樣，都在食材字典裡、不重複', (region) => {
    const staples = stapleIngredientIdsFor(region);
    expect(staples.length).toBeGreaterThanOrEqual(30);
    expect(staples.length).toBeLessThanOrEqual(40);
    expect(new Set(staples).size).toBe(staples.length);
    for (const id of staples) expect(ids, id).toContain(id);
  });

  it.each(['TW', 'US-CA', 'JP'])('%s 只放放得久的：不放葉菜、生肉、海鮮；新鮮的蔬菜只有根莖類、蒜、薑', (region) => {
    const fresh = new Set(['onion', 'potato', 'sweet-potato', 'carrot', 'garlic', 'ginger']);
    for (const id of stapleIngredientIdsFor(region)) {
      const ing = ingredients.find((i) => i.id === id)!;
      expect(['meat', 'poultry', 'herb', 'dairy', 'mushroom'], id).not.toContain(ing.category);
      if (ing.category === 'seafood') throw new Error(`${id} 是新鮮海鮮`);
      if (ing.category === 'vegetable' && ing.defaultStorage !== 'freezer') expect(fresh, id).toContain(id);
    }
  });

  it('沒有清單的地區（例如韓國）退回用台灣的', () => {
    expect(stapleIngredientIdsFor('KR')).toEqual(stapleIngredientIdsFor('TW'));
    expect(stapleIngredientIdsFor('JP')).not.toEqual(stapleIngredientIdsFor('TW'));
  });

  it('醬料櫃：每個地區約 25–40 種、ID 都在字典裡、不重複，各地區不同', () => {
    const ids = new Set(ingredients.map((i) => i.id));
    for (const region of ['TW', 'US-CA', 'JP']) {
      const sauces = pantrySeasoningIdsFor(region);
      expect(sauces.length, region).toBeGreaterThanOrEqual(25);
      expect(sauces.length, region).toBeLessThanOrEqual(40);
      expect(new Set(sauces).size).toBe(sauces.length);
      for (const id of sauces) expect(ids, id).toContain(id);
    }
    expect(pantrySeasoningIdsFor('JP')).toContain('tonkatsu-sauce');
    expect(pantrySeasoningIdsFor('US-CA')).toContain('bbq-sauce');
  });

  it('沒有醬料清單的地區（例如韓國）退回用台灣的', () => {
    expect(pantrySeasoningIdsFor('KR')).toEqual(pantrySeasoningIdsFor('TW'));
    expect(pantrySeasoningIdsFor('JP')).not.toEqual(pantrySeasoningIdsFor('TW'));
  });
});

describe('節日', () => {
  const rule = /^(nth-weekday:(1[0-2]|[1-9]):[0-6]:[1-5]|last-weekday:(1[0-2]|[1-9]):[0-6]|[a-z]+(-[a-z]+)*(:[a-z]+)?)$/;
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  it('美國加州與日本都有節日；ID 不重複、名稱與日期規則格式正確', () => {
    for (const code of ['US-CA', 'JP']) {
      const hs = getRegionProfile(code)!.holidays;
      expect(hs.length, code).toBeGreaterThanOrEqual(6);
      expect(new Set(hs.map((h) => h.id)).size).toBe(hs.length);
      for (const h of hs) {
        expect(h.name['zh-TW'].trim()).not.toBe('');
        expect(h.dishIdeas.length, h.id).toBeGreaterThan(0);
        expect(h.leadDays, h.id).toBeGreaterThanOrEqual(0);
        const d = h.date;
        if (d.type === 'fixed' || d.type === 'lunar') {
          expect(d.month >= 1 && d.month <= 12, h.id).toBe(true);
          expect(d.day >= 1 && d.day <= daysIn[d.month - 1]!, h.id).toBe(true);
        } else if (d.type === 'rule') expect(d.rule, h.id).toMatch(rule);
        else expect(d.term, h.id).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it('感恩節是 11 月第 4 個星期四', () => {
    const t = getRegionProfile('US-CA')!.holidays.find((h) => h.id === 'thanksgiving')!;
    expect(t.date).toEqual({ type: 'rule', rule: 'nth-weekday:11:4:4' });
  });
});

describe('食材搜尋', () => {
  it('日文與英文別名也找得到', () => {
    expect(searchIngredients('長ねぎ')[0]?.id).toBe('scallion');
    expect(searchIngredients('なっとう')[0]?.id).toBe('natto');
    expect(searchIngredients('納豆')[0]?.id).toBe('natto');
    expect(searchIngredients('cheddar')[0]?.id).toBe('cheddar-cheese');
  });
});

describe('日本與美國的過敏原', () => {
  it('日本的特定原材料：蝦、蟹、核桃、小麥、蕎麥、蛋、乳、花生、腰果都有，且依日本標示分開列', () => {
    const jp = visibleForTest('JP');
    for (const id of ['shrimp', 'crab', 'walnut', 'wheat', 'buckwheat', 'egg', 'milk', 'peanut', 'cashew']) expect(jp, id).toContain(id);
    expect(jp).not.toContain('crustacean');
    expect(jp).not.toContain('gluten-grain');
  });

  it('美國加州：聯邦的九大過敏原（含芝麻）都有', () => {
    const us = visibleForTest('US-CA');
    for (const id of ['crustacean', 'fish', 'milk', 'egg', 'peanut', 'tree-nut', 'wheat', 'soy', 'sesame']) expect(us, id).toContain(id);
  });
});

function visibleForTest(region: string): string[] {
  const chain = regionChain(region);
  return allergens
    .filter((a) => (a.parentId ? chain.some((r) => a.displayLevelByRegion?.[r] === 'self') : !a.regions || a.regions.some((r) => chain.includes(r))))
    .map((a) => a.id);
}
