import { describe, expect, it } from 'vitest';
import type { KitchenEquipment } from '../../data/equipment.ts';
import { detailTags, formatCapacity, groupEquipment, groupTypes, hasExactName, initialSelection, inventoryWall, searchTypes } from './logic.ts';

function item(over: Partial<KitchenEquipment>): KitchenEquipment {
  return {
    id: 'x', kitchen_id: 'k', equipment_type_id: null, raw_name: '自訂', brand: null, model: null,
    capacity_value: null, capacity_unit: null, enabled_optional_techniques: [], dishwasher_safe: null,
    acquired_at: null, description: null, created_at: '', updated_at: '', created_by: null, updated_by: null,
    ...over,
  };
}

describe('廚具清單', () => {
  it('依分類分組、自訂的放最後、空的分組不出現', () => {
    const groups = groupEquipment([
      item({ id: 'a', raw_name: '怪東西' }),
      item({ id: 'b', equipment_type_id: 'air-fryer', raw_name: '氣炸鍋' }),
      item({ id: 'c', equipment_type_id: 'wok', raw_name: '炒鍋' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['cookware', 'appliance', 'custom']);
  });

  it('容量顯示原始值與單位，品牌在前', () => {
    expect(formatCapacity(10, '人份')).toBe('10 人份');
    expect(formatCapacity(null, null)).toBeNull();
    expect(detailTags(item({ brand: 'Philips', capacity_value: 5, capacity_unit: '公升' }))).toEqual(['Philips', '5 公升']);
    expect(detailTags(item({}))).toEqual([]);
  });
});

describe('搜尋字典', () => {
  it('名稱與別名都找得到', () => {
    expect(searchTypes('氣炸', 'TW').map((t) => t.id)).toContain('air-fryer');
    expect(searchTypes('爐台', 'TW').map((t) => t.id)).toContain('gas-stove');
  });
  it('沒打字就是全部，並且依分類分組', () => {
    const all = searchTypes('', 'TW');
    expect(all.length).toBeGreaterThan(40);
    expect(groupTypes(all)[0]?.key).toBe('heat-source');
  });
  it('名稱和字典一模一樣時，不再提供自己新增', () => {
    expect(hasExactName('氣炸鍋', 'TW')).toBe(true);
    expect(hasExactName('我的神秘鍋', 'TW')).toBe(false);
    expect(hasExactName('  ', 'TW')).toBe(false);
  });
});

describe('快速盤點', () => {
  it('圖示牆不含「藏起來」的廚具', () => {
    const ids = inventoryWall('TW').map((t) => t.id);
    expect(ids).toContain('wok');
    expect(ids).not.toContain('grill-pan');
  });
  it('廚房一件都沒有時，預設勾選「大部分家庭都有」的', () => {
    const selected = initialSelection('TW', new Set(), false);
    expect(selected.has('gas-stove')).toBe(true);
    expect(selected.has('air-fryer')).toBe(false);
  });
  it('廚房已經有廚具時，只勾已登記的，不再替人預設', () => {
    const selected = initialSelection('TW', new Set(['air-fryer']), true);
    expect([...selected]).toEqual(['air-fryer']);
  });
});
