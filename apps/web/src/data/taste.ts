// 我的口味地圖（preference_profiles）與飲食限制（dietary_profiles）。權限由資料庫的 RLS 判斷，只有本人能讀寫。
// 資料庫欄位用 snake_case，core 的口味地圖用 camelCase，進出時在這裡轉換。
import type { DimensionState, TasteContext, TasteProfile } from '@zhusha/core';
import type { Json } from '@zhusha/shared-types';

type Obj = NonNullable<Json>;
import { supabase } from './supabase.ts';
import { currentUserId } from './account.ts';
import type { Row } from './types.ts';

type ProfileRow = Row<'preference_profiles'>;

type DbDim = { affinity: number; confidence: number; source: DimensionState['source']; updated_at: string };
type DbContext = {
  time_preference?: TasteContext['timePreference'];
  cooks_for?: TasteContext['cooksFor'];
  adventure: number;
  goals: string[];
  festive_dishes: boolean;
  cooking_frequency?: string; // 只用來調整難度，探索不動它，存回時原樣保留
};

export function profileFromRow(row: Pick<ProfileRow, 'dims' | 'context' | 'answered_item_ids' | 'last_explored_at'>): TasteProfile {
  const dims: Record<string, DimensionState> = {};
  for (const [key, v] of Object.entries(row.dims as Record<string, DbDim>)) {
    dims[key] = { affinity: v.affinity, confidence: v.confidence, source: v.source, updatedAt: v.updated_at };
  }
  const c = row.context as unknown as DbContext;
  return {
    dims,
    context: {
      timePreference: c.time_preference,
      cooksFor: c.cooks_for,
      adventure: c.adventure,
      goals: c.goals,
      festiveDishes: c.festive_dishes,
    },
    answeredItemIds: row.answered_item_ids,
    lastExploredAt: row.last_explored_at ?? undefined,
  };
}

// previousContext：資料庫裡原本的情境，用來保留探索不碰的欄位（下廚頻率）
export function rowFromProfile(profile: TasteProfile, previousContext?: Json) {
  const prev = (previousContext ?? {}) as Partial<DbContext>;
  const context: DbContext = {
    adventure: profile.context.adventure,
    goals: profile.context.goals,
    festive_dishes: profile.context.festiveDishes,
  };
  if (profile.context.timePreference) context.time_preference = profile.context.timePreference;
  if (profile.context.cooksFor) context.cooks_for = profile.context.cooksFor;
  if (prev.cooking_frequency) context.cooking_frequency = prev.cooking_frequency;
  const dims: Record<string, DbDim> = {};
  for (const [key, v] of Object.entries(profile.dims)) {
    dims[key] = { affinity: v.affinity, confidence: v.confidence, source: v.source, updated_at: v.updatedAt };
  }
  return {
    dims: dims as unknown as Obj,
    context: context as unknown as Obj,
    answered_item_ids: profile.answeredItemIds,
    last_explored_at: profile.lastExploredAt ?? null,
  };
}

export async function getMyTasteProfile(): Promise<{ profile: TasteProfile; context: Json; cardTitle: string | null } | null> {
  const { data, error } = await supabase().from('preference_profiles').select('*').maybeSingle();
  if (error) throw error;
  return data ? { profile: profileFromRow(data), context: data.context, cardTitle: data.card_title } : null;
}

// 探索結束時一次寫入（13：中途關掉 App 不保留）
export async function saveTasteProfile(profile: TasteProfile, cardTitle: string | null, previousContext?: Json): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase()
    .from('preference_profiles')
    .update({ ...rowFromProfile(profile, previousContext), card_title: cardTitle })
    .eq('user_id', userId);
  if (error) throw error;
}

// 硬限制：有這些過敏原與飲食限制的人，不會看到對應的題目
export async function getMyHardLimits(): Promise<{ allergenIds: string[]; restrictionIds: string[] }> {
  const { data, error } = await supabase().from('dietary_profiles').select('allergen_ids, dietary_restriction_ids').maybeSingle();
  if (error) throw error;
  return { allergenIds: data?.allergen_ids ?? [], restrictionIds: data?.dietary_restriction_ids ?? [] };
}
