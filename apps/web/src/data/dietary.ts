// 飲食限制（dietary_profiles）：過敏、飲食原則、不用料理酒、不吃的食物。權限由 RLS 判斷，只有本人能寫。
// 週期性規則（recurring_rules）產品不做，欄位留著不用。
import { supabase } from './supabase.ts';
import { currentUserId } from './account.ts';
import { newId } from '@zhusha/core';

export type Dietary = {
  allergenIds: string[];
  restrictionIds: string[];
  dislikeIngredientIds: string[];
  noCookingAlcohol: boolean;
};

export const EMPTY_DIETARY: Dietary = { allergenIds: [], restrictionIds: [], dislikeIngredientIds: [], noCookingAlcohol: false };

export async function getMyDietary(): Promise<Dietary> {
  const { data, error } = await supabase().from('dietary_profiles').select('*').maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_DIETARY;
  return {
    allergenIds: data.allergen_ids,
    restrictionIds: data.dietary_restriction_ids,
    dislikeIngredientIds: data.dislike_ingredient_ids,
    noCookingAlcohol: data.no_cooking_alcohol,
  };
}

// 註冊時已經建好一份空的；萬一沒有（舊帳號）就補一份
export async function saveMyDietary(value: Dietary): Promise<void> {
  const userId = await currentUserId();
  const fields = {
    allergen_ids: value.allergenIds,
    dietary_restriction_ids: value.restrictionIds,
    dislike_ingredient_ids: value.dislikeIngredientIds,
    no_cooking_alcohol: value.noCookingAlcohol,
  };
  const { data, error } = await supabase().from('dietary_profiles').update(fields).eq('user_id', userId).select('id');
  if (error) throw error;
  if (data.length > 0) return;
  const { error: insertError } = await supabase().from('dietary_profiles').insert({ id: newId(), user_id: userId, ...fields });
  if (insertError) throw insertError;
}
