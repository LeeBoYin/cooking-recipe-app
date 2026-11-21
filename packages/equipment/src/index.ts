// 廚具字典、手法字典，以及「做不做得到」的判斷（見 07）。前端與 Edge Functions 共用，部署時也匯入資料庫的 dict_* 表。
// 替代做法、安全規則等推薦功能要用時再加進來。
import equipmentTypesData from '../data/equipment-types.json' with { type: 'json' };
import techniquesData from '../data/techniques.json' with { type: 'json' };
import { regionChain } from './region.ts';
import type { EquipmentType, OnboardingMode, Technique } from './types.ts';

export * from './types.ts';
export * from './can-do.ts';
export * from './region.ts';
export * from './safety.ts';

export const EQUIPMENT_VERSION = '0.1.0';

export const techniques = techniquesData as Technique[];
export const equipmentTypes = equipmentTypesData as EquipmentType[];

const equipmentById = new Map(equipmentTypes.map((e) => [e.id, e]));

export function getEquipmentType(id: string | null | undefined): EquipmentType | undefined {
  return id ? equipmentById.get(id) : undefined;
}

// 新手盤點與新增頁的預設狀態；沒有該地區的設定時用字典的預設
export function onboardingModeFor(type: EquipmentType, region: string): OnboardingMode {
  for (const code of regionChain(region)) {
    const mode = type.onboarding.byRegion?.[code];
    if (mode) return mode;
  }
  return type.onboarding.default;
}
