// 靈感彩蛋的測試（M1b-04c）：程式挑一樣醬料或廚具、AI 輸出的再檢查、整條流程（7 天上限、24 小時內不重算、AI 不能用不出現）。
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { AI_TASKS } from '../../_shared/ai-models.ts';
import { validate } from '../../_shared/json-schema.ts';
import { type AiContext, type ClaudeRequest, type Deps } from '../pipeline.ts';
import { buildHomeEnv, type HomeEnv } from '../home/env.ts';
import type { RawIdea } from '../home/types.ts';
import { checkEgg } from './check.ts';
import { EGG_SHOW_HOURS, parseEggInput, runInspirationEgg } from './handler.ts';
import { eggCandidates, pickEggFeature } from './pick.ts';
import { buildEggPrompt, EGG_MAX_WHY, EGG_SCHEMA, EGG_STABLE } from './prompt.ts';
import { EGG_CASES, NOW } from './eval/cases.ts';

const byId = (id: string) => EGG_CASES.find((c) => c.id.startsWith(id))!;
const envOf = (id: string): HomeEnv => buildHomeEnv(byId(id).ctx, NOW);
const NONE_USED = { ingredientIds: new Set<string>(), equipmentIds: new Set<string>() };
const DIFF = { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 1 };

function rawFor(env: HomeEnv, id: string, over: Partial<RawIdea> = {}): RawIdea {
  const f = byId(id).feature;
  return {
    slot: 'twist', candidate_ref: '', title: '測試炒飯', why: `你有${f.name}，來個簡單的。`,
    uses_pantry_ids: f.kind === 'sauce' ? [f.id] : [], uses_priority_ids: [], other_ingredients: [], difficulty: DIFF,
    techniques: env.techniqueEnum.slice(0, 1), equipment: f.kind === 'equipment' ? [f.id] : env.equipmentEnum.slice(0, 1), substitutions: [], ...over,
  };
}

Deno.test('評估集：6 組資料都組得出來、不是新手門檻，程式挑的那一樣都在可挑的清單裡', () => {
  assertEquals(EGG_CASES.length, 6);
  for (const c of EGG_CASES) {
    const env = buildHomeEnv(c.ctx, NOW);
    assertEquals(env.notEnough, false, c.id);
    assert(eggCandidates(env, NONE_USED).some((f) => f.kind === c.feature.kind && f.id === c.feature.id), `${c.id} 挑不到 ${c.feature.id}`);
  }
});

Deno.test('挑一樣：醬料要是醬、廚具要是不基本又做得到的；最近用過的不挑；舒肥機不挑', () => {
  const list = eggCandidates(envOf('e01'), NONE_USED);
  assertEquals(list.map((f) => f.id), ['doubanjiang']); // 豆腐、絞肉、蔥…不是醬；炒鍋是各地廚房都有的基本款
  assertEquals(eggCandidates(envOf('e01'), { ...NONE_USED, ingredientIds: new Set(['doubanjiang']) }), []); // 最近的點子用過了
  assertEquals(pickEggFeature(envOf('e01'), { ...NONE_USED, ingredientIds: new Set(['doubanjiang']) }), null);
  assertEquals(eggCandidates(envOf('e02'), NONE_USED).map((f) => f.id), ['oven']); // 平底鍋是基本款
  assertEquals(eggCandidates(envOf('e02'), { ...NONE_USED, equipmentIds: new Set(['oven']) }), []);
  // 只有舒肥機、溫度計、真空封口機：舒肥的手法一律擋下，所以舒肥機不會被挑中
  const sv = buildHomeEnv({ ...byId('e02').ctx, equipment: [{ equipment_type_id: 'sous-vide-circulator', enabled_optional_techniques: [] }, { equipment_type_id: 'thermometer', enabled_optional_techniques: [] }] }, NOW);
  assertEquals(eggCandidates(sv, NONE_USED).some((f) => f.id === 'sous-vide-circulator' || f.id === 'thermometer'), false);
  // 沒記廚具：只挑醬料
  assertEquals(eggCandidates(buildHomeEnv({ ...byId('e01').ctx, equipment: [] }, NOW), NONE_USED).every((f) => f.kind === 'sauce'), true);
  // 固定的 rng 挑得到固定的一個；兩種都有時隨機
  const both = buildHomeEnv({ ...byId('e02').ctx, pantry: [{ ingredient_id: 'doubanjiang', want_to_use_soon: false, expires_at: null }, ...byId('e02').ctx.pantry] }, NOW);
  assertEquals(pickEggFeature(both, NONE_USED, () => 0)?.kind, 'sauce');
  assertEquals(pickEggFeature(both, NONE_USED, () => 0.99)?.kind, 'equipment');
});

