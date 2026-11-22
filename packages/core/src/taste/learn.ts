// 口味檔案的多來源計算（03〈口味檔案〉、13 第六節）。純函式，不改傳進來的物件；Deno 與瀏覽器都能跑。
// 輸入：口味地圖（探索與自己設定的）＋收藏的點子＋「做了」的點子＋對話裡說的長期偏好＋手邊的食材。
// 自己記錄的食譜要等發佈後整理寫好標籤才算（M1b），這裡還沒有。
// 規則：
//   • 「你設定的」（user_set）維度不會被隱含訊號覆蓋；探索來的（explored）也是明確的，只能調整強度與把握，喜好的正負號不會翻轉；
//   • 隱含訊號隨時間變輕，一年後剩一半；
//   • 同一個點子只算一次：收藏過又做了的，只算「做了」（權重較高那一個），不會兩個都加；
//   • 把握程度不夠的維度不會被擋掉，但下游（口味相似度、口味名片）本來就只看夠把握的。
import type { IdeaBaseDish, IdeaIngredient } from '../ideas/types.ts';
import { dishDimensionKeys } from '../ideas/score.ts';
import type { DimensionState, TasteProfile } from './types.ts';

export const SAVED_WEIGHT = 0.3; // 收藏的點子（中）
export const COOKED_WEIGHT = 0.5; // 做了並記錄的點子（中，比收藏高）
export const CHAT_SIGNAL_WEIGHT = 0.35; // 對話裡說的長期偏好（中）
export const PANTRY_WEIGHT = 0.04; // 手邊常有的食材（很小）
export const HALF_LIFE_DAYS = 365; // 隱含訊號一年後剩一半
// 快照超過幾天沒重算就當作過期（淡化才會發生）。資料庫的 ai_home_context 用同一個天數（30），改的時候兩邊一起改
export const SNAPSHOT_MAX_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// 收藏的點子：家常菜用基礎菜色的菜系、食材與手法；AI 想的點子只有主要食材
export interface SavedIdeaSignal {
  dish: Pick<IdeaBaseDish, 'cuisineKeys' | 'ingredientIds' | 'techniques'>;
  at: string; // 收藏的時間
  cooked: boolean; // 已經從這個收藏記錄了自己的版本
}

// 對話裡說的偏好。conversation：同一段對話裡對同一個維度只算最新的一次
export interface ChatSignal {
  conversation: string;
  dimensionKey: string;
  affinity: number; // −1 ～ +1
  scope: 'long_term' | 'today';
  at: string;
}

export interface TasteInputs {
  base: TasteProfile; // 口味探索與口味地圖
  saved: SavedIdeaSignal[];
  chatSignals: ChatSignal[];
  pantryIngredientIds: string[];
  ingredients: ReadonlyMap<string, IdeaIngredient>;
  dimensionKeys: ReadonlySet<string>;
  now: string; // ISO 時間
}

// 各來源貢獻了多少（只用來決定信心，不送給使用者看）
export interface TasteSources {
  quiz: boolean;
  saved: number; // 收藏了、還沒記錄的點子
  cooked: number; // 做了並記錄的點子
  signals: number; // 算進來的長期偏好
  pantry: number; // 算進來的手邊食材
}

export interface ComputedTaste extends TasteProfile {
  sources: TasteSources;
}

// 存進 taste_profile_snapshots.data 的格式
export interface TasteSnapshotData {
  schemaVersion: 1;
  dims: TasteProfile['dims'];
  context: TasteProfile['context'];
  sources: TasteSources;
}

interface Evidence {
  key: string;
  sign: 1 | -1;
  weight: number; // 0–1，還沒套用時間的淡化
  at: string;
}

function decayFactor(at: string, now: string): number {
  const age = (Date.parse(now) - Date.parse(at)) / DAY_MS;
  if (!Number.isFinite(age) || age <= 0) return 1;
  return 0.5 ** (age / HALF_LIFE_DAYS);
}

