import { getIngredient, type IngredientCategory, type StorageZone } from '@zhusha/ingredients';
import type { PantryItem } from '../../data/pantry.ts';

export const ZONES: StorageZone[] = ['seasoning', 'fridge', 'freezer', 'pantry'];
export const ZONE_EMOJI: Record<StorageZone, string> = { seasoning: '🧂', fridge: '❄️', freezer: '🧊', pantry: '🥫' };

// 圖示先用 emoji 佔位，之後和其他圖示一起換成手繪（17 第七節）
const CATEGORY_EMOJI: Record<IngredientCategory, string> = {
  vegetable: '🥬', fruit: '🍎', mushroom: '🍄', meat: '🥩', poultry: '🍗', seafood: '🐟', egg: '🥚', dairy: '🥛',
  'tofu-bean': '🫘', grain: '🍚', noodle: '🍜', seasoning: '🧂', sauce: '🫙', spice: '🌶️', herb: '🌿', oil: '🫒',
  'nut-seed': '🥜', 'dried-goods': '🥫', processed: '🥫', beverage: '🥤', other: '🍽️',
};

export function emojiFor(ingredientId: string | null | undefined): string {
  const ing = getIngredient(ingredientId);
  return ing ? CATEGORY_EMOJI[ing.category] : '🍽️';
}

// 有對應字典就用字典的名稱，沒有就用使用者輸入的
export function displayName(item: Pick<PantryItem, 'ingredient_id' | 'raw_name'>): string {
  return getIngredient(item.ingredient_id)?.name['zh-TW'] ?? item.raw_name;
}
