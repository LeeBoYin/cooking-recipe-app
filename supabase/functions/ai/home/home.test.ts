// 首頁點子的測試（M1a-06）：用評估集的假使用者與假的 AI 回應，測「檢查會拿掉違規的點子」與整條流程。
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { validate } from '../../_shared/json-schema.ts';
import { type AiContext, type ClaudeRequest, type Deps } from '../pipeline.ts';
import { CACHE_TTL_HOURS, hashHomeInputs, parseHomeInput, runHomeIdeas } from './handler.ts';
import { checkHomeOutput, MAX_IDEAS, recheckCachedIdeas, wordingProblems } from './check.ts';
import { buildHomeEnv, type HomeEnv } from './env.ts';
import { buildHomePrompt, buildHomeSchema, HOME_IDEAS_STABLE } from './prompt.ts';
import { EVAL_CASES, NOW, type EvalCase } from './eval/cases.ts';
import type { HomeContextRow, HomePayload, RawIdea, RawOutput } from './types.ts';

const byId = (id: string): EvalCase => EVAL_CASES.find((c) => c.id.startsWith(id)) as EvalCase;
const envOf = (id: string): HomeEnv => {
  const c = byId(id);
  return buildHomeEnv(c.ctx, c.now ?? NOW);
};

const DIFF = { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 1 };
function idea(env: HomeEnv, over: Partial<RawIdea> = {}): RawIdea {
  return {
    slot: 'twist', candidate_ref: '', title: '測試小炒', why: '手邊的食材剛好，今天輕鬆煮。',
    uses_pantry_ids: [], uses_priority_ids: [], other_ingredients: [], difficulty: DIFF,
    techniques: env.techniqueEnum.slice(0, 1), equipment: env.equipmentEnum.slice(0, 1), substitutions: [], ...over,
  };
}
// 一組合格的回應：熟悉的指到第一個候選
function validRaw(env: HomeEnv, n = 0): RawOutput {
  const c1 = env.candidates[0];
  return {
    suggestions: [
      idea(env, { slot: 'familiar', candidate_ref: c1?.ref ?? '', title: 'x' }),
      idea(env, { slot: 'twist', title: `變化${n}` }),
      idea(env, { slot: 'adventure', title: `挑戰${n}` }),
    ],
    chef_comment: '今天就輕鬆煮一頓吧。',
  };
}
const ids = () => { let n = 0; return () => `id-${++n}`; };
const check = (env: HomeEnv, suggestions: RawIdea[], comment = '好吃就好。') =>
  checkHomeOutput({ suggestions, chef_comment: comment }, env, { makeId: ids() });

Deno.test('評估集：15 組資料都組得出來；只有新帳號被新手門檻擋下', () => {
  assertEquals(EVAL_CASES.length, 15);
  for (const c of EVAL_CASES) {
    const env = buildHomeEnv(c.ctx, c.now ?? NOW);
    assertEquals(env.notEnough, !c.callsAi, c.id);
  }
});

Deno.test('候選最多 15 個，過期食材不送、想先用掉與快到期的有標示', () => {
  const e5 = envOf('05');
  assert(e5.candidates.length <= 15);
  assert(e5.priorityIds.has('eggplant'));
  const e10 = envOf('10');
  assertEquals(e10.pantryIds.has('ground-pork'), false);
  const text = buildHomePrompt(e10, { titles: [], refs: [] }).messages[0]?.content ?? '';
  const pantrySection = text.slice(text.indexOf('## 手邊的食材'), text.indexOf('## 候選'));
  assertEquals(pantrySection.includes('豬絞肉'), false); // 食材清單裡沒有過期的
  assertEquals(pantrySection.includes('快到期'), false); // 也不提醒過期
  const empty = buildHomePrompt(envOf('09'), { titles: [], refs: [] }).messages[0]?.content ?? '';
  assertEquals(empty.includes('(缺)'), false); // 廚房沒記食材時，不標缺什麼
});

