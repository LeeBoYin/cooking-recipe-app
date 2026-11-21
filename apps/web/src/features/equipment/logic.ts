// 廚具畫面的純邏輯：分組、搜尋字典、盤點圖示牆的預設勾選。
import { equipmentAvailableIn, equipmentTypes, onboardingModeFor, type EquipmentCategory, type EquipmentType } from '@zhusha/equipment';
import { getEquipmentType } from '@zhusha/equipment';
import type { KitchenEquipment } from '../../data/equipment.ts';

// 畫面上的分組順序；自己新增的（不在字典裡）放最後
export const CATEGORY_ORDER: EquipmentCategory[] = [
  'heat-source', 'cookware', 'appliance', 'blending', 'knife-prep', 'special', 'measuring', 'baking',
];
export type GroupKey = EquipmentCategory | 'custom';
const GROUP_ORDER: GroupKey[] = [...CATEGORY_ORDER, 'custom'];

export function typeName(type: EquipmentType): string {
  return type.name['zh-TW'];
}

export function groupOf(item: KitchenEquipment): GroupKey {
  return getEquipmentType(item.equipment_type_id)?.category ?? 'custom';
}

// 廚房的廚具依分類分組，空的分組不出現；組內維持新增的先後
export function groupEquipment(items: KitchenEquipment[]): { key: GroupKey; items: KitchenEquipment[] }[] {
  return GROUP_ORDER.map((key) => ({ key, items: items.filter((i) => groupOf(i) === key) })).filter((g) => g.items.length > 0);
}

// 容量顯示原始值＋原始單位
export function formatCapacity(value: number | null, unit: string | null): string | null {
  return value != null && unit ? `${value} ${unit}` : null;
}

// 清單每列右邊的小標籤：品牌、容量
export function detailTags(item: KitchenEquipment): string[] {
  return [item.brand, formatCapacity(item.capacity_value, item.capacity_unit)].filter((t): t is string => !!t);
}

function availableIn(type: EquipmentType, region: string): boolean {
  return !type.deprecated && equipmentAvailableIn(type, region);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// 搜尋字典：名稱或別名包含關鍵字。沒打字就列出全部
export function searchTypes(query: string, region: string): EquipmentType[] {
  const q = norm(query);
  return equipmentTypes.filter(
    (t) => availableIn(t, region) && (!q || [t.name['zh-TW'], ...t.aliases['zh-TW']].some((n) => norm(n).includes(q))),
  );
}

// 輸入的名稱和字典的某個名稱一模一樣時，就不再提供「自己新增」
export function hasExactName(query: string, region: string): boolean {
  const q = norm(query);
  return !!q && equipmentTypes.some((t) => availableIn(t, region) && norm(t.name['zh-TW']) === q);
}

export function groupTypes(types: EquipmentType[]): { key: EquipmentCategory; types: EquipmentType[] }[] {
  return CATEGORY_ORDER.map((key) => ({ key, types: types.filter((t) => t.category === key) })).filter((g) => g.types.length > 0);
}

// 快速盤點的圖示牆：這個地區看得到、而且不是「藏起來」的廚具
export function inventoryWall(region: string): EquipmentType[] {
  return equipmentTypes.filter((t) => availableIn(t, region) && onboardingModeFor(t, region) !== 'hidden');
}

// 一開始勾哪些：廚房已登記的一定勾；廚房還一件都沒有時，再加上「大部分家庭都有」的預設
export function initialSelection(region: string, ownedTypeIds: Set<string>, kitchenHasAny: boolean): Set<string> {
  const selected = new Set(ownedTypeIds);
  if (!kitchenHasAny) {
    for (const t of inventoryWall(region)) if (onboardingModeFor(t, region) === 'default-on') selected.add(t.id);
  }
  return selected;
}
