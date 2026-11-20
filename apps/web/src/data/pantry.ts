// 食材（廚房有什麼）。權限由資料庫的 RLS 判斷，這裡只負責讀寫。
// 新增、移除、復原一律走資料庫函式；直接改的只有放哪裡、想先用掉、期限、備註。
import { newId } from '@zhusha/core';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type PantryItem = Row<'pantry_items'>;
export type StorageZone = PantryItem['zone'];
export type DateType = NonNullable<PantryItem['date_type']>;

// 要加入的一樣食材。id 由手機產生；重送同一個 id 不會重複新增
export type NewPantryItem = {
  id?: string;
  raw_name: string;
  ingredient_id?: string | null;
  zone?: StorageZone;
  want_to_use_soon?: boolean;
  expires_at?: string | null; // YYYY-MM-DD，以廚房時區解讀
  date_type?: DateType | null;
  note?: string | null;
};

export type PantryItemPatch = Partial<
  Pick<PantryItem, 'zone' | 'want_to_use_soon' | 'expires_at' | 'date_type' | 'note'>
>;

// 廚房現在「有」的食材
export async function listPantryItems(kitchenId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase()
    .from('pantry_items')
    .select('*')
    .eq('kitchen_id', kitchenId)
    .eq('status', 'active')
    .order('added_on', { ascending: false });
  if (error) throw error;
  return data;
}

// 最近移除的食材（可復原），最近移除的在前面
export async function listRecentlyRemoved(kitchenId: string, days = 30): Promise<PantryItem[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase()
    .from('pantry_items')
    .select('*')
    .eq('kitchen_id', kitchenId)
    .eq('status', 'removed')
    .gte('removed_at', since)
    .order('removed_at', { ascending: false });
  if (error) throw error;
  return data;
}

// 一次加入多樣食材。已經有的只更新加入日期並保留較早的期限。回傳實際寫入的每一筆
export async function addPantryItems(kitchenId: string, items: NewPantryItem[]): Promise<PantryItem[]> {
  const payload = items.map((item) => ({ ...item, id: item.id ?? newId() }));
  const { data, error } = await supabase().rpc('add_pantry_items', {
    p_kitchen_id: kitchenId,
    p_items: payload,
  });
  if (error) throw error;
  return data;
}

export async function removePantryItem(id: string): Promise<PantryItem> {
  const { data, error } = await supabase().rpc('remove_pantry_item', { p_id: id });
  if (error) throw error;
  return data;
}

// 復原。同一種食材已經又被加回來時，併進現有那一筆並回傳它
export async function restorePantryItem(id: string): Promise<PantryItem> {
  const { data, error } = await supabase().rpc('restore_pantry_item', { p_id: id });
  if (error) throw error;
  return data;
}

export async function updatePantryItem(id: string, patch: PantryItemPatch): Promise<PantryItem> {
  const { data, error } = await supabase().from('pantry_items').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}
