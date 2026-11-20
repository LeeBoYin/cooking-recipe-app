// 口味探索的一次流程：挑題（題型節奏表＋題目價值）、回答、停止條件。
// 全部是純函式：同樣的輸入與種子一定挑出同一題（13 第四節〈挑下一題的規則〉）。
import { createRng, hashSeed } from './rng.ts';
import { answerStrengths, applyAnswer } from './scoring.ts';
import type { QuizAnswer, TasteDimension, TasteProfile, TasteQuizItem } from './types.ts';

export type QuizMode = 'quick' | 'deep';
type RhythmSlot = 'dish_card' | 'this_or_that' | 'spectrum' | 'quick_fire';

export const RHYTHM: Record<QuizMode, RhythmSlot[]> = {
  quick: ['dish_card', 'dish_card', 'spectrum', 'dish_card', 'this_or_that', 'quick_fire', 'dish_card', 'spectrum', 'dish_card', 'this_or_that', 'dish_card', 'dish_card'],
  deep: ['dish_card', 'this_or_that', 'dish_card', 'spectrum', 'quick_fire', 'dish_card', 'this_or_that', 'dish_card', 'spectrum', 'dish_card', 'dish_card', 'this_or_that', 'dish_card', 'spectrum', 'dish_card'],
};

export const QUICK_FIRE_GROUP_SIZE: Record<QuizMode, number> = { quick: 4, deep: 6 };

export const STOP: Record<QuizMode, { coreConfidence: number; minAnswered: number; maxAnswered: number }> = {
  quick: { coreConfidence: 0.45, minAnswered: 8, maxAnswered: 12 },
  deep: { coreConfidence: 0.6, minAnswered: 0, maxAnswered: 25 },
};

export const CORE_IMPACT = 0.7; // 影響力 ≥ 這個值的維度算「核心維度」
export const FOLLOW_UP_BONUS = 1.3;
export const REPEAT_PENALTY = 0.3;
export const DISLIKED_PARENT_FACTOR = 0.2;
export const DISLIKED_PARENT_THRESHOLD = -0.2;
export const CONTRADICTION_MIN = 0.4;
const TOP_CANDIDATES = 3;

// 情境題固定排在最後，依這個順序問
const CONTEXT_ORDER = ['time_preference', 'cooks_for', 'adventure'] as const;

export interface QuizEnv {
  items: readonly TasteQuizItem[];
  dimensions: readonly TasteDimension[];
  regionCodes: readonly string[]; // 使用者地區與它的上層（例：['US-CA', 'US']）；題目的 regions 含其中任一個就會出現
  allergenIds: readonly string[]; // 硬限制：有這些過敏原的人不會看到對應題目
  restrictionIds: readonly string[];
}

interface AnswerRecord {
  itemId: string;
  strengths: Record<string, number>; // 各維度的回答力道（含正負號），情境題為空
  liked: boolean; // 回答偏正面，它的 followUps 才加分
}

export interface QuizSession {
  mode: QuizMode;
  seed: string;
  profile: TasteProfile;
  records: AnswerRecord[];
  slot: number; // 節奏表走到第幾格
  step: number; // 已經挑過幾次題（亂數用）
  contradictionAsked: boolean;
  baseCount: number; // 開始前已答的喜好題數（深入模式的上限是「總共」）
  asked: number; // 這次流程已問的喜好題數（快問快答一組算 1 題）
  finished: boolean;
}

export type QuizStep =
  | { kind: 'items'; phase: 'preference' | 'context'; items: TasteQuizItem[]; slot?: number; contradiction?: boolean } // 快問快答是一組，其他是一題；slot 是用掉的節奏格，contradiction 是插入的追問
  | { kind: 'done'; reason: 'confident' | 'limit' | 'no_more_questions' | 'finished' };

export function startSession(profile: TasteProfile, mode: QuizMode, seed: string, env: Pick<QuizEnv, 'items'>): QuizSession {
  return { mode, seed, profile, records: [], slot: 0, step: 0, contradictionAsked: false, baseCount: priorPreferenceCount(profile, env.items), asked: 0, finished: false };
}

// 開始前已答的喜好題數；之前答過的快問快答以快速模式的一組 4 題估算
function priorPreferenceCount(profile: TasteProfile, items: readonly TasteQuizItem[]): number {
  const types = new Map(items.map((i) => [i.id, i.type]));
  let others = 0;
  let quickFire = 0;
  for (const id of profile.answeredItemIds) {
    const type = types.get(id);
    if (!type || type === 'context') continue;
    if (type === 'quick_fire') quickFire++;
    else others++;
  }
  return others + Math.ceil(quickFire / QUICK_FIRE_GROUP_SIZE.quick);
}

