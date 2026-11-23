// 食譜。權限由資料庫的 RLS 判斷；寫入一律經資料庫函式（save_recipe、publish_recipe…）：
// 衍生欄位（食材 ID、廚具、手法、難易度總分、cooked_on、cooked_dates）由資料庫算，這裡不送。
import type {
  CookNote,
  Diner,
  Dictation,
  Highlight,
  RecipeAiTags,
  RecipeDifficulty,
  RecipeIngredient,
  RecipeSource,
  RecipeStep,
  RecipeVisibility,
} from '@zhusha/shared-types';
import { newId } from '@zhusha/core';
import { currentUserId } from './account.ts';
import { listRecipePhotos, type Photo } from './photos.ts';
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
  cooked_at: string | null; // 時間點（ISO 8601）；cooked_on 由資料庫依廚房時區算
  kitchen_id: string | null; // 沒指定時用目前的廚房
  cook_notes: CookNote[];
  servings: number | null;
  difficulty: RecipeDifficulty | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tips: string | null;
  equipment_used_ids: string[];
  ai_tags: RecipeAiTags | null;
  source: RecipeSource | null;
  visibility: RecipeVisibility;
  parent_recipe_id: string | null;
};

export type RecipePatch = Partial<RecipeFields>;

// 上限的預設值（和 app_config 的預設一致；後台改了數字，資料庫會拒絕、畫面顯示沒有成功）
export const recipeLimits = { photos: 5, steps: 10, photosPerStep: 1, softDeleteDays: 30 } as const;

// save_recipe 的 p_photos：這篇食譜上方照片與步驟照片的完整清單（依序）。不在清單裡的會被刪掉，第一張上方照片是封面。
// 步驟照片的 owner_id 是步驟 ID；上方照片不用給。
export type RecipePhotoInput = {
  id: string;
  owner_type: 'recipe' | 'recipe_step';
  owner_id?: string;
  width: number;
  height: number;
  taken_at?: string;
};

export function photoInputs(rows: Photo[]): RecipePhotoInput[] {
  return rows.map((p) => ({
    id: p.id,
    owner_type: p.owner_type as RecipePhotoInput['owner_type'],
    ...(p.owner_type === 'recipe_step' ? { owner_id: p.owner_id } : {}),
    width: p.width,
    height: p.height,
    ...(p.taken_at ? { taken_at: p.taken_at } : {}),
  }));
}

// changedBy：這次存檔留下的版本是誰改的（已發佈的食譜才留版本）；不給就是作者自己
export type SaveOptions = { private?: RecipePrivatePatch; photos?: RecipePhotoInput[]; changedBy?: 'author' | 'ai_dictation' | 'ai_refine' };

// 作者的私人資料：口述原文、一起吃的人
export type RecipePrivatePatch = { dictation?: Dictation | null; diners?: Diner[] };

// 資料庫函式拒絕時的原因（error.message 的開頭）
export const recipeErrors = {
  conflict: 'recipe_conflict', // 這篇在別的地方改過了：請看過最新版再改
  notFound: 'recipe_not_found',
  deleted: 'recipe_deleted',
  empty: 'recipe_empty', // 發佈要有菜名和至少一張照片
  textTooLong: 'text_too_long', // text_too_long:欄位:上限:超過幾字
  photoLimit: 'photo_limit_reached',
  tooManySteps: 'too_many_steps',
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

// 我的食譜（不含已刪除的）。status 不給就是全部（草稿與已發佈）。
// 只取自己的：RLS 也放行同廚房家人的食譜，這裡要明確限定作者
export async function listMyRecipes(status?: Recipe['status']): Promise<Recipe[]> {
  const userId = await currentUserId();
  let query = supabase().from('recipes').select('*').eq('user_id', userId).is('deleted_at', null);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// 最近刪除的食譜（保留期限內可以復原）
export async function listMyDeletedRecipes(): Promise<Recipe[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase()
    .from('recipes')
    .select('*')
    .eq('user_id', userId)
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
  options: SaveOptions & { id?: string } = {},
): Promise<Recipe> {
  const id = options.id ?? newId();
  try {
    return await saveRecipe(id, patch, null, options);
  } catch (error) {
    if (isRecipeError(error, recipeErrors.conflict)) {
      const existing = await getRecipe(id);
      if (existing) return existing;
    }
    throw error;
  }
}

// 更新。只送有改的欄位；expectedUpdatedAt 是讀取時的 updated_at，不一致資料庫就拒絕（recipeErrors.conflict）。
// 衝突時用最新的 updated_at 自動重送（畫面上不處理衝突），最多重送 3 次。
export async function updateRecipe(
  id: string,
  patch: RecipePatch,
  expectedUpdatedAt: string,
  options: SaveOptions = {},
): Promise<Recipe> {
  let expected = expectedUpdatedAt;
  for (let attempt = 0; ; attempt++) {
    try {
      return await saveRecipe(id, patch, expected, options);
    } catch (error) {
      if (!isRecipeError(error, recipeErrors.conflict) || attempt >= 3) throw error;
      const latest = await getRecipe(id);
      if (!latest) throw error;
      expected = latest.updated_at;
    }
  }
}

async function saveRecipe(
  id: string,
  patch: RecipePatch,
  expectedUpdatedAt: string | null,
  options: SaveOptions,
): Promise<Recipe> {
  const { data, error } = await supabase().rpc('save_recipe', {
    p_recipe: { ...patch, id },
    ...(expectedUpdatedAt ? { p_expected_updated_at: expectedUpdatedAt } : {}),
    ...(options.private ? { p_private: options.private } : {}),
    ...(options.photos ? { p_photos: options.photos } : {}),
    ...(options.changedBy ? { p_changed_by: options.changedBy } : {}),
  });
  if (error) throw error;
  return data;
}

// 背景續傳完成、但編輯頁已經關掉時：把照片補進草稿（已發佈的要按「儲存」才改，這裡不動）。
// 放不進去（滿了、步驟沒了）就放棄，檔案由之後的維護工作掃孤兒檔。
export async function attachPhotoToDraft(recipeId: string, photo: RecipePhotoInput): Promise<void> {
  const recipe = await getRecipe(recipeId);
  if (!recipe || recipe.status !== 'draft' || recipe.deleted_at) return;
  const list = photoInputs(await listRecipePhotos(recipeId));
  if (list.some((p) => p.id === photo.id)) return;
  const sameSlot = list.filter((p) =>
    photo.owner_type === 'recipe' ? p.owner_type === 'recipe' : p.owner_id === photo.owner_id,
  );
  if (sameSlot.length >= (photo.owner_type === 'recipe' ? recipeLimits.photos : recipeLimits.photosPerStep)) return;
  await updateRecipe(recipeId, {}, recipe.updated_at, { photos: [...list, photo] });
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

export type RecipeMatch = { recipe_id: string; match_kind: 'title' | 'ingredient'; match_text: string };

// 搜尋自己已發佈的食譜：名稱與食材原文的關鍵字（不含心得）。空白的關鍵字回傳空的
export async function searchMyRecipes(query: string): Promise<RecipeMatch[]> {
  if (query.trim() === '') return [];
  const { data, error } = await supabase().rpc('search_my_recipes', { p_query: query });
  if (error) throw error;
  return data as RecipeMatch[];
}