Deno.test('提示詞：角色與規則每次一樣（可快取）、排除清單是具體食材、不送宗教標籤', () => {
  const e2 = envOf('02');
  const e3 = envOf('03');
  const p2 = buildHomePrompt(e2, { titles: [], refs: [] });
  const p3 = buildHomePrompt(e3, { titles: [], refs: [] });
  assertEquals(p2.stable, HOME_IDEAS_STABLE);
  assertEquals(p3.stable, p2.stable);
  assert((p2.volatile ?? '').includes('蝦仁') && (p2.volatile ?? '').includes('花生'));
  assertEquals((p3.volatile ?? '').includes('五辛'), false);
  assertEquals((p3.volatile ?? '').includes('素'), false);
  assert((p3.volatile ?? '').includes('洋蔥'));
});

Deno.test('JSON Schema：手法與廚具是這個人能用的 enum，沒有舒肥；合格的回應通過 schema', () => {
  const e1 = envOf('01');
  assertEquals(e1.equipmentEnum, ['tatung-rice-cooker']);
  assertEquals(e1.techniqueEnum.sort(), ['boil', 'braise', 'soy-braise', 'steam']);
  const e7 = envOf('07');
  assertEquals(e7.techniqueEnum.includes('sous-vide'), false);
  for (const c of EVAL_CASES.filter((x) => x.callsAi)) {
    const env = buildHomeEnv(c.ctx, c.now ?? NOW);
    assertEquals(validate(buildHomeSchema(env), validRaw(env)), [], c.id);
  }
  // schema 每次都一樣（快取才讀得到）；不能用的手法由檢查拿掉
  assertEquals(JSON.stringify(buildHomeSchema(e1)), JSON.stringify(buildHomeSchema(e7)));
  const bad = validRaw(e1);
  (bad.suggestions[0] as RawIdea).techniques = ['sous-vide'];
  assertEquals(checkHomeOutput(bad, e1, { makeId: ids() }).dropped.technique, 1);
});

Deno.test('檢查：合格的點子留下，熟悉的菜名用候選的，ID 由程式產生', () => {
  const env = envOf('05');
  const r = checkHomeOutput(validRaw(env), env, { makeId: ids() });
  assertEquals(r.ideas.length, 3);
  assertEquals(r.ideas[0]?.title, env.candidates[0]?.idea.title);
  assertEquals(r.ideas[0]?.candidateRef, env.candidates[0]?.idea.key);
  assertEquals(r.ideas.map((i) => i.id), ['id-1', 'id-2', 'id-3']);
  assertEquals(r.chefComment, '今天就輕鬆煮一頓吧。');
});

Deno.test('檢查：過敏原（案例 2）——食材 ID、關鍵字、對不到字典的其他材料都會被拿掉', () => {
  const env = envOf('02');
  const r = check(env, [
    idea(env, { title: '蝦仁炒飯', other_ingredients: [{ name: '蝦仁' }] }), // 蝦仁不在給 AI 的食材清單裡，從其他材料比對
    idea(env, { title: '蝦醬空心菜' }),
    idea(env, { title: '花生粉雞丁', other_ingredients: [{ name: '花生粉' }] }),
    idea(env, { title: '奇怪調味雞', other_ingredients: [{ name: '神祕香料包' }] }),
    idea(env, { title: '打拋雞', slot: 'twist', uses_pantry_ids: ['chicken-thigh', 'thai-basil'] }),
  ]);
  assertEquals(r.ideas.map((i) => i.title), ['打拋雞']);
  assertEquals(r.dropped.allergen, 1); // 蝦仁（名稱完全相同才對得到字典）
  assertEquals(r.dropped.keyword, 1); // 蝦醬：字典沒有，靠關鍵字
  assertEquals(r.dropped.allergen_unknown_ingredient, 2); // 花生粉、神祕香料包：字典沒收，一律擋下（不用「包含」去猜）
});