// ---- 過濾 ----

function isEligible(item: TasteQuizItem, env: QuizEnv, answered: ReadonlySet<string>): boolean {
  if (item.deprecated || item.type === 'constraint') return false;
  if (answered.has(item.id)) return false;
  if (!item.regions.some((r) => env.regionCodes.includes(r))) return false;
  if (item.excludedAllergenIds?.some((a) => env.allergenIds.includes(a))) return false;
  if (item.excludedRestrictionIds?.some((r) => env.restrictionIds.includes(r))) return false;
  return true;
}

// 這題涉及的維度與權重（二選一取兩邊較大的）
function itemWeights(item: TasteQuizItem): Record<string, number> {
  if (item.type === 'spectrum') return item.spectrum ? { [item.spectrum.dimension]: 1 } : {};
  if (item.type === 'this_or_that') {
    const out: Record<string, number> = {};
    for (const o of item.options ?? []) {
      for (const [k, w] of Object.entries(o.mapping ?? {})) out[k] = Math.max(out[k] ?? 0, Math.abs(w));
    }
    return out;
  }
  return item.mapping;
}

// ---- 題目價值 ----

export function itemValue(item: TasteQuizItem, session: QuizSession, env: QuizEnv): number {
  const dimByKey = new Map(env.dimensions.map((d) => [d.key, d]));
  const weights = itemWeights(item);
  const keys = Object.keys(weights);
  let value = 0;
  let disliked = false; // 有任何一個維度的上層是不喜歡的，整題降權
  for (const key of keys) {
    const dim = dimByKey.get(key);
    if (!dim) continue;
    const confidence = session.profile.dims[key]?.confidence ?? 0;
    const parentAffinity = dim.parentKey ? session.profile.dims[dim.parentKey]?.affinity : undefined;
    if (parentAffinity !== undefined && parentAffinity < DISLIKED_PARENT_THRESHOLD) disliked = true;
    value += Math.abs(weights[key] ?? 0) * (1 - confidence) * dim.impact;
  }
  if (disliked) value *= DISLIKED_PARENT_FACTOR;
  const followed = session.records.some((r) => r.liked && env.items.find((i) => i.id === r.itemId)?.followUps?.includes(item.id));
  if (followed) value *= FOLLOW_UP_BONUS;
  if (keys.length > 0) {
    const asked = new Set(session.records.flatMap((r) => Object.keys(r.strengths)));
    const shared = keys.filter((k) => asked.has(k)).length;
    value -= (shared / keys.length) * REPEAT_PENALTY;
  }
  return value;
}

// 從價值前 3 名裡，依價值加權抽 n 個（不重複）
function drawTop(candidates: { item: TasteQuizItem; value: number }[], n: number, pool: number, rng: () => number): TasteQuizItem[] {
  const sorted = [...candidates].sort((a, b) => b.value - a.value || a.item.id.localeCompare(b.item.id)).slice(0, pool);
  const out: TasteQuizItem[] = [];
  while (out.length < n && sorted.length > 0) {
    const weights = sorted.map((c) => Math.max(c.value, 0.001));
    const total = weights.reduce((x, y) => x + y, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < sorted.length - 1; idx++) {
      r -= weights[idx] ?? 0;
      if (r < 0) break;
    }
    const [picked] = sorted.splice(idx, 1);
    if (picked) out.push(picked.item);
  }
  return out;
}

// ---- 進度與停止 ----

// 已回答的喜好題數（快問快答一組算 1 題）。深入模式的上限是「總共」，所以含開始前答過的。
export function preferenceAnsweredCount(session: QuizSession): number {
  return session.baseCount + session.asked;
}

export function coreConfidence(profile: TasteProfile, dimensions: readonly TasteDimension[]): number {
  const core = dimensions.filter((d) => d.impact >= CORE_IMPACT && !d.deprecated);
  if (core.length === 0) return 1;
  const sum = core.reduce((s, d) => s + (profile.dims[d.key]?.confidence ?? 0), 0);
  return sum / core.length;
}

function shouldStop(session: QuizSession, env: QuizEnv): 'confident' | 'limit' | undefined {
  const rule = STOP[session.mode];
  const answered = preferenceAnsweredCount(session);
  if (answered >= rule.maxAnswered) return 'limit';
  if (answered >= rule.minAnswered && coreConfidence(session.profile, env.dimensions) >= rule.coreConfidence) return 'confident';
  return undefined;
}

