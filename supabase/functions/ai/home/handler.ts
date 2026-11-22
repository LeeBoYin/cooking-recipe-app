// home_ideas（M1a-06）：首頁的大廚點子。
// 流程（03〈第二階段〉）：讀資料 → L1 候選（core）→ 新手門檻 → 快取 → 呼叫 Claude → 驗證格式 → 程式再檢查 → 存快取 → 回傳。
// 快取：輸入的雜湊沒變、或離上次不到 6 小時，就用上次的（重新檢查過）；「換一組」同一個 6 小時內最多 2 次。
// AI 不能用、被擋下、或檢查後一個都不剩時回錯誤代號，手機改用 M0 的規則評分。紀錄只有數量與原因代號，不含內容。
import { type AiErrorCode, type ClaudeResponse, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import { recordOutcome, type Rpc } from '../usage.ts';
import { checkHomeOutput, normalizeTitle, recheckCachedIdeas } from './check.ts';
import { buildHomeEnv, type HomeEnv } from './env.ts';
import { withMergedTaste } from '../taste.ts';
import { buildHomePrompt, buildHomeSchema } from './prompt.ts';
import type { HomeContextRow, HomeIdea, HomePayload, HomeResponse, RawOutput } from './types.ts';

export const REUSE_HOURS = 6; // 離上次不到幾小時就用快取
export const CACHE_TTL_HOURS = 24; // 輸入沒變也最多用一天
export const MAX_SHUFFLES = 2; // 同一個 6 小時內最多換幾次
const HOUR_MS = 60 * 60 * 1000;

export type HomeResult = { ok: true; data: HomeResponse } | { ok: false; error: AiErrorCode };

export interface HomeDeps {
  ai: Deps;
  rpc: Rpc;
  now?: () => Date;
}

export function parseHomeInput(raw: unknown): { ok: true; shuffle: boolean } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, shuffle: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const { shuffle, ...rest } = raw as { shuffle?: unknown };
  if (Object.keys(rest).length > 0) return { ok: false };
  if (shuffle !== undefined && typeof shuffle !== 'boolean') return { ok: false };
  return { ok: true, shuffle: shuffle === true };
}

