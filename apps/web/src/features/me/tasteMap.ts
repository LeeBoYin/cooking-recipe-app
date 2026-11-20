// 我的口味地圖（13 第五節）的純函式：喜好程度的五個等級、改一項、哪些維度要列出來。
import type { DimensionState, TasteContext, TasteProfile } from '@zhusha/core';

export const LEVELS = [
  { id: 'love', affinity: 1 },
  { id: 'like', affinity: 0.5 },
  { id: 'neutral', affinity: 0 },
  { id: 'dislike', affinity: -0.5 },
  { id: 'hate', affinity: -1 },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

// 把握程度低於這裡、又不是使用者自己設的，顯示「還不確定」
export const UNSURE_BELOW = 0.2;

export function levelOf(affinity: number): LevelId {
  if (affinity >= 0.75) return 'love';
  if (affinity >= 0.25) return 'like';
  if (affinity > -0.25) return 'neutral';
  if (affinity > -0.75) return 'dislike';
  return 'hate';
}

// undefined：還不確定
export function displayLevel(state: DimensionState | undefined): LevelId | undefined {
  if (!state) return undefined;
  if (state.source !== 'user_set' && state.confidence < UNSURE_BELOW) return undefined;
  return levelOf(state.affinity);
}

// 使用者自己改：標成 user_set、把握拉滿，之後自動學習不會覆蓋
export function setDimension(profile: TasteProfile, key: string, level: LevelId, now: string): TasteProfile {
  const affinity = LEVELS.find((l) => l.id === level)?.affinity ?? 0;
  return { ...profile, dims: { ...profile.dims, [key]: { affinity, confidence: 1, source: 'user_set', updatedAt: now } } };
}

type Dim = { key: string; parentKey?: string; deprecated?: boolean };

// 樹狀的維度（菜系）：大區一律列出；底下的項目有紀錄、或大區喜歡才列出（先問大區，喜歡才往下）
export function visibleDimensions<T extends Dim>(dims: readonly T[], profile: TasteProfile): T[] {
  return dims.filter((d) => {
    if (d.deprecated) return false;
    if (!d.parentKey) return true;
    if (profile.dims[d.key]) return true;
    return (profile.dims[d.parentKey]?.affinity ?? 0) > 0.2;
  });
}

// 情境的選項
export const TIME_OPTIONS = ['quick', 'normal', 'relaxed'] as const;
export const ADVENTURE_LEVELS = [
  { id: 'safe', value: 0 },
  { id: 'sometimes', value: 0.3 },
  { id: 'curious', value: 0.6 },
  { id: 'always', value: 1 },
] as const;
export type AdventureId = (typeof ADVENTURE_LEVELS)[number]['id'];

export function adventureLevel(value: number): AdventureId {
  if (value < 0.15) return 'safe';
  if (value < 0.45) return 'sometimes';
  if (value < 0.75) return 'curious';
  return 'always';
}

export function setContext(profile: TasteProfile, patch: Partial<TasteContext>): TasteProfile {
  return { ...profile, context: { ...profile.context, ...patch } };
}

// 帳號列上的 email：只露出第一個字
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  return `${Array.from(name)[0]}•••@${domain}`;
}