// 同一個維度先後收到方向相反、力道都 ≥ 0.4 的回答 → 回傳該維度
function contradictedDimensions(session: QuizSession): string[] {
  const pos = new Set<string>();
  const neg = new Set<string>();
  for (const r of session.records) {
    for (const [k, s] of Object.entries(r.strengths)) {
      if (s >= CONTRADICTION_MIN) pos.add(k);
      else if (s <= -CONTRADICTION_MIN) neg.add(k);
    }
  }
  return [...pos].filter((k) => neg.has(k)).sort();
}

// ---- 挑下一步 ----

export function nextStep(session: QuizSession, env: QuizEnv): QuizStep {
  if (session.finished) return { kind: 'done', reason: 'finished' };
  const answered = new Set(session.profile.answeredItemIds);
  const eligible = env.items.filter((i) => isEligible(i, env, answered));
  const rng = createRng(hashSeed(session.seed, session.mode, session.step));

  const stop = shouldStop(session, env);
  if (!stop) {
    // 矛盾時追問：插入該維度的光譜題（不佔節奏表的格子）
    if (!session.contradictionAsked) {
      const dims = contradictedDimensions(session);
      const spectra = eligible.filter((i) => i.type === 'spectrum' && i.spectrum && dims.includes(i.spectrum.dimension));
      if (spectra.length > 0) {
        const [pick] = drawTop(spectra.map((item) => ({ item, value: itemValue(item, session, env) })), 1, 1, rng);
        if (pick) return { kind: 'items', phase: 'preference', items: [pick], contradiction: true };
      }
    }
    const rhythm = RHYTHM[session.mode];
    for (let slot = session.slot; slot < rhythm.length; slot++) {
      const type = rhythm[slot];
      const pool = eligible.filter((i) => i.type === type);
      if (pool.length === 0) continue; // 這格沒題目可出，改出下一格的題型
      const scored = pool.map((item) => ({ item, value: itemValue(item, session, env) }));
      const n = type === 'quick_fire' ? QUICK_FIRE_GROUP_SIZE[session.mode] : 1;
      const picked = drawTop(scored, n, type === 'quick_fire' ? n + 2 : TOP_CANDIDATES, rng);
      if (picked.length > 0) return { kind: 'items', phase: 'preference', items: picked, slot };
    }
  }

  // 情境題固定排在最後（只有快速模式問；深入模式已經問過了）
  for (const field of CONTEXT_ORDER) {
    const ctx = eligible.find((i) => i.type === 'context' && i.contextField === field);
    if (ctx) return { kind: 'items', phase: 'context', items: [ctx] };
  }
  return { kind: 'done', reason: stop ?? 'no_more_questions' };
}

// ---- 回答 ----

// answers：和 step.items 一一對應（快問快答一組有多個）。回傳新的流程；原本的不變。
export function submitAnswers(
  session: QuizSession,
  step: Extract<QuizStep, { kind: 'items' }>,
  answers: readonly QuizAnswer[],
  env: QuizEnv,
  now: string,
): QuizSession {
  if (answers.length !== step.items.length) throw new Error('answer_count_mismatch');
  let profile = session.profile;
  const records = [...session.records];
  step.items.forEach((item, i) => {
    const answer = answers[i]!;
    profile = applyAnswer(profile, item, answer, env.dimensions, now);
    const strengths = answerStrengths(item, answer);
    const liked = (answer.type === 'dish_card' && (answer.value === 'love' || answer.value === 'try')) || (answer.type === 'quick_fire' && answer.value === 'love');
    records.push({ itemId: item.id, strengths, liked });
  });

  const slot = step.phase === 'preference' && !step.contradiction && step.slot !== undefined ? step.slot + 1 : session.slot;
  return {
    ...session,
    profile,
    records,
    slot,
    step: session.step + 1,
    asked: session.asked + (step.phase === 'preference' ? 1 : 0),
    contradictionAsked: session.contradictionAsked || step.contradiction === true,
  };
}

// 結束（按「結束」或「先這樣」）：回傳要寫入的口味地圖
export function finishSession(session: QuizSession, now: string): { session: QuizSession; profile: TasteProfile } {
  const profile = { ...session.profile, lastExploredAt: now };
  return { session: { ...session, finished: true, profile }, profile };
}
