// 口味檔案（03〈口味檔案〉）：home、chat、expand 讀口味前，快照過期或不存在就先用 core 重算、存回去，再拿來用。
// ai_home_context 在快照新鮮時直接給 taste_snapshot；過期或不存在時另外給 taste_inputs（重算用的原始資料）。
import { computeTasteProfile, SNAPSHOT_MAX_AGE_DAYS, fromSnapshotData, toSnapshotData, type ChatSignal, type ComputedTaste, type RecordedRecipeSignal, type SavedIdeaSignal, type TasteSnapshotData } from '../../../packages/core/src/index.ts';
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

// 自己記錄、而且發佈後整理已經寫好標籤的食譜（taste_recorded_recipes 的回傳）；格式不對的略過
export interface RecordedRecipeRow {
  cuisine_keys?: unknown;
  main_ingredient_ids?: unknown;
  techniques?: unknown;
  highlights?: unknown;
  at?: unknown;
}
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export function recordedFrom(rows: RecordedRecipeRow[]): RecordedRecipeSignal[] {
  return rows.flatMap((r) =>
    typeof r.at === 'string' && Number.isFinite(Date.parse(r.at))
      ? [{ dish: { cuisineKeys: strings(r.cuisine_keys), ingredientIds: strings(r.main_ingredient_ids), techniques: strings(r.techniques) }, highlights: strings(r.highlights), at: r.at }]
      : [],
  );
}

// 用 ai_home_context 的原始資料算出合併後的口味（不碰資料庫）；recorded 是自己的食譜（另外讀）
export function computeTasteFromContext(ctx: HomeContextRow, now: Date, recorded: RecordedRecipeSignal[] = []): ComputedTaste {
  const inputs = ctx.taste_inputs ?? { saved: [], signals: [] };
  return computeTasteProfile({
    base: profileFrom(ctx.taste).profile,
    saved: savedFrom(inputs.saved),
    recorded,
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
  // 資料庫已經把超過 30 天的當過期；這裡再看一次（同一個常數），舊資料也不會凍住時間淡化
  const aged = snap?.computed_at !== undefined && now.getTime() - Date.parse(snap.computed_at) > SNAPSHOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  if (snap && !snap.stale && !aged) return { ...ctx, merged_taste: fromSnapshotData(snap.data) };
  // 自己的食譜（標籤寫好的）：讀失敗就這一次不算，不影響其他來源
  let recorded: RecordedRecipeSignal[] = [];
  try {
    const rec = await rpc('taste_recorded_recipes', { p_user: userId });
    if (rec.error) console.error('ai: taste_recorded_recipes failed', rec.error.code);
    else if (Array.isArray(rec.data)) recorded = recordedFrom(rec.data as RecordedRecipeRow[]);
  } catch {
    console.error('ai: taste_recorded_recipes failed', 'exception');
  }
  const merged = computeTasteFromContext(ctx, now, recorded);
  const { error } = await rpc('taste_profile_save', { p_user: userId, p_data: toSnapshotData(merged) satisfies TasteSnapshotData, p_read_at: ctx.read_at ?? now.toISOString() });
  if (error) console.error('ai: taste_profile_save failed', error.code);
  return { ...ctx, merged_taste: merged };
}
