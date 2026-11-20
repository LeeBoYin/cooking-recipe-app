// 食譜。權限由資料庫的 RLS 判斷；寫入一律經資料庫函式（save_recipe、publish_recipe…）：
// 衍生欄位（食材 ID、廚具、手法、難易度總分、cooked_on、cooked_dates）由資料庫算，這裡不送。
import type {
  CookNote,
  Diner,
  Dictation,
  Highlight,
  Rating,
  RecipeAiTags,
  RecipeDifficulty,
  RecipeIngredient,
  RecipeSource,
  RecipeStep,
  RecipeVisibility,
} from '@zhusha/shared-types';
import { newId } from '@zhusha/core';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type Recipe = Row<'recipes'>;
export type RecipePrivate = Row<'recipe_private'>;

// 可以寫的欄位（和 save_recipe 的白名單一致）；沒送的欄位維持原值
export type RecipeFields = {
  lang: string;
  title: string | null;
  story: string | null;
  highlights: Highlight[];
  rating: Rating | null;
  cooked_at: string | null; // 時間點（ISO 8601）；cooked_on 由資料庫依廚房時區算
  kitchen_id: string | null; // 沒指定時用目前的廚房
  cook_notes: CookNote[];
  servings: number | null;
  difficulty: RecipeDifficulty | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tips: string | null;
  cuisine_keys: string[] | null;
  dish_type_keys: string[] | null;
  tags: string[];
  equipment_used_ids: string[];
  ai_tags: RecipeAiTags | null;
  source: RecipeSource | null;
  visibility: RecipeVisibility;
  parent_recipe_id: string | null;
};

export type RecipePatch = Partial<RecipeFields>;

// 作者的私人資料：口述原文、一起吃的人
export type RecipePrivatePatch = { dictation?: Dictation | null; diners?: Diner[] };

// 資料庫函式拒絕時的原因（error.message 的開頭）
export const recipeErrors = {
  conflict: 'recipe_conflict', // 這篇在別的地方改過了：請看過最新版再改
  notFound: 'recipe_not_found',
  deleted: 'recipe_deleted',
  empty: 'recipe_empty', // 發佈要有標題或至少一張照片
  textTooLong: 'text_too_long', // text_too_long:欄位:上限:超過幾字
  photoLimit: 'photo_limit_reached',
} as const;

export function isRecipeError(error: unknown, reason: (typeof recipeErrors)[keyof typeof recipeErrors]): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && String(error.message).startsWith(reason);
}

// 超過長度時，解出欄位、上限與超過幾字，給畫面顯示「還差多少」
export function parseTextTooLong(error: unknown): { field: string; limit: number; over: number } | null {
  if (!isRecipeError(error, recipeErrors.textTooLong)) return null;
  const [, field, limit, over] = String((error as { message: string }).message).split(':');
  if (!field || !limit || !over) return null;
  return { field, limit: Number(limit), over: Number(over) };
}

// 我的食譜（不含已刪除的）。status 不給就是全部（草稿與已發佈）
export async function listMyRecipes(status?: Recipe['status']): Promise<Recipe[]> {
  let query = supabase().from('recipes').select('*').is('deleted_at', null);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// 最近刪除的食譜（保留期限內可以復原）
export async function listMyDeletedRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase()
    .from('recipes')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase().from('recipes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRecipePrivate(recipeId: string): Promise<RecipePrivate | null> {
  const { data, error } = await supabase().from('recipe_private').select('*').eq('recipe_id', recipeId).maybeSingle();
  if (error) throw error;
  return data;
}

// 新增一篇草稿。id 由手機產生；重送同一個 id 不會產生兩筆（已經存在就回傳現有那一篇）
export async function createRecipe(
  patch: RecipePatch = {},
  options: { id?: string; private?: RecipePrivatePatch } = {},
): Promise<Recipe> {
  const id = options.id ?? newId();
  try {
    return await saveRecipe(id, patch, null, options.private);
  } catch (error) {
    if (isRecipeError(error, recipeErrors.conflict)) {
      const existing = await getRecipe(id);
      if (existing) return existing;
    }
    throw error;
  }
}

// 更新。只送有改的欄位；expectedUpdatedAt 是讀取時的 updated_at，不一致資料庫就拒絕（recipeErrors.conflict）
export async function updateRecipe(
  id: string,
  patch: RecipePatch,
  expectedUpdatedAt: string,
  priv?: RecipePrivatePatch,
): Promise<Recipe> {
  return saveRecipe(id, patch, expectedUpdatedAt, priv);
}

async function saveRecipe(
  id: string,
  patch: RecipePatch,
  expectedUpdatedAt: string | null,
  priv?: RecipePrivatePatch,
): Promise<Recipe> {
  const { data, error } = await supabase().rpc('save_recipe', {
    p_recipe: { ...patch, id },
    ...(expectedUpdatedAt ? { p_expected_updated_at: expectedUpdatedAt } : {}),
    ...(priv ? { p_private: priv } : {}),
  });
  if (error) throw error;
  return data;
}

// 發佈：要有標題或至少一張照片。已經發佈的重複呼叫沒有影響
export async function publishRecipe(id: string): Promise<Recipe> {
  const { data, error } = await supabase().rpc('publish_recipe', { p_id: id });
  if (error) throw error;
  return data;
}

export async function deleteRecipe(id: string): Promise<Recipe> {
  const { data, error } = await supabase().rpc('delete_recipe', { p_id: id });
  if (error) throw error;
  return data;
}

export async function restoreRecipe(id: string): Promise<Recipe> {
  const { data, error } = await supabase().rpc('restore_recipe', { p_id: id });
  if (error) throw error;
  return data;
}