Deno.test('檢查：五辛素（案例 3）——蔥蒜與肉類拿掉', () => {
  const env = envOf('03');
  const r = check(env, [
    idea(env, { title: '蒜香菇菇', uses_pantry_ids: ['shiitake'] }),
    idea(env, { title: '清炒青江菜', other_ingredients: [{ name: '蔥花' }] }),
    idea(env, { title: '洋蔥豆腐', other_ingredients: [{ name: '洋蔥' }] }),
    idea(env, { title: '雞肉菇菇煲' }),
    idea(env, { title: '薑絲豆腐湯', uses_pantry_ids: ['tofu', 'ginger'] }),
  ]);
  assertEquals(r.ideas.map((i) => i.title), ['薑絲豆腐湯']);
});

Deno.test('檢查：不吃牛、不用料理酒（案例 8）', () => {
  const env = envOf('08');
  const r = check(env, [
    idea(env, { title: '洋蔥牛肉丼', uses_pantry_ids: ['beef-slices'] }),
    idea(env, { title: '薑燒豬肉', other_ingredients: [{ name: '米酒' }] }),
    idea(env, { title: '醬燒豬肉', other_ingredients: [{ name: '料理酒' }] }),
    idea(env, { title: '洋蔥豬肉片', uses_pantry_ids: ['pork-slices', 'onion'] }),
  ]);
  assertEquals(r.ideas.map((i) => i.title), ['洋蔥豬肉片']);
});

Deno.test('檢查：過期食材不在送出的清單裡，整個點子拿掉（案例 10）', () => {
  const env = envOf('10');
  const r = check(env, [idea(env, { title: '肉末蒸蛋', uses_pantry_ids: ['ground-pork', 'egg'] }), idea(env, { title: '蔥花蛋', uses_pantry_ids: ['egg', 'scallion'] })]);
  assertEquals(r.ideas.map((i) => i.title), ['蔥花蛋']);
  assertEquals(r.dropped.pantry_not_sent, 1);
});

Deno.test('檢查：做不做得到、難度（案例 1：偶爾下廚、只有電鍋）', () => {
  const env = envOf('01');
  const r = check(env, [
    idea(env, { title: '烤高麗菜', techniques: ['roast'] }),
    idea(env, { title: '氣炸豆腐', equipment: ['air-fryer'] }),
    idea(env, { title: '舒肥蛋', techniques: ['sous-vide'] }),
    idea(env, { title: '很費工的蒸菜', difficulty: { ingredients: 4, equipment: 3, time: 4, technique: 4, failure_risk: 3 }, techniques: ['steam'] }),
    idea(env, { title: '電鍋蒸蛋', techniques: ['steam'], equipment: ['tatung-rice-cooker'] }),
  ]);
  assertEquals(r.ideas.map((i) => i.title), ['電鍋蒸蛋']);
  assertEquals(r.dropped.technique, 2);
  assertEquals(r.dropped.equipment, 1);
  assertEquals(r.dropped.too_hard, 1);
});

Deno.test('檢查：不催促、不數次數、不寫帶單位的數字；chef_comment 不合格就不用', () => {
  const env = envOf('05');
  const bad = [
    '你好久沒煮了，今天快來試試', '別忘了今天要煮', '已經連續三天沒煮', '煮三分鐘就好', '小火燉半小時', '放兩大匙醬油', '約 15 分鐘', '烤到攝氏180度',
    '熱量很低', '你應該多吃菜', '用{{temp:abc}}烤',
  ];
  for (const w of bad) assert(wordingProblems(w).length > 0, w);
  for (const ok of ['手邊的茄子剛好，今天換個煮法。', '用{{temp:180:C}}烤到金黃。', '煮到{{temp:73.9:C}}以上。', '煮到{{temp:165:F:min:73.9}}以上。', '煮到{{temp:75:C:min}}以上。', '你愛的豆瓣味，這次換茄子當主角。']) assertEquals(wordingProblems(ok), [], ok);
  const r = check(env, bad.map((why, i) => idea(env, { title: `菜${i}`, why })).concat(idea(env, { title: '合格', why: '用{{temp:180:C}}烤到金黃。' })), '你好久沒煮了');
  assertEquals(r.ideas.map((i) => i.title), ['合格']);
  assertEquals(r.chefComment, null);
});

