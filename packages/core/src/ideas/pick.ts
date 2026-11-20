import { IDEA_MAX_DISH, IDEA_MAX_OWN, IDEA_MAX_TOTAL, IDEA_TOP_POOL } from './constants.ts';
import type { Idea, IdeaPool } from './types.ts';
import { createRng, hashSeed } from '../taste/rng.ts';

// 廚房時區的今天日期（YYYY-MM-DD）。只用標準的 Intl
export function todayInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// 依分數加權、不放回地抽；數量規則：自己的食譜最多 2、基礎菜色最多 3、合計最多 5
function pickOnce(candidates: Idea[], seed: number): Idea[] {
  const rng = createRng(seed);
  const rest = candidates.slice(0, IDEA_TOP_POOL);
  const picked: Idea[] = [];
  let own = 0;
  let dish = 0;
  while (rest.length > 0 && picked.length < IDEA_MAX_TOTAL) {
    const total = rest.reduce((sum, i) => sum + i.score, 0);
    let r = rng() * total;
    let index = rest.findIndex((i) => (r -= i.score) < 0);
    if (index < 0) index = rest.length - 1;
    const idea = rest.splice(index, 1)[0];
    if (!idea) break;
    if (idea.source === 'own' ? own >= IDEA_MAX_OWN : dish >= IDEA_MAX_DISH) continue; // 這種已滿，丟掉再抽
    if (idea.source === 'own') own += 1;
    else dish += 1;
    picked.push(idea);
  }
  return picked;
}

// 第 round 組（0 起算）。種子是「使用者＋今天日期」再加組數；前面出現過的不再出現，所以換幾次都不重複。
// 不需要記狀態：同一天、同一個使用者、同一組一定一樣。
export function ideaSet(pool: IdeaPool, seedKey: string, round: number): Idea[] {
  const shown = new Set<string>();
  let current: Idea[] = [];
  for (let r = 0; r <= round; r += 1) {
    current = pickOnce(pool.ideas.filter((i) => !shown.has(i.key)), hashSeed(seedKey, r));
    if (current.length === 0) return [];
    for (const i of current) shown.add(i.key);
  }
  return current;
}

// 還有沒有下一組（沒有就不再顯示「換一組」）
export function hasNextIdeaSet(pool: IdeaPool, seedKey: string, round: number): boolean {
  return ideaSet(pool, seedKey, round + 1).length > 0;
}