Deno.test('過期的醬不挑；過敏與飲食限制排除的醬不挑', () => {
  const c = byId('e01').ctx;
  const expired = buildHomeEnv({ ...c, pantry: c.pantry.map((p) => (p.ingredient_id === 'doubanjiang' ? { ...p, expires_at: '2026-11-01' } : p)) }, NOW);
  assertEquals(eggCandidates(expired, NONE_USED), []);
  const peanut = envOf('e03');
  assertEquals(eggCandidates(peanut, NONE_USED).map((f) => f.id), ['sesame-paste']); // 花生醬碰到過敏原、醬油是每個廚房都有的，都不挑
});

Deno.test('提示詞：主角寫在使用者那一段，規則每次一樣（可快取）、排除清單與不催促都在', () => {
  const env = envOf('e03');
  const p = buildEggPrompt(env, byId('e03').feature);
  assertEquals(p.stable, EGG_STABLE);
  assert(p.messages[0]?.content.includes('芝麻醬（食材 ID：sesame-paste）'));
  assert((p.volatile ?? '').includes('花生')); // 排除清單
  assert(EGG_STABLE.includes('不催促') && EGG_STABLE.includes('不提頻率'));
  const q = buildEggPrompt(envOf('e02'), byId('e02').feature);
  assert(q.messages[0]?.content.includes('烤箱（廚具代碼：oven）'));
  assertEquals(validate(EGG_SCHEMA, { idea: rawFor(env, 'e03') }), []);
  assertEquals(AI_TASKS.inspiration_egg.model, 'claude-haiku-5-5');
});

Deno.test('檢查：合格的過；沒用到主角、有過敏原、一句話太長、有數字、催促的都不出現', () => {
  const ok = (id: string, over: Partial<RawIdea> = {}) => checkEgg({ idea: rawFor(envOf(id), id, over) }, envOf(id), byId(id).feature);
  assert(ok('e01').idea);
  assert(ok('e02').idea);
  assertEquals(ok('e01', { uses_pantry_ids: ['tofu'] }).dropped, { feature_not_used: 1 });
  assertEquals(ok('e02', { equipment: ['frying-pan'] }).dropped, { feature_not_used: 1 }); // 炒鍋不是這次的主角
  assertEquals(ok('e03', { other_ingredients: [{ name: '花生粉' }] }).idea, null);
  assertEquals(ok('e03', { uses_pantry_ids: ['sesame-paste', 'peanut-butter'] }).idea, null);
  assertEquals(ok('e03', { why: '芝麻醬配花生，很搭。' }).idea, null); // 關鍵字再掃一次
  assertEquals(ok('e01', { why: '你有豆瓣醬，'.padEnd(EGG_MAX_WHY + 2, '很') }).dropped, { why_too_long: 1 });
  assertEquals(ok('e01', { why: '煮十分鐘就好。' }).idea, null);
  assertEquals(ok('e01', { why: '你有豆瓣醬，趕快用掉。' }).idea, null);
  assertEquals(ok('e01', { slot: 'familiar' }).idea, null); // 只收變化版
  assertEquals(ok('e01', { techniques: ['sous-vide'] }).idea, null); // 舒肥一律擋下（沒有舒肥機是做不到，有舒肥機是 blocked_technique）
  // 有舒肥機的人：舒肥的點子一律擋下（預設組合表還是空的）
  const svEnv = buildHomeEnv({ ...byId('e01').ctx, equipment: [{ equipment_type_id: 'sous-vide-circulator', enabled_optional_techniques: [] }] }, NOW);
  assertEquals(checkEgg({ idea: rawFor(svEnv, 'e01', { techniques: ['sous-vide'] }) }, svEnv, byId('e01').feature).dropped, { blocked_technique: 1 });
  assertEquals(checkEgg({}, envOf('e01'), byId('e01').feature).dropped, { no_idea: 1 });
  assertEquals(checkEgg(null, envOf('e01'), byId('e01').feature).idea, null);
  // 偶爾下廚的人：太難的不出現
  assertEquals(checkEgg({ idea: rawFor(envOf('e05'), 'e05', { difficulty: { ...DIFF, technique: 5, time: 5, failure_risk: 5 } }) }, envOf('e05'), byId('e05').feature).idea, null);
  // 過敏的人：「蒜泥」「水」是字典別名／基本項，不能被當成對不到而整個擋下（真 Claude 評估 e03 的輸出）
  assert(ok('e03', { other_ingredients: [{ name: '蒜泥' }, { name: '烏醋' }, { name: '糖' }] }).idea);
  assert(ok('e03', { other_ingredients: [{ name: '水' }] }).idea);
  // 蛋奶素：柴魚高湯是魚做的（評估 e04 的輸出），不能因為含「高湯」被當成雞高湯；字典對得到，也不靠「包含」
  assertEquals(ok('e04', { other_ingredients: [{ name: '柴魚高湯' }] }).idea, null);
  // 不吃的食材與飲食限制
  assertEquals(ok('e04', { other_ingredients: [{ name: '豬絞肉' }] }).idea, null);
  assertEquals(ok('e06', { uses_pantry_ids: ['teriyaki-sauce', 'mirin'] }).idea, null);
});

