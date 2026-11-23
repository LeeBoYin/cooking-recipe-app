// 食譜版本：只有作者讀得到；寫入一律經資料庫函式（save_recipe 與 restore_recipe_revision）。
import type { RecipeIngredient, RecipeStep } from '@zhusha/shared-types';
import { supabase } from './supabase.ts';
import type { Recipe } from './recipes.ts';
import type { Row } from './types.ts';

export type RecipeRevisionRow = Row<'recipe_revisions'>;

export type RevisionChangedBy = 'author' | 'ai_refine' | 'ai_dictation';

// 做法的內容（title、servings、difficulty、ingredients、steps、tips）
export type RevisionSnapshot = {
  title: string | null;
  servings: number | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tips: string | null;
};

export type RecipeRevision = Omit<RecipeRevisionRow, 'snapshot' | 'changed_by'> & {
  snapshot: RevisionSnapshot;
  changed_by: RevisionChangedBy;
};

// 新的在前
export async function listRecipeRevisions(recipeId: string): Promise<RecipeRevision[]> {
  const { data, error } = await supabase()
    .from('recipe_revisions')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('version', { ascending: false });
  if (error) throw error;
  return data as unknown as RecipeRevision[];
}

// 還原＝把那一版的內容當成新的一版寫入
export async function restoreRecipeRevision(recipe: Recipe, version: number): Promise<Recipe> {
  const { data, error } = await supabase().rpc('restore_recipe_revision', {
    p_recipe_id: recipe.id,
    p_version: version,
    p_expected_updated_at: recipe.updated_at,
  });
  if (error) throw error;
  return data;
}
