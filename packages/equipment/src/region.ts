// 地區代碼的上層關係（廚具的 byRegion、regions 看上層：US-CA 也吃到標 US 的設定）
import type { EquipmentType } from './types.ts';

// 地區和它所有的上層，由近到遠：US-CA → ['US-CA', 'US']
export function regionChain(code: string): string[] {
  const parts = code.split('-');
  return parts.map((_, i) => parts.slice(0, parts.length - i).join('-'));
}

// 這個廚具在該地區找得到嗎：沒標 regions 代表各地都有；標 US 的，美國加州也算
export function equipmentAvailableIn(type: EquipmentType, region: string): boolean {
  return !type.regions || type.regions.length === 0 || regionChain(region).some((c) => type.regions!.includes(c));
}