Deno.test('檢查：格式、候選、重複、槽位數量', () => {
  const env = envOf('05');
  const c1 = env.candidates[0]?.ref ?? 'c1';
  const r = check(env, [
    idea(env, { slot: 'familiar', candidate_ref: '' }), // 熟悉的沒指到候選
    idea(env, { slot: 'familiar', candidate_ref: 'c99' }), // 不存在的候選
    idea(env, { title: '', why: 'x' }), // 格式
    idea(env, { difficulty: { ...DIFF, time: 9 } }), // 格式
    idea(env, { slot: 'familiar', candidate_ref: c1 }),
    idea(env, { slot: 'twist', title: '甲' }),
    idea(env, { slot: 'twist', title: '甲' }), // 重複
    idea(env, { slot: 'twist', title: '乙' }),
    idea(env, { slot: 'twist', title: '丙' }), // 變化版超過 2
    idea(env, { slot: 'adventure', title: '丁' }),
    idea(env, { slot: 'adventure', title: '戊' }), // 新挑戰超過 1
  ]);
  assertEquals(r.ideas.map((i) => i.slot), ['familiar', 'twist', 'twist', 'adventure']);
  assert(r.ideas.length <= MAX_IDEAS);
  assertEquals(r.dropped.bad_candidate, 2);
  assertEquals(r.dropped.format, 2);
  assertEquals(r.dropped.duplicate, 1);
  assertEquals(r.dropped.slot_limit, 2);
});

Deno.test('檢查：換一組時，出現過的菜名與候選不再給', () => {
  const env = envOf('05');
  const first = env.candidates[0];
  const r = checkHomeOutput(
    { suggestions: [idea(env, { slot: 'familiar', candidate_ref: first?.ref ?? 'c1' }), idea(env, { title: '甲 乙' })], chef_comment: '' },
    env,
    { shownRefs: new Set([first?.idea.key ?? '']), shownTitles: new Set(['甲乙']), makeId: ids() },
  );
  assertEquals(r.ideas.length, 0);
  assertEquals(r.dropped.already_shown, 2);
});

Deno.test('快取重新檢查：改了過敏原後，用到的點子會被拿掉', () => {
  const env = envOf('09');
  const kept = checkHomeOutput({ suggestions: [idea(env, { title: '蛋香飯', uses_pantry_ids: [] })], chef_comment: '' }, env).ideas;
  assertEquals(recheckCachedIdeas(kept, env).length, 1);
  const ctx2: HomeContextRow = { ...byId('09').ctx, dietary: { allergen_ids: ['egg'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false } };
  const env2 = buildHomeEnv(ctx2, NOW);
  assertEquals(recheckCachedIdeas([{ ...(kept[0] as (typeof kept)[number]), title: '蛋炒飯' }], env2).length, 0);
});

// ---------------------------------------------------------------------------------------------
// 整條流程：假的 Claude 與資料庫
// ---------------------------------------------------------------------------------------------
const OK: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const USAGE = { inputTokens: 1000, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 };

function harness(caseId: string, opts: { account?: AiContext; reply?: (env: HomeEnv, n: number) => RawOutput; recent?: HomeContextRow['recent'] } = {}) {
  const c = byId(caseId);
  const env = buildHomeEnv(c.ctx, c.now ?? NOW);
  const calls: ClaudeRequest[] = [];
  const saved: Record<string, unknown>[] = [];
  const outcomes: string[] = [];
  let recent = opts.recent ?? [];
  const ai: Deps = {
    getContext: () => Promise.resolve(opts.account ?? OK),
    claude: (req) => {
      calls.push(req);
      return Promise.resolve({ stopReason: 'end_turn', text: JSON.stringify((opts.reply ?? validRaw)(env, calls.length - 1)), usage: USAGE, model: req.model });
    },
    tasks: {},
    allowInternalTasks: false,
  };
  const deps = {
    ai,
    now: () => c.now ?? NOW,
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'ai_home_context') return Promise.resolve({ data: { ...c.ctx, recent }, error: null });
      if (fn === 'ai_home_cache_save') {
        saved.push(args);
        recent = [{ id: `row${saved.length}`, input_hash: String(args.p_input_hash), round: Number(args.p_round), created_at: (c.now ?? NOW).toISOString(), expires_at: new Date((c.now ?? NOW).getTime() + CACHE_TTL_HOURS * 3600_000).toISOString(), payload: args.p_payload }, ...recent];
        return Promise.resolve({ data: 'row', error: null });
      }
      if (fn === 'ai_record_outcome') {
        outcomes.push(String(args.p_outcome));
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === 'taste_profile_save') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: { code: 'unknown' } });
    },
  };
  return { deps, calls, saved, env, c, outcomes };
}

