// 靈感彩蛋的程式再檢查：和首頁點子同一套（過敏原、飲食限制、廚具做得到、不催促、不寫帶單位的數字），再加兩條：
// 一定要用到程式挑的那一樣；那一句話不超過上限。不合格就整個不出現，不補。純函式。
import { checkHomeOutput, type CheckResult } from '../home/check.ts';
import type { HomeEnv } from '../home/env.ts';
import type { HomeIdea, RawIdea } from '../home/types.ts';
import { EGG_MAX_WHY } from './prompt.ts';
import { EGG_BLOCKED_TECHNIQUES, type EggFeature } from './pick.ts';

export type EggDrop = keyof NonNullable<CheckResult['dropped']> | 'feature_not_used' | 'why_too_long' | 'no_idea' | 'blocked_technique';

export function checkEgg(raw: unknown, env: HomeEnv, feature: EggFeature, makeId?: () => string): { idea: HomeIdea | null; dropped: Partial<Record<EggDrop, number>> } {
  const idea = typeof raw === 'object' && raw !== null ? (raw as { idea?: unknown }).idea : undefined;
  if (typeof idea !== 'object' || idea === null) return { idea: null, dropped: { no_idea: 1 } };
  const checked = checkHomeOutput(
    { suggestions: [idea as RawIdea], chef_comment: '' },
    env,
    { slotLimits: { familiar: 0, twist: 1, adventure: 0 }, maxIdeas: 1, ...(makeId ? { makeId } : {}) },
  );
  const out = checked.ideas[0];
  if (!out) return { idea: null, dropped: checked.dropped };
  if (out.techniques.some((t) => EGG_BLOCKED_TECHNIQUES.has(t))) return { idea: null, dropped: { blocked_technique: 1 } };
  const uses = feature.kind === 'sauce' ? out.usesPantryIds.includes(feature.id) : out.equipment.includes(feature.id);
  if (!uses) return { idea: null, dropped: { feature_not_used: 1 } };
  if ([...out.why].length > EGG_MAX_WHY) return { idea: null, dropped: { why_too_long: 1 } };
  return { idea: out, dropped: {} };
}
