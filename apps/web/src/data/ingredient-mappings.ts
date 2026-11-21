// 食材對應的手動修正（M1a-05）：「這個詞其實是這個食材」。只影響自己的資料，不影響別人與全站對應。
// 目前沒有畫面入口（後端先做好，畫面之後由規劃者決定）；寫入走資料庫函式。
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type MyIngredientMapping = Row<'user_ingredient_mappings'>;

// 我的所有修正
export async function listMyIngredientMappings(): Promise<MyIngredientMapping[]> {
  const { data, error } = await supabase().from('user_ingredient_mappings').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// 把一個詞改成某個字典食材：同時改掉自己已經存下的食材與食譜食材（原文不動），以後輸入這個詞也照這個對
export async function setMyIngredientMapping(rawText: string, ingredientId: string): Promise<void> {
  const { error } = await supabase().rpc('set_my_ingredient_mapping', { p_raw_text: rawText, p_ingredient_id: ingredientId });
  if (error) throw error;
}

// 拿掉修正：以後回到全站對應與字典；已經存下的食材維持現狀
export async function clearMyIngredientMapping(rawText: string): Promise<void> {
  const { error } = await supabase().rpc('clear_my_ingredient_mapping', { p_raw_text: rawText });
  if (error) throw error;
}
