import { getEquipmentType } from './index.ts';
import type { TechniqueId } from './types.ts';

// 廚房裡的一件廚具，只取判斷需要的欄位
export interface OwnedEquipment {
  equipmentTypeId?: string | null; // 自訂廚具為空，不參與判斷
  enabledOptionalTechniques?: TechniqueId[] | null;
}

// 這件廚具實際能做的手法：字典的手法，加上使用者確認有的選配功能（只算字典列出的）
export function techniquesOf(item: OwnedEquipment): TechniqueId[] {
  const type = getEquipmentType(item.equipmentTypeId);
  if (!type) return [];
  const optional = new Set(type.optionalTechniques ?? []);
  const enabled = (item.enabledOptionalTechniques ?? []).filter((t) => optional.has(t));
  return [...new Set([...type.techniques, ...enabled])];
}

// 做不做得到：有一件廚具能做這個手法；需要爐火的廚具，還要有至少一個爐具（07）
export function canDo(technique: TechniqueId, owned: OwnedEquipment[]): boolean {
  const hasHeatSource = owned.some((o) => getEquipmentType(o.equipmentTypeId)?.isHeatSource);
  return owned.some((o) => {
    const type = getEquipmentType(o.equipmentTypeId);
    if (!type || !techniquesOf(o).includes(technique)) return false;
    return !type.requiresHeatSource || hasHeatSource;
  });
}

// 廚房所有做得到的手法
export function doableTechniques(owned: OwnedEquipment[]): TechniqueId[] {
  const all = new Set(owned.flatMap(techniquesOf));
  return [...all].filter((t) => canDo(t, owned));
}
