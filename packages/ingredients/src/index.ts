// 標準食材字典，以及過敏原與飲食限制字典。前端與 Edge Functions 共用，部署時也匯入資料庫的 dict_* 表。
// 目前是範例資料（約 35 種食材），正式字典依 08「內容與資料準備」整理後替換；安全相關的標記上線前要人工審過。
import allergensData from '../data/allergens.json' with { type: 'json' };
import dietaryRestrictionsData from '../data/dietary-restrictions.json' with { type: 'json' };
import ingredientsData from '../data/ingredients.json' with { type: 'json' };
import type { Allergen, DietaryRestriction, Ingredient } from './types.ts';

export * from './types.ts';

export const allergens = allergensData as Allergen[];
export const ingredients = ingredientsData as Ingredient[];
export const dietaryRestrictions = dietaryRestrictionsData as DietaryRestriction[];

const allergenById = new Map(allergens.map((a) => [a.id, a]));

export function getAllergen(id: string): Allergen | undefined {
  return allergenById.get(id);
}

// 過敏原和它所有的上層（例：shrimp → crustacean）。選了上層的人，標了下層的食材也要排除
export function allergenWithAncestors(id: string): string[] {
  const out: string[] = [];
  let current = allergenById.get(id);
  while (current && !out.includes(current.id)) {
    out.push(current.id);
    current = current.parentId ? allergenById.get(current.parentId) : undefined;
  }
  return out;
}

export * from './regions.ts';
export * from './pantry.ts';
