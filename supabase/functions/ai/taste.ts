// 口味檔案（03〈口味檔案〉）：home、chat、expand 讀口味前，快照過期或不存在就先用 core 重算、存回去，再拿來用。
// ai_home_context 在快照新鮮時直接給 taste_snapshot；過期或不存在時另外給 taste_inputs（重算用的原始資料）。
import { computeTasteProfile, fromSnapshotData, toSnapshotData, type ChatSignal, type ComputedTaste, type SavedIdeaSignal, type TasteSnapshotData } from '../../../packages/core/src/index.ts';
import { baseDishes } from '../../../packages/taste/src/index.ts';
import { dimensionKeys, ideaIngredients, profileFrom } from './home/env.ts';
import type { HomeContextRow } from './home/types.ts';
import type { Rpc } from './usage.ts';

const dishById = new Map(baseDishes.map((d) => [d.id, d]));

export function savedFrom(rows: NonNullable<HomeContextRow['taste_inputs']>['saved']): SavedIdeaSignal[] {
  return rows.map((r) => {
    const d = r.base_dish_id ? dishById.get(r.base_dish_id) : undefined;
    return {
      dish: d ? { cuisineKeys: d.cuisineKeys, ingredientIds: d.ingredientIds, techniques: d.techniques } : { cuisineKeys: [], ingredientIds: r.ingredient_ids, techniques: [] },
      at: r.at,
      cooked: r.cooked,
    };
  });
}

export function signalsFrom(rows: NonNullable<HomeContextRow['taste_inputs']>['signals']): ChatSignal[] {
  return rows.flatMap((c, i) =>
    (c.signals ?? []).flatMap((s) =>
      typeof s.dimension_key === 'string' && typeof s.affinity === 'number' && (s.scope === 'long_term' || s.scope === 'today')
        ? [{ conversation: `c${i}`, dimensionKey: s.dimension_key, affinity: s.affinity, scope: s.scope, at: c.at }]
        : []),
  );
}

// 用 ai_home_context 的原始資料算出合併後的口味（不碰資料庫）
export function computeTasteFromContext(ctx: HomeContextRow, now: Date): ComputedTaste {
  const inputs = ctx.taste_inputs ?? { saved: [], signals: [] };
  return computeTasteProfile({
    base: profileFrom(ctx.taste).profile,
    saved: savedFrom(inputs.saved),
    chatSignals: signalsFrom(inputs.signals),
    pantryIngredientIds: ctx.pantry.map((p) => p.ingredient_id),
    ingredients: ideaIngredients,
    dimensionKeys,
    now: now.toISOString(),
  });
}

// 回傳加上合併口味（merged_taste）的 context。快照新鮮就直接用；否則重算並存回去（存失敗只記代號，這一次照用算好的）
export async function withMergedTaste(ctx: HomeContextRow, rpc: Rpc, userId: string, now: Date): Promise<HomeContextRow> {
  const snap = ctx.taste_snapshot;
  if (snap && !snap.stale) return { ...ctx, merged_taste: fromSnapshotData(snap.data) };
  const merged = computeTasteFromContext(ctx, now);
  const { error } = await rpc('taste_profile_save', { p_user: userId, p_data: toSnapshotData(merged) satisfies TasteSnapshotData, p_read_at: ctx.read_at ?? now.toISOString() });
  if (error) console.error('ai: taste_profile_save failed', error.code);
  return { ...ctx, merged_taste: merged };
}