// ---------------------------------------------------------------------------------------------
// 流程
// ---------------------------------------------------------------------------------------------
const OK: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const USAGE = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };

interface State {
  per_week?: number;
  count_7d?: number;
  latest?: { id: string; created_at: string; expires_at: string; payload: unknown } | null;
  used_ingredient_ids?: string[];
  used_equipment_ids?: string[];
}

function harness(caseId: string, opts: { account?: AiContext; state?: State; reply?: (env: HomeEnv) => unknown; guard?: Deps['guard']; claudeFails?: boolean; saveFails?: boolean } = {}) {
  const c = byId(caseId);
  const env = buildHomeEnv(c.ctx, NOW);
  const calls: ClaudeRequest[] = [];
  const saved: Record<string, unknown>[] = [];
  const outcomes: string[] = [];
  const ai: Deps = {
    getContext: () => Promise.resolve(opts.account ?? OK),
    claude: (req) => {
      calls.push(req);
      return Promise.resolve({ stopReason: 'end_turn', text: JSON.stringify(opts.reply ? opts.reply(env) : { idea: rawFor(env, caseId) }), usage: USAGE, model: req.model });
    },
    tasks: {},
    allowInternalTasks: false,
    ...(opts.guard ? { guard: opts.guard } : {}),
  };
  const state = { per_week: 1, count_7d: 0, latest: null, used_ingredient_ids: [], used_equipment_ids: [], ...opts.state };
  const deps = {
    ai,
    now: () => NOW,
    rng: () => 0,
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'ai_egg_state') return Promise.resolve({ data: state, error: null });
      if (fn === 'ai_home_context') return Promise.resolve({ data: c.ctx, error: null });
      if (fn === 'ai_egg_save') {
        saved.push(args);
        return Promise.resolve(opts.saveFails ? { data: null, error: { code: 'x' } } : { data: '0192f000-0000-7000-8000-00000000e001', error: null });
      }
      if (fn === 'ai_record_outcome') {
        outcomes.push(String(args.p_outcome));
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === 'taste_profile_save') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: { code: 'unknown' } });
    },
  };
  return { deps, calls, saved, outcomes, env };
}

Deno.test('流程：叫 Haiku 5.5 寫一句話＋一道菜、檢查、存成 easter_egg、回傳', async () => {
  const h = harness('e01');
  const r = await runInspirationEgg(h.deps, 'u1', {});
  assert(r.ok && r.data.status === 'ok');
  if (!r.ok || r.data.status !== 'ok') return;
  assertEquals([r.data.source, r.data.kind, r.data.suggestionId], ['ai', 'sauce', '0192f000-0000-7000-8000-00000000e001']);
  assertEquals(r.data.idea.usesPantryIds, ['doubanjiang']);
  assertEquals(h.calls.length, 1);
  const req = h.calls[0] as ClaudeRequest;
  assertEquals([req.model, req.effort, req.thinking], ['claude-haiku-5-5', 'low', 'off']);
  assertEquals(h.saved.length, 1);
  assertEquals(h.saved[0]?.p_ttl_hours, EGG_SHOW_HOURS);
  const payload = h.saved[0]?.p_payload as { egg: unknown; ideas: unknown[]; schemaVersion: number };
  assertEquals([payload.egg, payload.ideas.length, payload.schemaVersion], [{ kind: 'sauce', id: 'doubanjiang' }, 1, 1]);
  assertEquals(h.outcomes, ['passed']);
});

Deno.test('流程：24 小時內出現過的那一個直接回（不叫 Claude），過敏原改了就不給', async () => {
  const first = harness('e03');
  const made = await runInspirationEgg(first.deps, 'u1', {});
  assert(made.ok && made.data.status === 'ok');
  const payload = first.saved[0]?.p_payload;
  const latest = { id: 'egg-row', created_at: NOW.toISOString(), expires_at: new Date(NOW.getTime() + 20 * 3600_000).toISOString(), payload };
  const again = harness('e03', { state: { count_7d: 1, latest } });
  const r = await runInspirationEgg(again.deps, 'u1', {});
  assert(r.ok && r.data.status === 'ok' && r.data.source === 'cache' && r.data.suggestionId === 'egg-row');
  assertEquals(again.calls.length, 0);
  // 之後加了芝麻過敏：同一個彩蛋不能再給（芝麻醬）
  const c = byId('e03').ctx;
  const bad = harness('e03', { state: { count_7d: 1, latest } });
  const strict = { ...bad.deps, rpc: (fn: string, a: Record<string, unknown>) => (fn === 'ai_home_context' ? Promise.resolve({ data: { ...c, dietary: { ...c.dietary!, allergen_ids: ['peanut', 'sesame'] } }, error: null }) : bad.deps.rpc(fn, a)) };
  assertEquals(await runInspirationEgg(strict, 'u1', {}), { ok: true, data: { status: 'none' } });
  assertEquals(bad.calls.length, 0);
});