// 輸入的雜湊（食材、口味、廚具、地區與月份、時段、語言，再加飲食限制與語氣：改了這些就不能用舊的點子）。不存內容
export async function hashHomeInputs(env: HomeEnv): Promise<string> {
  const taste = Object.entries(env.profile.dims)
    .filter(([, d]) => d.confidence >= 0.5)
    .map(([k, d]) => [k, Math.round(d.affinity * 5) / 5])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const payload = {
    v: 1,
    locale: env.ctx.settings.locale,
    region: env.ctx.kitchen.region,
    month: env.month,
    band: env.band,
    date: env.today,
    persona: env.persona,
    occasional: env.occasional,
    pantry: env.pantry.map((p) => [p.id, p.soon, p.expiring]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    taste,
    adventure: env.profile.context.adventure,
    equipment: (env.owned ?? []).map((o) => [o.equipmentTypeId, [...(o.enabledOptionalTechniques ?? [])].sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    limits: env.limits,
    recipes: env.input.ownRecipes.map((r) => r.id).sort(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function payloadOf(raw: unknown): HomePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Partial<HomePayload>;
  if (p.schemaVersion !== 1 || !Array.isArray(p.ideas)) return null;
  return p as HomePayload;
}

export async function runHomeIdeas(deps: HomeDeps, userId: string, rawInput: unknown): Promise<HomeResult> {
  const parsed = parseHomeInput(rawInput);
  if (!parsed.ok) return { ok: false, error: 'invalid_input' };
  const now = (deps.now ?? (() => new Date()))();

  // 帳號與開關：和其他 AI 任務一致（快取命中也要是正常的帳號）
  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  const { data, error } = await deps.rpc('ai_home_context', { p_user: userId });
  if (error) {
    console.error('ai: ai_home_context failed', error.code);
    throw new Error('home_context');
  }
  if (!data) return { ok: true, data: { status: 'unavailable', reason: 'no_kitchen' } }; // 沒有廚房：沒有東西可以算
  const env = buildHomeEnv(await withMergedTaste(data as HomeContextRow, deps.rpc, userId, now), now);

  // 新手門檻（12）：口味不夠把握、又沒有自己的食譜，不叫 AI
  if (env.notEnough) return { ok: true, data: { status: 'not_enough' } };

  const hash = await hashHomeInputs(env);
  const latest = env.ctx.recent[0];
  const age = latest ? now.getTime() - Date.parse(latest.created_at) : Infinity;
  const usable = !!latest && now.getTime() < Date.parse(latest.expires_at) && (latest.input_hash === hash || age < REUSE_HOURS * HOUR_MS);
  const latestPayload = usable ? payloadOf(latest?.payload) : null;

  if (!parsed.shuffle && latest && latestPayload) {
    const ideas = recheckCachedIdeas(latestPayload.ideas, env);
    if (ideas.length > 0) {
      return { ok: true, data: { status: 'ok', source: 'cache', ideas, chefComment: latestPayload.chefComment, createdAt: latest.created_at, round: latest.round, suggestionId: latest.id } };
    }
    // 重新檢查後一個都不剩（例如剛改了過敏原）：重新產生
  }

  let round = 0;
  const shownTitles = new Set<string>();
  const shownRefs = new Set<string>();
  const shownText: string[] = [];
  if (parsed.shuffle && latest && latestPayload) {
    if (latest.round >= MAX_SHUFFLES) return { ok: true, data: { status: 'unavailable', reason: 'shuffle_limit' } }; // 換太多次：不再給新的
    round = latest.round + 1;
    for (const row of env.ctx.recent) {
      if (now.getTime() - Date.parse(row.created_at) >= REUSE_HOURS * HOUR_MS) continue;
      for (const i of payloadOf(row.payload)?.ideas ?? ([] as HomeIdea[])) {
        shownTitles.add(normalizeTitle(i.title));
        shownText.push(i.title);
        if (i.candidateRef) shownRefs.add(i.candidateRef);
      }
    }
  }
  // 沒有候選也呼叫 AI：只給變化版與新挑戰（熟悉的一定要指到候選，所以檢查會拿掉）

  // 呼叫 Claude：這一次的提示詞與 schema 已經組好，任務定義只是把它交給 runAi（用量保護、停用、預算降級都照常套用）
  const prompt = buildHomePrompt(env, { titles: shownText, refs: [...shownRefs] });
  const def: TaskDefinition<Record<string, never>> = {
    parseInput: () => ({ ok: true, value: {} }),
    buildPrompt: () => prompt,
    outputSchema: buildHomeSchema(env),
  };
  const result = await runAi({ ...deps.ai, tasks: { home_ideas: def as never } }, userId, 'home_ideas', { hash, round });
  if (!result.ok) {
    if (result.error === 'invalid_output') await recordOutcome(deps.rpc, userId, 'home_ideas', 'blocked');
    return result;
  }

  const checked = checkHomeOutput(result.output as RawOutput, env, { shownTitles, shownRefs });
  console.log('ai: home_ideas checked', JSON.stringify({ kept: checked.ideas.length, dropped: checked.dropped }));
  if (checked.ideas.length === 0) {
    await recordOutcome(deps.rpc, userId, 'home_ideas', 'blocked');
    return { ok: false, error: 'invalid_output' }; // 一個都不剩：畫面說現在想不出新點子
  }
  await recordOutcome(deps.rpc, userId, 'home_ideas', 'passed');

  const payload: HomePayload = { schemaVersion: 1, ideas: checked.ideas, chefComment: checked.chefComment, model: result.model };
  const saved = await deps.rpc('ai_home_cache_save', {
    p_user: userId, p_kitchen: env.ctx.kitchen.id, p_input_hash: hash, p_round: round, p_payload: payload, p_ttl_hours: CACHE_TTL_HOURS,
  });
  if (saved.error) console.error('ai: cache save failed', saved.error.code); // 存不到不影響這一次的回應
  return { ok: true, data: { status: 'ok', source: 'ai', ideas: checked.ideas, chefComment: checked.chefComment, createdAt: now.toISOString(), round, suggestionId: typeof saved.data === 'string' ? saved.data : null } };
}

export type { ClaudeResponse };
