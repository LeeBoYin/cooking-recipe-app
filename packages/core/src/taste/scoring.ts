// 口味分數：回答一題，怎麼更新喜好與把握程度（13 第四節〈分數怎麼更新〉）。純函式，不改傳進來的物件。
import type { DimensionState, QuizAnswer, TasteDimension, TasteProfile, TasteQuizItem } from './types.ts';

export const DISH_CARD_STRENGTH = { love: 1, try: 0.6, ok: 0.1, nope: -1 } as const;
export const QUICK_FIRE_STRENGTH = { love: 1, ok: 0, no: -1 } as const;
export const ANCESTOR_FACTOR = 0.5; // 上層維度同時更新，力道 ×0.5
export const NEUTRAL_CONFIDENCE_STRENGTH = 0.2; // 快問快答答「還好」：喜好不動，只加一點把握
export const SPECTRUM_CONFIDENCE = 0.8; // 光譜題直接把握拉到這裡
export const TRY_ADVENTURE_BONUS = 0.05; // 菜卡答「想試試」：挑戰意願 +0.05
export const MAX_GOALS = 20;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function parentOf(key: string, dims: ReadonlyMap<string, TasteDimension>): string | undefined {
  return dims.get(key)?.parentKey;
}

// 單一維度更新。s = 回答強度 × 權重（已含正負號）。「你設定的」不會被覆蓋。
function updateDimension(current: DimensionState | undefined, s: number, confidenceOnly: boolean, now: string): DimensionState | undefined {
  if (current?.source === 'user_set') return current;
  const c = current?.confidence ?? 0;
  const a = current?.affinity ?? 0;
  const mag = Math.abs(s);
  if (mag === 0) return current;
  const confidence = 1 - (1 - c) * (1 - 0.5 * mag);
  const affinity = confidenceOnly ? a : clamp((a * c + 0.5 * s) / (c + 0.5 * mag), -1, 1);
  return { affinity, confidence, source: 'explored', updatedAt: now };
}

// 把 { 維度: 力道 } 套進口味地圖，含上層維度（力道減半）。同一題裡若上層本來就在 mapping 中，以 mapping 為準。
function applyMapping(
  dims: Record<string, DimensionState>,
  strengths: Record<string, number>,
  confidenceOnly: boolean,
  dimByKey: ReadonlyMap<string, TasteDimension>,
  now: string,
): Record<string, DimensionState> {
  const out = { ...dims };
  const targets = new Map<string, number>();
  for (const [key, s] of Object.entries(strengths)) {
    targets.set(key, s);
  }
  for (const [key, s] of Object.entries(strengths)) {
    let parent = parentOf(key, dimByKey);
    let factor = ANCESTOR_FACTOR;
    const seen = new Set([key]);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      if (!(parent in strengths)) targets.set(parent, (targets.get(parent) ?? 0) + s * factor);
      parent = parentOf(parent, dimByKey);
      factor *= ANCESTOR_FACTOR;
    }
  }
  for (const [key, s] of targets) {
    const next = updateDimension(out[key], clamp(s, -1, 1), confidenceOnly, now);
    if (next) out[key] = next;
  }
  return out;
}

// 菜卡的主菜系：mapping 裡權重最大的 cuisine 維度（同分取先出現的）
export function mainCuisineKey(item: Pick<TasteQuizItem, 'mapping'>): string | undefined {
  let best: [string, number] | undefined;
  for (const [key, w] of Object.entries(item.mapping)) {
    if (!key.startsWith('cuisine.')) continue;
    if (!best || Math.abs(w) > best[1]) best = [key, Math.abs(w)];
  }
  return best?.[0];
}

// 這題的回答實際對各維度的力道（含正負號），用來更新分數，也用來偵測矛盾的回答
export function answerStrengths(item: TasteQuizItem, answer: QuizAnswer): Record<string, number> {
  switch (answer.type) {
    case 'dish_card': {
      const k = DISH_CARD_STRENGTH[answer.value];
      return scale(item.mapping, k);
    }
    case 'quick_fire': {
      const k = QUICK_FIRE_STRENGTH[answer.value];
      return scale(item.mapping, k);
    }
    case 'this_or_that': {
      const chosen = item.options?.[answer.choice]?.mapping ?? {};
      const other = item.options?.[answer.choice === 0 ? 1 : 0]?.mapping ?? {};
      const out = scale(chosen, 1);
      for (const [key, w] of Object.entries(scale(other, -0.5))) out[key] = (out[key] ?? 0) + w;
      return out;
    }
    default:
      return {};
  }
}

