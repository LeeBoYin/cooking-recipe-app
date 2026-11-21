import { getIngredient, type StorageZone } from '@zhusha/ingredients';
import type { IconName } from '../shell/Icon.tsx';
import type { PantryItem } from '../../data/pantry.ts';

export const ZONES: StorageZone[] = ['seasoning', 'fridge', 'freezer', 'pantry'];
export const ZONE_ICON: Record<StorageZone, IconName> = { seasoning: 'zoneSeasoning', fridge: 'zoneFridge', freezer: 'zoneFreezer', pantry: 'zonePantry' };

// 有對應字典就用字典的名稱，沒有就用使用者輸入的
export function displayName(item: Pick<PantryItem, 'ingredient_id' | 'raw_name'>): string {
  return getIngredient(item.ingredient_id)?.name['zh-TW'] ?? item.raw_name;
}
