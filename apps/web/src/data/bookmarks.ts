// 收藏（M0 只有大廚的點子）。權限由資料庫的 RLS 判斷；新增與取消一律走資料庫函式。
import { newId, type RecipeDraft } from '@zhusha/core';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type Bookmark = Row<'bookmarks'>;

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
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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