function scale(mapping: Record<string, number>, k: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, w] of Object.entries(mapping)) out[key] = w * k;
  return out;
}

function assertAnswerMatches(item: TasteQuizItem, answer: QuizAnswer) {
  if (item.type !== answer.type) throw new Error(`answer_type_mismatch: ${item.id} 是 ${item.type}，收到 ${answer.type}`);
}

// 回答一題，回傳新的口味地圖。
export function applyAnswer(
  profile: TasteProfile,
  item: TasteQuizItem,
  answer: QuizAnswer,
  dimensions: readonly TasteDimension[],
  now: string,
): TasteProfile {
  assertAnswerMatches(item, answer);
  const dimByKey = new Map(dimensions.map((d) => [d.key, d]));
  let dims = profile.dims;
  let context = profile.context;

  if (answer.type === 'dish_card' || answer.type === 'this_or_that') {
    dims = applyMapping(dims, answerStrengths(item, answer), false, dimByKey, now);
    if (answer.type === 'dish_card' && answer.value === 'try') {
      const cuisine = mainCuisineKey(item);
      context = {
        ...context,
        adventure: clamp(context.adventure + TRY_ADVENTURE_BONUS, 0, 1),
        goals: cuisine ? addGoal(context.goals, cuisine) : context.goals,
      };
    }
  } else if (answer.type === 'quick_fire') {
    if (answer.value === 'ok') {
      // 還好：喜好不動，只加把握
      dims = applyMapping(dims, scale(item.mapping, NEUTRAL_CONFIDENCE_STRENGTH), true, dimByKey, now);
    } else {
      dims = applyMapping(dims, answerStrengths(item, answer), false, dimByKey, now);
    }
  } else if (answer.type === 'spectrum') {
    const key = item.spectrum?.dimension;
    if (!key) throw new Error(`spectrum_missing: ${item.id}`);
    const current = dims[key];
    if (current?.source !== 'user_set') {
      dims = {
        ...dims,
        [key]: {
          affinity: -1 + 0.5 * answer.point,
          confidence: Math.max(current?.confidence ?? 0, SPECTRUM_CONFIDENCE),
          source: 'explored',
          updatedAt: now,
        },
      };
    }
  } else if (answer.type === 'context') {
    context = applyContextAnswer(context, item, answer.choices);
  }

  return {
    ...profile,
    dims,
    context,
    answeredItemIds: profile.answeredItemIds.includes(item.id) ? profile.answeredItemIds : [...profile.answeredItemIds, item.id],
  };
}

function addGoal(goals: string[], key: string): string[] {
  if (goals.includes(key) || goals.length >= MAX_GOALS) return goals;
  return [...goals, key];
}

// 情境題：不進喜好維度，寫進情境。
// 挑戰意願：選項的值當作基準，再加上探索中「想試試」累積的部分（目前值超出預設 0.2 的部分）。
function applyContextAnswer(context: TasteProfile['context'], item: TasteQuizItem, choices: number[]) {
  const picked = choices.flatMap((i) => {
    const o = item.options?.[i];
    return o ? [o] : [];
  });
  if (picked.length === 0) throw new Error(`context_choice_missing: ${item.id}`);
  const first = picked[0]!;
  let next = { ...context };
  switch (item.contextField) {
    case 'time_preference':
      next = { ...next, timePreference: first.value as NonNullable<TasteProfile['context']['timePreference']> };
      break;
    case 'cooks_for':
      next = { ...next, cooksFor: [...new Set(picked.map((o) => o.value as 'self' | 'partner' | 'family' | 'guests'))] };
      break;
    case 'adventure': {
      const bonus = Math.max(0, context.adventure - 0.2);
      next = { ...next, adventure: clamp(Number(first.value) + bonus, 0, 1) };
      break;
    }
    default:
      throw new Error(`context_field_missing: ${item.id}`);
  }
  if (first.addGoal) next = { ...next, goals: addGoal(next.goals, first.addGoal) };
  return next;
}