// 一筆隱含訊號更新一個維度；公式和口味探索的 updateDimension 一致（力道 = 權重 × 時間淡化）
function learn(current: DimensionState | undefined, e: Evidence, now: string): DimensionState | undefined {
  if (current?.source === 'user_set') return current;
  const mag = e.weight * decayFactor(e.at, now);
  if (mag <= 0) return current;
  const c = current?.confidence ?? 0;
  const a = current?.affinity ?? 0;
  const s = e.sign * mag;
  const confidence = 1 - (1 - c) * (1 - 0.5 * mag);
  let affinity = clamp((a * c + 0.5 * s) / (c + 0.5 * mag), -1, 1);
  // 探索的結果也算明確的：隱含訊號可以調整強度，但不能讓喜好的正負號翻轉
  if (current?.source === 'explored') affinity = a > 0 ? Math.max(0, affinity) : a < 0 ? Math.min(0, affinity) : affinity;
  const updatedAt = current && Date.parse(current.updatedAt) > Date.parse(e.at) ? current.updatedAt : e.at;
  return { affinity, confidence, source: current?.source ?? 'learned', updatedAt };
}

export function computeTasteProfile(input: TasteInputs): ComputedTaste {
  const { base, now } = input;
  const evidence: Evidence[] = [];
  const keysOf = (dish: SavedIdeaSignal['dish']) => dishDimensionKeys(dish, input.ingredients, input.dimensionKeys);

  let saved = 0;
  let cooked = 0;
  for (const s of input.saved) {
    // 一筆收藏只算一次：做了的用「做了」的權重，沒做的用收藏的權重
    if (s.cooked) cooked += 1;
    else saved += 1;
    for (const key of keysOf(s.dish)) evidence.push({ key, sign: 1, weight: s.cooked ? COOKED_WEIGHT : SAVED_WEIGHT, at: s.at });
  }

  // 對話：只算長期的；同一段對話裡同一個維度只留最新的一次
  const latest = new Map<string, ChatSignal>();
  for (const c of input.chatSignals) {
    if (c.scope !== 'long_term' || !input.dimensionKeys.has(c.dimensionKey) || !Number.isFinite(c.affinity) || c.affinity === 0) continue;
    const id = `${c.conversation}\u0000${c.dimensionKey}`;
    const prev = latest.get(id);
    if (!prev || Date.parse(c.at) >= Date.parse(prev.at)) latest.set(id, c);
  }
  for (const c of latest.values()) {
    evidence.push({ key: c.dimensionKey, sign: c.affinity > 0 ? 1 : -1, weight: CHAT_SIGNAL_WEIGHT * Math.min(1, Math.abs(c.affinity)), at: c.at });
  }

  const pantryIds = [...new Set(input.pantryIngredientIds)];
  for (const id of pantryIds) {
    for (const key of keysOf({ cuisineKeys: [], ingredientIds: [id], techniques: [] })) evidence.push({ key, sign: 1, weight: PANTRY_WEIGHT, at: now });
  }

  // 依時間先後套用（同時間維持原本的順序），結果才穩定
  const ordered = evidence.map((e, i) => ({ e, i })).sort((x, y) => Date.parse(x.e.at) - Date.parse(y.e.at) || x.i - y.i);
  const dims: Record<string, DimensionState> = { ...base.dims };
  for (const { e } of ordered) {
    const next = learn(dims[e.key], e, now);
    if (next) dims[e.key] = next;
  }

  const quiz = base.lastExploredAt !== undefined || Object.values(base.dims).some((d) => d.source !== 'learned');
  return {
    dims,
    context: base.context,
    answeredItemIds: [],
    ...(base.lastExploredAt !== undefined ? { lastExploredAt: base.lastExploredAt } : {}),
    sources: { quiz, saved, cooked, signals: latest.size, pantry: pantryIds.length },
  };
}

export function toSnapshotData(t: ComputedTaste): TasteSnapshotData {
  return { schemaVersion: 1, dims: t.dims, context: t.context, sources: t.sources };
}

export function fromSnapshotData(d: TasteSnapshotData): ComputedTaste {
  return { dims: d.dims, context: d.context, answeredItemIds: [], sources: d.sources };
}
