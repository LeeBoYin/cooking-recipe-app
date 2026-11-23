// 替代做法（07 第三節）：少了某件廚具時，還能用什麼做出同一個手法。字典檔是 substitutes.json。
// 「做得到」的判斷見 can-do.ts：廚具直接能做 → 做得到；否則看有沒有符合條件的替代做法。
import substitutesData from '../substitutes.json' with { type: 'json' };
import { canDo, type OwnedEquipment } from './can-do.ts';
import { getEquipmentType } from './index.ts';
import type { TechniqueId } from './types.ts';

// 一組條件，裡面列的每一項都要成立；空物件代表什麼廚具都不需要（例如手揉）
export interface SubstituteNeed {
  anyEquipment?: string[]; // 這些廚具類型至少有一件（鍋具類還要有爐具）
  allEquipment?: string[]; // 這些廚具類型每一種都要有
  anyTechnique?: TechniqueId[]; // 這些手法至少有一個做得到
  enabledOptional?: TechniqueId; // 上面 anyEquipment 裡，要有一件勾了這個選配功能
}

export interface Substitute {
  id: string;
  technique: TechniqueId; // 想做的手法
  missing: string; // 少了什麼（說明用）
  use: string; // 改用的做法
  limit: string; // 限制，跟著推薦一起顯示
  needs: SubstituteNeed | SubstituteNeed[]; // 陣列：任一組成立即可
  safetyRuleId?: string;
  shortOnly?: boolean; // 只能搭配舒肥預設組合表中標記「短時間」的組合
}

export const substitutes = (substitutesData as { substitutes: Substitute[] }).substitutes;

function hasEquipment(typeId: string, owned: OwnedEquipment[], hasHeatSource: boolean): OwnedEquipment | undefined {
  const type = getEquipmentType(typeId);
  if (!type || (type.requiresHeatSource && !hasHeatSource)) return undefined;
  return owned.find((o) => o.equipmentTypeId === typeId);
}

function needMet(need: SubstituteNeed, owned: OwnedEquipment[]): boolean {
  const hasHeatSource = owned.some((o) => getEquipmentType(o.equipmentTypeId)?.isHeatSource);
  if (need.allEquipment && !need.allEquipment.every((id) => owned.some((o) => o.equipmentTypeId === id))) return false;
  if (need.anyEquipment) {
    const found = need.anyEquipment.flatMap((id) => hasEquipment(id, owned, hasHeatSource) ?? []);
    const ok = need.enabledOptional ? found.some((o) => o.enabledOptionalTechniques?.includes(need.enabledOptional!)) : found.length > 0;
    if (!ok) return false;
  }
  if (need.anyTechnique && !need.anyTechnique.some((t) => canDo(t, owned))) return false;
  return true;
}

// 使用者現有的廚具能用哪些替代做法做出這個手法（廚具本身就能做時，也列出來給參考）
export function findSubstitutes(technique: TechniqueId, owned: OwnedEquipment[]): Substitute[] {
  return substitutes.filter((s) => s.technique === technique && (Array.isArray(s.needs) ? s.needs : [s.needs]).some((n) => needMet(n, owned)));
}

// 做得到，或有替代做法（L1 的可行性檢查、手法清單用這個）
export function canDoOrSubstitute(technique: TechniqueId, owned: OwnedEquipment[]): boolean {
  return canDo(technique, owned) || findSubstitutes(technique, owned).length > 0;
}

// 廚房所有「做得到或有替代做法」的手法
export function doableOrSubstitutedTechniques(owned: OwnedEquipment[], all: TechniqueId[]): TechniqueId[] {
  return all.filter((t) => canDoOrSubstitute(t, owned));
}