Deno.test('流程：新手門檻不呼叫 Claude（案例 4）', async () => {
  const h = harness('04');
  assertEquals(await runHomeIdeas(h.deps, 'u1', {}), { ok: true, data: { status: 'not_enough' } });
  assertEquals(h.calls.length, 0);
});

Deno.test('流程：第一次呼叫 Claude、檢查、存快取；再打開用快取不再呼叫', async () => {
  const h = harness('05');
  const first = await runHomeIdeas(h.deps, 'u1', {});
  assert(first.ok && first.data.status === 'ok' && first.data.source === 'ai');
  assertEquals(h.calls.length, 1);
  const req = h.calls[0] as ClaudeRequest;
  assertEquals([req.model, req.effort], ['claude-sonnet-5-5', 'low']);
  assertEquals(req.system[0]?.cache, true);
  assertEquals(h.saved.length, 1);
  assertEquals(h.outcomes, ['passed']);
  assertEquals((h.saved[0]?.p_payload as HomePayload).ideas.length, 3);

  const again = await runHomeIdeas(h.deps, 'u1', {});
  assert(again.ok && again.data.status === 'ok' && again.data.source === 'cache');
  assertEquals(h.calls.length, 1); // 沒有再呼叫
});

Deno.test('流程：輸入沒變就算超過 6 小時也用快取；改了輸入又超過 6 小時才重算', async () => {
  const h = harness('05');
  await runHomeIdeas(h.deps, 'u1', {});
  const row = (await Promise.resolve(h.deps.rpc('ai_home_context', {}))).data as HomeContextRow;
  const old = { ...row.recent[0], created_at: new Date(NOW.getTime() - 8 * 3600_000).toISOString(), expires_at: new Date(NOW.getTime() + 16 * 3600_000).toISOString() };
  const stale = harness('05', { recent: [old as HomeContextRow['recent'][number]] });
  assert((await runHomeIdeas(stale.deps, 'u1', {})).ok);
  assertEquals(stale.calls.length, 0); // hash 相同
  const changed = harness('05', { recent: [{ ...old, input_hash: 'different-hash-0000' } as HomeContextRow['recent'][number]] });
  await runHomeIdeas(changed.deps, 'u1', {});
  assertEquals(changed.calls.length, 1); // hash 不同、又超過 6 小時
});

Deno.test('流程：換一組最多 2 次，排除已出現過的；第 3 次不再給新的', async () => {
  const h = harness('05');
  await runHomeIdeas(h.deps, 'u1', {});
  const second = await runHomeIdeas(h.deps, 'u1', { shuffle: true });
  assert(second.ok && second.data.status === 'ok' && second.data.round === 1);
  assertEquals(h.calls.length, 2);
  assert((h.calls[1]?.messages[0]?.content ?? '').includes('已經出現過的點子'));
  const third = await runHomeIdeas(h.deps, 'u1', { shuffle: true });
  assert(third.ok && third.data.status === 'ok' && third.data.round === 2);
  const fourth = await runHomeIdeas(h.deps, 'u1', { shuffle: true });
  assertEquals(fourth, { ok: true, data: { status: 'unavailable', reason: 'shuffle_limit' } });
  assertEquals(h.calls.length, 3);
});

