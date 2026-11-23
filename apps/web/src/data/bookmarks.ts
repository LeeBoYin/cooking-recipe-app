// 收藏（M0 只有大廚的點子）。權限由資料庫的 RLS 判斷；新增與取消一律走資料庫函式。
import { newId, type RecipeDraft } from '@zhusha/core';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

// recipes：連到的那一篇食譜的狀態（只有從清單讀出來的才有；PostgREST 的 many-to-one 內嵌，連不到時是 null）
export type Bookmark = Row<'bookmarks'> & { recipes?: { status: string; deleted_at: string | null } | null };

// 收藏的點子「做過了」的狀態：看連到的那一篇現在怎麼了。連結本身不清掉，從最近刪除救回來就自己回來。
// - published：已發佈、沒刪除 → 「打開我記錄的那篇」
// - draft：草稿、沒刪除 → 「繼續編輯草稿」
// - none：沒連過、已刪除或那一篇不見了 → 當作沒記錄過（「做了，記錄一篇」）
export type CookedState = { kind: 'none' } | { kind: 'published' | 'draft'; recipeId: string };

export function cookedStateOf(b: Pick<Bookmark, 'cooked_recipe_id' | 'recipes'> | undefined): CookedState {
  const id = b?.cooked_recipe_id;
  if (!id) return { kind: 'none' };
  // 沒內嵌（剛由 RPC 回來、還沒重讀清單）時先當作已發佈，重讀後會校正
  const r = b.recipes;
  if (r === undefined) return { kind: 'published', recipeId: id };
  if (r === null || r.deleted_at) return { kind: 'none' };
  return { kind: r.status === 'draft' ? 'draft' : 'published', recipeId: id };
}

// 點子的快照（bookmarks.idea）
// 家常菜的點子有 baseDishId；AI 想的點子沒有，用 suggestionId（點子在快取裡的 id）＋菜名判斷重複
export type BookmarkIdea = { schemaVersion: 1; title: string; why?: string; baseDishId?: string; suggestionId?: string; origin?: { suggestionId: string; ideaId: string }; recipeDraft?: RecipeDraft };

export function ideaOf(b: Bookmark): BookmarkIdea {
  return b.idea as unknown as BookmarkIdea;
}

// 我的收藏，新的在前面
export async function listMyBookmarks(): Promise<Bookmark[]> {
  const { data, error } = await supabase()
    .from('bookmarks')
    .select('*, recipes!cooked_recipe_id(status, deleted_at)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Bookmark[];
}

// 收藏大廚的點子。同一道已經收藏就回傳既有那筆
// suggestionId＋ideaId：點子來自首頁或對話、已經展開過做法時，後端從快取讀出來一起存進收藏
export async function bookmarkIdea(v: { title: string; why?: string; baseDishId: string; suggestionId?: string; ideaId?: string }): Promise<Bookmark> {
  const { data, error } = await supabase().rpc('bookmark_recipe', {
    p_id: newId(),
    p_title: v.title,
    p_why: v.why ?? '',
    p_base_dish_id: v.baseDishId,
    ...(v.suggestionId && v.ideaId ? { p_suggestion_id: v.suggestionId, p_idea_id: v.ideaId } : {}),
  });
  if (error) throw error;
  return data;
}

// 收藏 AI 想的點子（首頁或對話）：理由與主要食材由後端從快取裡讀
export async function bookmarkAiIdea(v: { suggestionId: string; title: string }): Promise<Bookmark> {
  const { data, error } = await supabase().rpc('bookmark_ai_idea', { p_id: newId(), p_suggestion_id: v.suggestionId, p_title: v.title });
  if (error) throw error;
  return data;
}

export async function unbookmark(id: string): Promise<void> {
  const { error } = await supabase().rpc('unbookmark_recipe', { p_id: id });
  if (error) throw error;
}

// 從收藏記錄了自己的版本後，連到那一篇（有值就是「做過了」），同時記一筆「做了」的回饋（同一個動作，一起成功或一起不做）
export async function linkBookmarkToRecipe(id: string, recipeId: string): Promise<void> {
  const { error } = await supabase().rpc('record_bookmark_cooked', { p_bookmark: id, p_recipe: recipeId });
  if (error) throw error;
}