Deno.test('流程：7 天內達到上限不出現、不叫 Claude；上限放寬或過了 24 小時才會再出現', async () => {
  const old = { id: 'old', created_at: new Date(NOW.getTime() - 3 * 86400_000).toISOString(), expires_at: new Date(NOW.getTime() - 2 * 86400_000).toISOString(), payload: {} };
  const full = harness('e01', { state: { count_7d: 1, latest: old } });
  assertEquals(await runInspirationEgg(full.deps, 'u1', {}), { ok: true, data: { status: 'none' } });
  assertEquals(full.calls.length, 0);
  const two = harness('e01', { state: { per_week: 2, count_7d: 1, latest: old } });
  assert((await runInspirationEgg(two.deps, 'u1', {})).ok && two.calls.length === 1);
  const off = harness('e01', { state: { per_week: 0 } });
  assertEquals(await runInspirationEgg(off.deps, 'u1', {}), { ok: true, data: { status: 'none' } });
  assertEquals(off.calls.length, 0);
});

Deno.test('流程：沒有可挑的、新手門檻、最近用過的，不出現也不叫 Claude', async () => {
  const used = harness('e01', { state: { used_ingredient_ids: ['doubanjiang'] } });
  assertEquals(await runInspirationEgg(used.deps, 'u1', {}), { ok: true, data: { status: 'none' } });
  assertEquals(used.calls.length, 0);
  const noThing = harness('e01');
  const deps = { ...noThing.deps, rpc: (fn: string, a: Record<string, unknown>) => (fn === 'ai_home_context' ? Promise.resolve({ data: { ...byId('e01').ctx, pantry: [], equipment: [] }, error: null }) : noThing.deps.rpc(fn, a)) };
  const r = await runInspirationEgg(deps, 'u1', {});
  assert(r.ok && r.data.status === 'none');
  assertEquals(noThing.calls.length, 0);
});

Deno.test('流程：AI 不能用（預算 80%、速率、上游出錯、檢查沒過、存不到）都是不出現，不是錯誤', async () => {
  for (const verdict of ['budget_exhausted', 'rate_limited', 'over_limit'] as const) {
    const h = harness('e01', { guard: () => Promise.resolve(verdict) });
    assertEquals(await runInspirationEgg(h.deps, 'u1', {}), { ok: true, data: { status: 'none' } }, verdict);
    assertEquals(h.calls.length, 0, verdict);
    assertEquals(h.saved.length, 0, verdict);
  }
  const bad = harness('e03', { reply: (env) => ({ idea: rawFor(env, 'e03', { other_ingredients: [{ name: '花生粉' }] }) }) });
  assertEquals(await runInspirationEgg(bad.deps, 'u1', {}), { ok: true, data: { status: 'none' } });
  assertEquals([bad.saved.length, bad.outcomes], [0, ['blocked']]);
  const garbage = harness('e01', { reply: () => ({ nope: 1 }) });
  assertEquals(await runInspirationEgg(garbage.deps, 'u1', {}), { ok: true, data: { status: 'none' } });
  assertEquals(garbage.saved.length, 0);
  const nosave = harness('e01', { saveFails: true });
  assertEquals(await runInspirationEgg(nosave.deps, 'u1', {}), { ok: true, data: { status: 'none' } });
});

Deno.test('流程：帳號停用、AI 關閉、輸入格式不對照其他任務的代號', async () => {
  assertEquals(await runInspirationEgg(harness('e01', { account: { ...OK, ai_enabled: false } }).deps, 'u1', {}), { ok: false, error: 'ai_disabled' });
  assertEquals(await runInspirationEgg(harness('e01', { account: { ...OK, ai_paused: true } }).deps, 'u1', {}), { ok: false, error: 'ai_paused' });
  assertEquals(await runInspirationEgg(harness('e01', { account: { ...OK, status: 'suspended' } }).deps, 'u1', {}), { ok: false, error: 'account_inactive' });
  assertEquals(await runInspirationEgg(harness('e01').deps, 'u1', { force: true }), { ok: false, error: 'invalid_input' });
  assertEquals([parseEggInput(undefined), parseEggInput({}), parseEggInput([]), parseEggInput('x')], [true, true, false, false]);
});

