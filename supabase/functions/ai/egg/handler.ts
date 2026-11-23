// inspiration_egg（M1b-04c）：首頁偶爾出現的靈感彩蛋。
// 流程：帳號與開關 → 讀彩蛋的狀態（每人滾動 7 天最多幾次、最近一個、最近用過的食材與廚具）→
//   24 小時內出現過的那一個就直接回（重新檢查過敏原與限制）→ 7 天內已達上限就不出現 → 程式挑一樣醬料或廚具 →
//   叫 Claude（Haiku 5.5）寫一句話＋一道菜 → 程式再檢查 → 存進快取（kind = 'easter_egg'）→ 回傳。
// 「不出現」（status: 'none'）不是錯誤：AI 不能用、預算用到 80%、沒有可挑的、沒過檢查都一樣，手機什麼都不顯示。
// 不計次數、不催促、不推播。紀錄只有數量與原因代號，不含內容。
import type { EggResponse } from '../../../../packages/core/src/index.ts';
import { type AiErrorCode, type Deps, hashInput, runAi, type TaskDefinition } from '../pipeline.ts';
import { recordOutcome, type Rpc } from '../usage.ts';
import { recheckCachedIdeas } from '../home/check.ts';
import { buildHomeEnv } from '../home/env.ts';
import type { HomeContextRow, HomeIdea } from '../home/types.ts';
import { withMergedTaste } from '../taste.ts';
import { checkEgg } from './check.ts';
import { pickEggFeature, type EggFeature } from './pick.ts';
import { buildEggPrompt, EGG_SCHEMA } from './prompt.ts';

export const EGG_SHOW_HOURS = 24; // 出現之後多久內再打開首頁還看得到同一個

export type EggResult = { ok: true; data: EggResponse } | { ok: false; error: AiErrorCode };

export interface EggDeps {
  ai: Deps;
  rpc: Rpc;
  now?: () => Date;
  rng?: () => number;
}

interface EggState {
  per_week: number;
  count_7d: number;
  latest: { id: string; created_at: string; expires_at: string; payload: unknown } | null;
  used_ingredient_ids: string[];
  used_equipment_ids: string[];
}

const NONE: EggResult = { ok: true, data: { status: 'none' } };

export function parseEggInput(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  return typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0;
}

function cachedEgg(latest: NonNullable<EggState['latest']>): { idea: HomeIdea; kind: 'sauce' | 'equipment' } | null {
  const p = latest.payload as { schemaVersion?: number; ideas?: HomeIdea[]; egg?: { kind?: string } } | null;
  const idea = p?.schemaVersion === 1 && Array.isArray(p.ideas) ? p.ideas[0] : undefined;
  const kind = p?.egg?.kind;
  if (!idea || (kind !== 'sauce' && kind !== 'equipment')) return null;
  return { idea, kind };
}

export async function runInspirationEgg(deps: EggDeps, userId: string, rawInput: unknown): Promise<EggResult> {
  if (!parseEggInput(rawInput)) return { ok: false, error: 'invalid_input' };
  const now = (deps.now ?? (() => new Date()))();

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  const st = await deps.rpc('ai_egg_state', { p_user: userId });
  if (st.error) {
    console.error('ai: ai_egg_state failed', st.error.code);
    throw new Error('egg_state');
  }
  const state = st.data as EggState | null;
  if (!state || state.per_week <= 0) return NONE;

  const home = await deps.rpc('ai_home_context', { p_user: userId });
  if (home.error) {
    console.error('ai: ai_home_context failed', home.error.code);
    throw new Error('home_context');
  }
  if (!home.data) return NONE; // 沒有廚房：沒有東西可以挑
  const env = buildHomeEnv(await withMergedTaste(home.data as HomeContextRow, deps.rpc, userId, now), now);
  if (env.notEnough) return NONE; // 新手門檻：首頁也不叫 AI，彩蛋不另外出現

  // 剛出現的那一個：24 小時內再打開首頁還看得到（重新檢查過，過敏原改了就不給）
  const latest = state.latest;
  if (latest && now.getTime() < Date.parse(latest.expires_at)) {
    const hit = cachedEgg(latest);
    if (hit && recheckCachedIdeas([hit.idea], env).length === 1) {
      return { ok: true, data: { status: 'ok', source: 'cache', idea: hit.idea, kind: hit.kind, createdAt: latest.created_at, suggestionId: latest.id } };
    }
    return NONE;
  }
  // 7 天內已經出現過上限的次數：不出現，也不叫 AI
  if (state.count_7d >= state.per_week) return NONE;

  const feature: EggFeature | null = pickEggFeature(
    env,
    { ingredientIds: new Set(state.used_ingredient_ids), equipmentIds: new Set(state.used_equipment_ids) },
    deps.rng,
  );
  if (!feature) return NONE;

  const prompt = buildEggPrompt(env, feature);
  const def: TaskDefinition<Record<string, never>> = {
    parseInput: () => ({ ok: true, value: {} }),
    buildPrompt: () => prompt,
    outputSchema: EGG_SCHEMA,
  };
  const result = await runAi({ ...deps.ai, tasks: { inspiration_egg: def as never } }, userId, 'inspiration_egg', { kind: feature.kind, id: feature.id });
  if (!result.ok) {
    // AI 不能用、預算 80%、被擋下、逾時…都一樣：不出現。帳號與開關的代號前面已經擋掉
    console.log('ai: inspiration_egg skipped', result.error);
    if (result.error === 'invalid_output') await recordOutcome(deps.rpc, userId, 'inspiration_egg', 'blocked');
    return NONE;
  }

  const checked = checkEgg(result.output, env, feature);
  console.log('ai: inspiration_egg checked', JSON.stringify({ kept: checked.idea ? 1 : 0, dropped: checked.dropped }));
  if (!checked.idea) {
    await recordOutcome(deps.rpc, userId, 'inspiration_egg', 'blocked');
    return NONE;
  }
  await recordOutcome(deps.rpc, userId, 'inspiration_egg', 'passed');

  const payload = { schemaVersion: 1, ideas: [checked.idea], chefComment: null, model: result.model, egg: { kind: feature.kind, id: feature.id } };
  const inputHash = await hashInput({ kind: feature.kind, id: feature.id, day: env.today });
  const saved = await deps.rpc('ai_egg_save', { p_user: userId, p_kitchen: env.ctx.kitchen.id, p_input_hash: inputHash, p_payload: payload, p_ttl_hours: EGG_SHOW_HOURS });
  // 存不到就不出現：沒存的彩蛋不能展開做法、收藏，也不會算進 7 天內的次數
  if (saved.error || typeof saved.data !== 'string') {
    if (saved.error) console.error('ai: ai_egg_save failed', saved.error.code);
    return NONE;
  }
  return { ok: true, data: { status: 'ok', source: 'ai', idea: checked.idea, kind: feature.kind, createdAt: now.toISOString(), suggestionId: saved.data } };
}
