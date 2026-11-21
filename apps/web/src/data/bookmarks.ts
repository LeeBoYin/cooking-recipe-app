// 收藏（M0 只有大廚的點子）。權限由資料庫的 RLS 判斷；新增與取消一律走資料庫函式。
import { newId } from '@zhusha/core';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type Bookmark = Row<'bookmarks'>;

// 點子的快照（bookmarks.idea）
export type BookmarkIdea = { schemaVersion: 1; title: string; why?: string; baseDishId: string };

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
export async function bookmarkIdea(v: { title: string; why?: string; baseDishId: string }): Promise<Bookmark> {
  const { data, error } = await supabase().rpc('bookmark_recipe', {
    p_id: newId(),
    p_title: v.title,
    p_why: v.why ?? '',
    p_base_dish_id: v.baseDishId,
  });
  if (error) throw error;
  return data;
}

export async function unbookmark(id: string): Promise<void> {
  const { error } = await supabase().rpc('unbookmark_recipe', { p_id: id });
  if (error) throw error;
}

// 從收藏記錄了自己的版本後，連到那一篇（有值就是「做過了」）
export async function linkBookmarkToRecipe(id: string, recipeId: string): Promise<void> {
  const { error } = await supabase().from('bookmarks').update({ cooked_recipe_id: recipeId }).eq('id', id);
  if (error) throw error;
}
