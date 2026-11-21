import { describe, expect, it } from 'vitest';
import {
  DISHWASHER_SAFE, EQUIPMENT_CATEGORIES, canDo, equipmentAvailableIn, doableTechniques, equipmentTypes, onboardingModeFor, techniques, techniquesOf,
} from './index.ts';

const DICT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('手法', () => {
  it('32 種，ID 格式正確且不重複，都有繁中名稱', () => {
    expect(techniques).toHaveLength(32);
    expect(new Set(techniques.map((t) => t.id)).size).toBe(32);
    for (const t of techniques) {
      expect(t.id).toMatch(DICT_ID);
      expect(t.name['zh-TW'].trim()).not.toBe('');
    }
  });
});

describe('廚具', () => {
  const techniqueIds = new Set(techniques.map((t) => t.id));
  const count = (pred: (e: (typeof equipmentTypes)[number]) => boolean) => equipmentTypes.filter(pred).length;

  it('70 種，ID 格式正確且不重複，都有繁中名稱', () => {
    expect(equipmentTypes).toHaveLength(70);
    expect(new Set(equipmentTypes.map((e) => e.id)).size).toBe(70);
    for (const e of equipmentTypes) {
      expect(e.id).toMatch(DICT_ID);
      expect(e.name['zh-TW'].trim()).not.toBe('');
    }
  });

  it('列舉值正確；參照的手法都存在', () => {
    for (const e of equipmentTypes) {
      expect(EQUIPMENT_CATEGORIES).toContain(e.category);
      expect(DISHWASHER_SAFE).toContain(e.dishwasherSafe);
      for (const t of [...e.techniques, ...(e.optionalTechniques ?? []), ...(e.assists ?? [])])
        expect(techniqueIds, `${e.id}: ${t}`).toContain(t);
    }
  });

  it('選配手法不和本身的手法重複', () => {
    for (const e of equipmentTypes)
      for (const t of e.optionalTechniques ?? []) expect(e.techniques, e.id).not.toContain(t);
  });

  it('鍋具都需要爐具；爐具、量測工具與洗碗機沒有手法', () => {
    for (const e of equipmentTypes) {
      expect(e.requiresHeatSource, e.id).toBe(e.category === 'cookware');
      if (e.category === 'heat-source' || e.category === 'measuring') expect(e.techniques, e.id).toEqual([]);
    }
    expect(equipmentTypes.find((e) => e.id === 'dishwasher')?.techniques).toEqual([]);
    expect(equipmentTypes.filter((e) => e.isHeatSource).map((e) => e.id)).toEqual([
      'gas-stove', 'induction-cooktop', 'radiant-cooktop', 'portable-gas-stove',
    ]);
  });

  it('洗碗機標記的數量和 07 一致', () => {
    expect([count((e) => e.dishwasherSafe === 'yes'), count((e) => e.dishwasherSafe === 'partial'),
      count((e) => e.dishwasherSafe === 'no'), count((e) => e.dishwasherSafe === 'n/a')]).toEqual([12, 30, 14, 14]);
  });

  it('新手盤點：台灣出現 48 種、其中 10 種預設勾選', () => {
    const modes = equipmentTypes.map((e) => onboardingModeFor(e, 'TW'));
    expect(modes.filter((m) => m !== 'hidden')).toHaveLength(48);
    expect(modes.filter((m) => m === 'default-on')).toHaveLength(10);
  });

  it('新手盤點依地區覆寫；沒設定的地區用預設', () => {
    const oven = equipmentTypes.find((e) => e.id === 'oven')!;
    expect(onboardingModeFor(oven, 'US')).toBe('default-on');
    expect(onboardingModeFor(oven, 'TW')).toBe('show');
    expect(onboardingModeFor(oven, 'JP')).toBe('show');
  });

  it('美國加州吃到標 US 的設定；日本有自己的預設', () => {
    const get = (id: string) => equipmentTypes.find((e) => e.id === id)!;
    expect(onboardingModeFor(get('oven'), 'US-CA')).toBe('default-on');
    expect(onboardingModeFor(get('dishwasher'), 'US-CA')).toBe('default-on');
    expect(onboardingModeFor(get('fish-grill'), 'JP')).toBe('default-on');
    expect(onboardingModeFor(get('electric-rice-cooker'), 'JP')).toBe('default-on');
    expect(onboardingModeFor(get('tatung-rice-cooker'), 'JP')).toBe('hidden');
    expect(onboardingModeFor(get('fish-grill'), 'TW')).toBe('hidden');
  });

  it('只有日本才有的廚具標了 regions；US-CA 也算 US', () => {
    const fish = equipmentTypes.find((e) => e.id === 'fish-grill')!;
    expect(equipmentAvailableIn(fish, 'JP')).toBe(true);
    expect(equipmentAvailableIn(fish, 'TW')).toBe(false);
    expect(equipmentAvailableIn({ ...fish, regions: ['US'] }, 'US-CA')).toBe(true);
    expect(equipmentAvailableIn(equipmentTypes.find((e) => e.id === 'wok')!, 'US-CA')).toBe(true);
  });
});

describe('canDo', () => {
  it('有對應的廚具就做得到', () => {
    expect(canDo('sous-vide', [{ equipmentTypeId: 'sous-vide-circulator' }])).toBe(true);
    expect(canDo('sous-vide', [{ equipmentTypeId: 'oven' }])).toBe(false);
  });

  it('鍋具要有爐具才算', () => {
    expect(canDo('stir-fry', [{ equipmentTypeId: 'wok' }])).toBe(false);
    expect(canDo('stir-fry', [{ equipmentTypeId: 'wok' }, { equipmentTypeId: 'gas-stove' }])).toBe(true);
  });

  it('選配功能要使用者說有才算，而且只算字典列出的', () => {
    expect(canDo('air-fry', [{ equipmentTypeId: 'oven' }])).toBe(false);
    expect(canDo('air-fry', [{ equipmentTypeId: 'oven', enabledOptionalTechniques: ['air-fry'] }])).toBe(true);
    expect(canDo('sous-vide', [{ equipmentTypeId: 'oven', enabledOptionalTechniques: ['sous-vide'] }])).toBe(false);
  });

  it('自訂廚具不參與', () => {
    expect(canDo('bake', [{ equipmentTypeId: null }])).toBe(false);
    expect(techniquesOf({ equipmentTypeId: undefined })).toEqual([]);
  });

  it('列出做得到的手法', () => {
    const owned = [{ equipmentTypeId: 'wok' }, { equipmentTypeId: 'cleaver' }];
    expect(doableTechniques(owned)).toEqual(['shred-slice']);
    expect(doableTechniques([...owned, { equipmentTypeId: 'gas-stove' }])).toContain('stir-fry');
  });
});