Deno.test('流程：檢查後一個都不剩，回錯誤，手機說現在想不出新點子；帳號狀態與輸入格式', async () => {
  const bad = harness('02', { reply: (env) => ({ suggestions: [idea(env, { title: '蝦仁炒飯', uses_pantry_ids: ['shrimp'] })], chef_comment: '' }) });
  assertEquals(await runHomeIdeas(bad.deps, 'u1', {}), { ok: false, error: 'invalid_output' });
  assertEquals(bad.saved.length, 0);
  assertEquals(bad.outcomes, ['blocked']);
  assertEquals((await runHomeIdeas(harness('05', { account: { ...OK, ai_enabled: false } }).deps, 'u1', {})), { ok: false, error: 'ai_disabled' });
  assertEquals((await runHomeIdeas(harness('05', { account: { ...OK, status: 'suspended' } }).deps, 'u1', {})), { ok: false, error: 'account_inactive' });
  assertEquals(parseHomeInput({ shuffle: 'yes' }), { ok: false });
  assertEquals(parseHomeInput({ text: 'x' }), { ok: false });
  assertEquals(parseHomeInput(undefined), { ok: true, shuffle: false });
});

Deno.test('輸入雜湊：食材、飲食限制改了就不同，順序不影響', async () => {
  const c = byId('05');
  const a = await hashHomeInputs(buildHomeEnv(c.ctx, NOW));
  const reversed = await hashHomeInputs(buildHomeEnv({ ...c.ctx, pantry: [...c.ctx.pantry].reverse() }, NOW));
  assertEquals(a, reversed);
  const more = await hashHomeInputs(buildHomeEnv({ ...c.ctx, pantry: [...c.ctx.pantry, { ingredient_id: 'egg', want_to_use_soon: false, expires_at: null }] }, NOW));
  assertNotEquals(a, more);
  const allergy = await hashHomeInputs(buildHomeEnv({ ...c.ctx, dietary: { allergen_ids: ['egg'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false } }, NOW));
  assertNotEquals(a, allergy);
});

Deno.test('排除清單裡的食材不給 AI 看', () => {
  const env = envOf('08');
  const ids = env.pantry.map((p) => p.id);
  for (const id of ['beef-slices', 'rice-wine', 'mirin']) assertEquals(ids.includes(id), false, id);
  assertEquals(ids.includes('pork-slices'), true);
});

Deno.test('L1 考慮廚具（M1b-01）：沒有炸鍋但有平底鍋，炸物有替代手法（半煎炸）；只有電鍋就排除', () => {
  const titles = (env: HomeEnv) => env.pool.ideas.filter((i) => i.source === 'dish').map((i) => i.title);
  const pan = envOf('12');
  assertEquals(pan.owned?.some((o) => o.equipmentTypeId === 'frying-pan'), true);
  // 12 的口味維度在字典裡不一定都有，所以直接檢查可行性判斷，而不是看分數
  assertEquals(pan.input.canDoTechnique('deep-fry'), true);
  assertEquals(pan.input.canDoTechnique('sous-vide'), false);
  const cooker = envOf('01');
  assertEquals(cooker.input.canDoTechnique('deep-fry'), false);
  assertEquals(cooker.input.canDoTechnique('roast'), false);
  assertEquals(cooker.input.canDoTechnique('knead'), true); // 手揉不需要廚具
  assert(titles(cooker).every((t) => !['日式炸雞', '炸豬排', '烤雞腿與馬鈴薯'].includes(t)));
  // 廚房沒記廚具時不檢查
  const none = buildHomeEnv({ ...byId('09').ctx, equipment: [] }, NOW);
  assertEquals(none.input.canDoTechnique('deep-fry'), null);
});

Deno.test('換手法的程式檢查：點子用的手法與廚具要是使用者做得到、有的（替代做法只管候選，不放寬點子）', () => {
  const env = envOf('13');
  const ok = check(env, [idea(env, { slot: 'twist', title: '烤箱烤雞胸', techniques: ['roast'], equipment: ['oven'] })]);
  assertEquals(ok.ideas.length, 1);
  const cooker = envOf('11');
  const r = check(cooker, [
    idea(cooker, { slot: 'twist', title: '烤雞腿', techniques: ['roast'], equipment: ['microwave'] }),
    idea(cooker, { slot: 'adventure', title: '氣炸雞腿', techniques: ['steam'], equipment: ['air-fryer'] }),
  ]);
  assertEquals(r.ideas.length, 0);
  assertEquals(r.dropped.technique, 1);
  assertEquals(r.dropped.equipment, 1);
});

Deno.test('提示詞：換手法的策略只用在變化版與新挑戰；舒肥由提示詞禁止（時間溫度只在展開做法時由預設組合表帶入）', () => {
  assert(HOME_IDEAS_STABLE.includes('換手法（只用在 twist 與 adventure，familiar 不換）'));
  assert(HOME_IDEAS_STABLE.includes('舒肥只能用在豬、牛、羊的整塊肉'));
  assert(HOME_IDEAS_STABLE.includes('點子不寫舒肥的溫度與時間'));
  const env = envOf('14');
  assert(env.techniqueEnum.includes('sous-vide')); // 有舒肥機：手法在清單裡，食材是不是肉由檢查把關
  assertEquals(env.sousVideShortOnly, false);
});

Deno.test('舒肥：點子的食材要是豬、牛、羊肉；禽肉、海鮮、蛋、沒有肉的舒肥點子由程式拿掉', () => {
  const c = byId('14');
  const p = (id: string) => ({ ingredient_id: id, want_to_use_soon: false, expires_at: null });
  const check = (pantryIds: string[], over: Partial<RawIdea> = {}) => {
    const env = buildHomeEnv({ ...c.ctx, pantry: pantryIds.map(p) }, c.now ?? NOW);
    assert(env.techniqueEnum.includes('sous-vide'));
    const raw = idea(env, { uses_pantry_ids: pantryIds, techniques: ['sous-vide'], equipment: ['sous-vide-circulator'], ...over });
    return checkHomeOutput({ suggestions: [raw], chef_comment: '' }, env, { makeId: ids() });
  };
  // 豬里肌可以
  assertEquals(check(['pork-tenderloin', 'salt']).ideas.length, 1);
  // 雞胸（評估 14「舒肥嫩雞胸」）被拿掉；豬肉和雞肉混在一起也不行
  assertEquals(check(['chicken-breast', 'broccoli']).dropped.technique, 1);
  assertEquals(check(['pork-tenderloin', 'chicken-breast']).dropped.technique, 1);
  // 沒有肉、字典沒收的肉名稱（鴨胸）、菜名裡的禽肉
  assertEquals(check(['broccoli']).dropped.technique, 1);
  assertEquals(check(['pork-tenderloin'], { other_ingredients: [{ name: '鴨胸' }] }).dropped.technique, 1);
  assertEquals(check(['pork-tenderloin'], { title: '舒肥雞肉' }).dropped.technique, 1);
  // 不是舒肥的點子不受影響
  assertEquals(check(['chicken-breast'], { techniques: ['pan-fry'], equipment: ['frying-pan'] }).ideas.length, 1);
});

Deno.test('舒肥：只有大鍋溫水＋溫度計（沒有舒肥機）時手法在清單裡，但標成只能用短時間的組合；沒記廚具不給舒肥', () => {
  const c = byId('14');
  const eq = (...ids: string[]) => ids.map((equipment_type_id) => ({ equipment_type_id, enabled_optional_techniques: [] as string[] }));
  const warm = buildHomeEnv({ ...c.ctx, equipment: eq('gas-stove', 'stockpot', 'thermometer') }, NOW);
  assert(warm.techniqueEnum.includes('sous-vide'));
  assertEquals(warm.sousVideShortOnly, true);
  const noThermo = buildHomeEnv({ ...c.ctx, equipment: eq('gas-stove', 'stockpot') }, NOW);
  assertEquals(noThermo.techniqueEnum.includes('sous-vide'), false);
  const none = buildHomeEnv({ ...c.ctx, equipment: [] }, NOW);
  assertEquals(none.techniqueEnum.includes('sous-vide'), false);
});
