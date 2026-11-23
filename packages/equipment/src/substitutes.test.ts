import { describe, expect, it } from 'vitest';
import { canDoOrSubstitute, equipmentTypes, findSubstitutes, substitutes, techniques } from './index.ts';

const own = (...ids: string[]) => ids.map((equipmentTypeId) => ({ equipmentTypeId }));

describe('替代做法字典', () => {
  it('20 組，ID 不重複，手法與廚具都在字典裡', () => {
    expect(substitutes).toHaveLength(20);
    expect(new Set(substitutes.map((s) => s.id)).size).toBe(20);
    const techniqueIds = new Set(techniques.map((t) => t.id));
    const equipmentIds = new Set(equipmentTypes.map((e) => e.id));
    for (const s of substitutes) {
      expect(techniqueIds.has(s.technique), s.id).toBe(true);
      expect(s.use.length, s.id).toBeGreaterThan(0);
      expect(s.limit.length, s.id).toBeGreaterThan(0);
      for (const n of Array.isArray(s.needs) ? s.needs : [s.needs]) {
        for (const id of [...(n.anyEquipment ?? []), ...(n.allEquipment ?? [])]) expect(equipmentIds.has(id), `${s.id}/${id}`).toBe(true);
        for (const t of n.anyTechnique ?? []) expect(techniqueIds.has(t), `${s.id}/${t}`).toBe(true);
      }
    }
  });

  it('舒肥的溫水替代只限短時間，且需要溫度計與爐具', () => {
    const s = substitutes.find((x) => x.id === 'sous-vide-warm-water')!;
    expect(s.shortOnly).toBe(true);
    expect(findSubstitutes('sous-vide', own('stockpot', 'gas-stove'))).toEqual([]);
    expect(findSubstitutes('sous-vide', own('stockpot', 'gas-stove', 'thermometer')).map((x) => x.id)).toEqual(['sous-vide-warm-water']);
    // 電鍋不是替代做法
    expect(findSubstitutes('sous-vide', own('tatung-rice-cooker', 'thermometer'))).toEqual([]);
  });
});

describe('canDoOrSubstitute', () => {
  it('沒有氣炸鍋：小烤箱可以；烤箱要勾熱風才行', () => {
    expect(canDoOrSubstitute('air-fry', own('toaster-oven'))).toBe(true);
    expect(canDoOrSubstitute('air-fry', own('oven'))).toBe(false);
    expect(canDoOrSubstitute('air-fry', [{ equipmentTypeId: 'oven', enabledOptionalTechniques: ['air-fry'] }])).toBe(true);
  });

  it('蒸：只有炒鍋沒蒸架做不到；加蒸架、有電鍋或微波爐都可以', () => {
    expect(canDoOrSubstitute('steam', own('wok', 'gas-stove'))).toBe(false);
    expect(canDoOrSubstitute('steam', own('wok', 'gas-stove', 'steaming-rack'))).toBe(true);
    expect(canDoOrSubstitute('steam', own('microwave'))).toBe(true);
  });

  it('鍋具類的替代也要有爐具', () => {
    expect(canDoOrSubstitute('torch-sear', own('cast-iron-skillet'))).toBe(false);
    expect(canDoOrSubstitute('torch-sear', own('cast-iron-skillet', 'gas-stove'))).toBe(true);
  });

  it('手揉、排水法真空不需要任何廚具；自訂廚具不算', () => {
    expect(canDoOrSubstitute('knead', [])).toBe(true);
    expect(canDoOrSubstitute('vacuum-seal', [{ equipmentTypeId: null }])).toBe(true);
    expect(canDoOrSubstitute('bake', [{ equipmentTypeId: null }])).toBe(false);
  });

  it('都做不到：只有微波爐要烘焙', () => {
    expect(canDoOrSubstitute('bake', own('microwave'))).toBe(false);
    expect(canDoOrSubstitute('bake', own('toaster-oven'))).toBe(true);
  });
});
