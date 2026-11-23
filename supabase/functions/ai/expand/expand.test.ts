// 展開做法的測試（M1a-09）：用評估集的假使用者與假的 AI 回應，測「檢查擋得下違規的做法」與整條流程。
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import type { RecipeDraft } from '../../../../packages/core/src/index.ts';
import { resolveIngredientId } from '../../_shared/ingredient-resolve.ts';
import { validate } from '../../_shared/json-schema.ts';
import { type AiContext, type ClaudeRequest, type Deps, UpstreamError } from '../pipeline.ts';
import type { Rpc } from '../usage.ts';
import { buildHomeEnv, type HomeEnv } from '../home/env.ts';
import { checkDraft, donenessTips, stepWordingProblems, storedDraftOk } from './check.ts';
import { EXPAND_CASES, NOW, type ExpandCase } from './eval/cases.ts';
import { ideaFromRow } from './idea.ts';
import { MAX_ATTEMPTS, parseExpandInput, runExpandSteps } from './handler.ts';
import { buildExpandPrompt, buildExpandSchema, EXPAND_STEPS_STABLE } from './prompt.ts';
import type { RawDraft } from './types.ts';

const caseOf = (id: string): ExpandCase => EXPAND_CASES.find((c) => c.id.startsWith(id)) as ExpandCase;
const envOf = (c: ExpandCase): HomeEnv => buildHomeEnv(c.ctx, NOW);
const ids = () => { let n = 0; return () => `id-${++n}`; };
const opts = { servings: 2, model: 'm', makeId: ids() };

// 電鍋蒸蛋：一份合格的回應
function goodRaw(over: Partial<RawDraft> = {}): RawDraft {
  return {
    ingredients: [
      { name: '雞蛋', amount: 3, amount_max: null, unit: 'piece', optional: false, group: null },
      { name: '蔥', amount: 1, amount_max: null, unit: 'stalk', optional: false, group: null },
      { name: '醬油', amount: 1, amount_max: null, unit: 'tbsp', optional: false, group: null },
      { name: '鹽', amount: null, amount_max: null, unit: 'pinch', optional: false, group: null },
    ],
    steps: [
      { text: '蛋打散，加一點水拌勻，過篩更滑。', timer_seconds: null, techniques: [], equipment: [], target_temp_c: null },
      { text: '放進電鍋，外鍋加水蒸到剛好凝固。', timer_seconds: 900, techniques: ['steam'], equipment: ['tatung-rice-cooker'], target_temp_c: null },
      { text: '撒上蔥花，淋醬油。', timer_seconds: null, techniques: [], equipment: [], target_temp_c: null },
    ],
    tips: '電鍋蓋留一道縫，蛋會比較嫩。',
    ...over,
  };
}
const step = (text: string, over: Partial<RawDraft['steps'][number]> = {}) => ({ text, timer_seconds: null, techniques: [] as string[], equipment: [] as string[], target_temp_c: null, ...over });
const ing = (name: string, over: Partial<RawDraft['ingredients'][number]> = {}) => ({ name, amount: 1, amount_max: null, unit: 'piece', optional: false, group: null, ...over });

Deno.test('評估集：6 組都組得出來，點子都能整理成要展開的樣子', () => {
  assertEquals(EXPAND_CASES.length, 6);
  for (const c of EXPAND_CASES) {
    const env = envOf(c);
    const idea = ideaFromRow(c.row);
    assert(idea, c.id);
    const text = buildExpandPrompt(env, idea, 2).messages[0]?.content ?? '';
    assert(text.includes(idea.title), c.id);
  }
  assertEquals(ideaFromRow(caseOf('01').row)?.dish?.name, '麻婆豆腐'); // 收藏的家常菜：從快照找回骨架
});

Deno.test('自己的食譜不展開', () => {
  const c = caseOf('02');
  assertEquals(ideaFromRow({ ...c.row, idea: { ...(c.row.idea as NonNullable<typeof c.row.idea>), candidateRef: 'own:0192f000-0000-7000-8000-000000000009' } }), null);
});

Deno.test('輸出格式每個人都一樣（才讀得到提示詞快取）；提示詞不放排除清單裡的食材', () => {
  assertEquals(JSON.stringify(buildExpandSchema()), JSON.stringify(buildExpandSchema()));
  const c = caseOf('03');
  const withShrimp = buildHomeEnv({ ...c.ctx, pantry: [...c.ctx.pantry, { ingredient_id: 'shrimp', want_to_use_soon: false, expires_at: null }] }, NOW);
  assertEquals(withShrimp.pantryIds.has('shrimp'), false);
  const idea = ideaFromRow(c.row) as NonNullable<ReturnType<typeof ideaFromRow>>;
  const p = buildExpandPrompt(withShrimp, idea, 2);
  assertEquals((p.messages[0]?.content ?? '').includes('蝦'), false);
  // 穩定的段落不含任何人的資料
  assertEquals(p.stable, EXPAND_STEPS_STABLE);
  assertEquals(buildExpandPrompt(envOf(caseOf('05')), ideaFromRow(caseOf('05').row) as never, 2).stable, p.stable);
  assert(validate(buildExpandSchema(), goodRaw()).length === 0);
});

Deno.test('合格的做法通過，並補上程式算出的欄位', () => {
  const env = envOf(caseOf('05'));
  const r = checkDraft(goodRaw(), env, { ...opts, makeId: ids() });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.draft.servings, 2);
  assertEquals(r.draft.ingredients[0]?.ingredientId, 'egg');
  assertEquals(r.draft.ingredients[3]?.amount, undefined); // 少許不帶份量
  assertEquals(r.draft.steps[1]?.timerSeconds, 900);
  assertEquals(r.draft.steps[1]?.order, 2);
  assert(r.draft.tips?.includes('{{temp:'), '蛋料理附上中心溫度');
  assertEquals(caseOf('05').assert(r.draft, env), []);
});

Deno.test('檢查擋得下違規：整份不用，不只刪掉違規的那一項', () => {
  const env05 = envOf(caseOf('05'));
  const allergic = envOf(caseOf('03'));
  const bad = (env: HomeEnv, raw: RawDraft, ...problem: string[]) => {
    const r = checkDraft(raw, env, opts);
    assertEquals(r.ok, false, problem.join());
    if (!r.ok) assert(problem.some((p) => p in r.problems), `${problem.join()}：${JSON.stringify(r.problems)}`);
  };
  // 蝦：字典對得到就是 allergen，對不到（過敏的人）就是 allergen_unknown_ingredient；兩種都整份不用
  bad(allergic, goodRaw({ ingredients: [ing('雞腿肉'), ing('蝦仁')] }), 'allergen', 'allergen_unknown_ingredient');
  bad(allergic, goodRaw({ ingredients: [ing('雞腿肉'), ing('白蝦')] }), 'allergen', 'allergen_unknown_ingredient');
  bad(allergic, goodRaw({ ingredients: [ing('雞腿肉'), ing('神祕調味粉')] }), 'allergen_unknown_ingredient');
  // 食材清單乾淨，但步驟裡還寫著花生：整份不用
  bad(allergic, goodRaw({ ingredients: [ing('雞腿肉')], steps: [step('起鍋前撒上花生碎。')] }), 'keyword');
  bad(env05, goodRaw({ ingredients: [ing('雞蛋', { unit: 'oz' })] }), 'format');
  bad(env05, goodRaw({ ingredients: [ing('雞蛋', { amount: null, unit: 'piece' })] }), 'unit');
  bad(env05, goodRaw({ ingredients: [ing('鹽', { amount: 1, unit: 'pinch' })] }), 'unit');
  bad(env05, goodRaw({ steps: [step('蒸十分鐘。')] }), 'wording');
  bad(env05, goodRaw({ steps: [step('蒸 10 分鐘。')] }), 'wording');
  bad(env05, goodRaw({ steps: [step('烤箱預熱到 180 度。')] }), 'wording');
  bad(env05, goodRaw({ steps: [step('加入兩大匙醬油。')] }), 'wording');
  bad(env05, goodRaw({ steps: [step('倒入半杯水。')] }), 'wording');
  bad(env05, goodRaw({ steps: [step('內鍋加水，外鍋倒入半杯水，蒸十分鐘。')] }), 'wording');
  bad(env05, goodRaw({ steps: [step('放進烤箱。', { equipment: ['oven'] })] }), 'equipment');
  bad(env05, goodRaw({ steps: [step('大火快炒。', { techniques: ['stir-fry'] })] }), 'technique');
  bad(env05, goodRaw({ steps: [step('這一步用了不存在的手法。', { techniques: ['teleport'] })] }), 'technique');
  bad(env05, goodRaw({ steps: [] }), 'format');
  bad(env05, goodRaw({ steps: [step('蒸。', { timer_seconds: 0 })] }), 'format');
  bad(env05, goodRaw({ steps: [step('蒸。', { target_temp_c: 999 })] }), 'format');
});

Deno.test('舒肥：只能是豬、牛、羊肉，溫度與維持時間照預設組合表，文字要帶對應的標記；其他一律擋下', () => {
  const c = caseOf('04');
  const env = envOf(c);
  assert(env.owned?.some((o) => o.equipmentTypeId === 'sous-vide-circulator'));
  // 表裡的 140°F／60°C：維持 720 秒（12 分鐘）；牛肉 6.5-log 與 7-log 都是 720，用 131°F／55°C 區分（6.5-log 89 分、7-log 97 分）
  const svStep = (text: string, over: Partial<RawDraft['steps'][number]> = {}) =>
    step(text, { techniques: ['sous-vide'], timer_seconds: 720, target_temp_c: 60, equipment: ['sous-vide-circulator'], ...over });
  const MARK60 = '{{temp:140:F:min:60}}';
  const pork = (steps: RawDraft['steps']) => goodRaw({ ingredients: [ing('豬里肌')], steps });
  const good = checkDraft(pork([svStep(`真空包好，用溫度計確認最厚的地方中心到達 ${MARK60}，再開始計時。`)]), env, opts);
  assert(good.ok);
  if (good.ok) {
    assertEquals(good.draft.steps[0]?.timerSeconds, 720);
    const tips = good.draft.tips ?? '';
    // 程式補上舒肥的規則與對弱勢族群的提醒；不再寫一般的豬牛羊中心溫度（會和舒肥矛盾）
    assert(tips.includes(MARK60) && tips.includes('{{temp:50:F:min:10}}') && tips.includes('{{temp:130:F:min:54.4}}') && tips.includes('孕婦'));
    assert(!tips.includes('豬、牛、羊肉要煮到中心溫度'));
  }
  const bad = (raw: RawDraft) => {
    const r = checkDraft(raw, env, opts);
    assertEquals(r.ok, false);
    if (!r.ok) assert('safety' in r.problems);
  };
  // 雞胸（禽肉）、海鮮、蛋：表裡沒有，擋下
  bad(goodRaw({ ingredients: [ing('雞胸肉')], steps: [svStep(`確認中心到達 ${MARK60}。`)] }));
  bad(goodRaw({ ingredients: [ing('豬里肌'), ing('雞蛋')], steps: [svStep(`確認中心到達 ${MARK60}。`)] }));
  // 溫度不在表裡（62 度、130°F 以下的 50 度）、時間不夠
  bad(pork([svStep(`確認中心到達 ${MARK60}。`, { target_temp_c: 62 })]));
  bad(pork([svStep(`確認中心到達 ${MARK60}。`, { target_temp_c: 50 })]));
  bad(pork([svStep(`確認中心到達 ${MARK60}。`, { timer_seconds: 719 })]));
  bad(pork([svStep(`確認中心到達 ${MARK60}。`, { timer_seconds: null })]));
  // 文字沒帶標記，或標記和溫度對不上
  bad(pork([svStep('用溫度計確認中心到達目標溫度。')]));
  bad(pork([svStep('確認中心到達 {{temp:145:F:min:62.8}}。')]));
  // 牛肉用 6.5-log 欄、豬或羊用 7-log 欄：131°F／55°C 牛肉 89 分（5340 秒）、豬 97 分（5820 秒）
  const MARK55 = '{{temp:131:F:min:55}}';
  const at55 = (name: string, seconds: number) => checkDraft(goodRaw({ ingredients: [ing(name)], steps: [svStep(`確認中心到達 ${MARK55}。`, { target_temp_c: 55, timer_seconds: seconds })] }), env, opts).ok;
  assertEquals(at55('牛小排', 5340), true);
  assertEquals(at55('牛小排', 5339), false);
  assertEquals(at55('豬里肌', 5340), false);
  assertEquals(at55('豬里肌', 5820), true);
  assertEquals(checkDraft(goodRaw({ ingredients: [ing('牛小排'), ing('豬里肌')], steps: [svStep(`確認中心到達 ${MARK55}。`, { target_temp_c: 55, timer_seconds: 5340 })] }), env, opts).ok, false); // 混合用 7-log
  // 只能用大鍋溫水＋溫度計的人：只有短時間的組合（140°F 以上）。131°F 就擋下
  const warm = { ...env, sousVideShortOnly: true };
  assertEquals(checkDraft(pork([svStep(`確認中心到達 ${MARK60}。`)]), warm, opts).ok, true);
  assertEquals(checkDraft(goodRaw({ ingredients: [ing('豬里肌')], steps: [svStep(`確認中心到達 ${MARK55}。`, { target_temp_c: 55, timer_seconds: 5820 })] }), warm, opts).ok, false);
  // 一般的煎
  const pan = goodRaw({
    ingredients: [ing('雞胸肉'), ing('鹽', { amount: null, unit: 'pinch' })],
    steps: [step('雞胸肉拍鬆，兩面煎到金黃。', { techniques: ['pan-fry'], equipment: ['frying-pan'] }), step('預熱 {{temp:180:C}} 的鍋子。')],
  });
  const ok = checkDraft(pan, env, opts);
  assert(ok.ok);
  if (ok.ok) assert(ok.draft.tips?.includes('雞'), '雞肉附上中心溫度');
});

Deno.test('用字：標記格式要對，不談身材', () => {
  assertEquals(stepWordingProblems('預熱到 {{temp:180:C}}，煎到金黃。'), false);
  assertEquals(stepWordingProblems('預熱到 {{temp:180}}。'), true);
  assertEquals(stepWordingProblems('煮到 {{temp:73.9:C}} 以上。'), false); // 一位小數的標記放行
  assertEquals(stepWordingProblems('煮到 {{temp:165:F:min:73.9}} 以上。'), false);
  assertEquals(stepWordingProblems('煮到 {{temp:75:C:min}} 以上。'), false);
  assertEquals(stepWordingProblems('煮到 {{temp:75:C:max}} 以上。'), true);
  assertEquals(stepWordingProblems('煮到 {{temp:73.95:C}} 以上。'), true);
  assertEquals(stepWordingProblems('熱量很低。'), true);
  assertEquals(stepWordingProblems('一大匙醬油。'), true);
  assertEquals(stepWordingProblems('立刻翻面。'), false); // 步驟是祈使句，不套首頁的禁用字眼
});

Deno.test('中心溫度提醒：依當地的表（美國帶 165°F 與 73.9°C、日本只帶 75°C）', () => {
  const tw = envOf(caseOf('04'));
  assertEquals(donenessTips(['chicken-breast'], tw), ['雞、鴨等禽肉要煮到中心溫度 {{temp:75:C:min}} 以上。']); // 台灣沒有當地表：各表取最嚴格的
  const ca = buildHomeEnv({ ...caseOf('04').ctx, kitchen: { ...caseOf('04').ctx.kitchen, region: 'US-CA' } }, NOW);
  assertEquals(donenessTips(['chicken-breast'], ca), ['雞、鴨等禽肉要煮到中心溫度 {{temp:165:F:min:73.9}} 以上。']);
  assertEquals(donenessTips(['cabbage'], tw), []);
  const jp = buildHomeEnv({ ...caseOf('04').ctx, kitchen: { ...caseOf('04').ctx.kitchen, region: 'JP' } }, NOW);
  assertEquals(donenessTips(['chicken-breast'], jp), ['雞、鴨等禽肉要煮到中心溫度 {{temp:75:C:min}} 以上。']);
});

Deno.test('存下來的做法：過敏原改了就不能再用', () => {
  const env05 = envOf(caseOf('05'));
  const r = checkDraft(goodRaw(), env05, { ...opts, makeId: ids() });
  assert(r.ok);
  if (!r.ok) return;
  assert(storedDraftOk(r.draft, env05));
  const egg = buildHomeEnv({ ...caseOf('05').ctx, dietary: { allergen_ids: ['egg'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false } }, NOW);
  assertEquals(storedDraftOk(r.draft, egg), false);
});

Deno.test('輸入：快取列加點子，或收藏；其他都拒絕', () => {
  const U = '0192f000-0000-7000-8000-000000000001';
  assertEquals(parseExpandInput({ suggestionId: U, ideaId: U }).ok, true);
  assertEquals(parseExpandInput({ bookmarkId: U }).ok, true);
  assertEquals(parseExpandInput({ suggestionId: U }).ok, false);
  assertEquals(parseExpandInput({ bookmarkId: U, ideaId: U }).ok, false);
  assertEquals(parseExpandInput({ bookmarkId: 'x' }).ok, false);
  assertEquals(parseExpandInput({ bookmarkId: U, extra: 1 }).ok, false);
  assertEquals(parseExpandInput(null).ok, false);
});

// ---------------------------------------------------------------------------------------------
// 整條流程
// ---------------------------------------------------------------------------------------------
const ACCOUNT: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const USAGE = { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 };

function harness(c: ExpandCase, responses: (RawDraft | 'upstream' | 'refusal')[], rowOver: Partial<typeof c.row> = {}) {
  const requests: ClaudeRequest[] = [];
  const saves: Record<string, unknown>[] = [];
  const outcomes: string[] = [];
  let n = 0;
  const deps = {
    ai: {
      getContext: () => Promise.resolve(ACCOUNT),
      claude: (req: ClaudeRequest) => {
        requests.push(req);
        const r = responses[Math.min(n++, responses.length - 1)];
        if (r === 'upstream') return Promise.reject(new UpstreamError('claude'));
        if (r === 'refusal') return Promise.resolve({ stopReason: 'refusal', text: '', usage: USAGE, model: 'm' });
        return Promise.resolve({ stopReason: 'end_turn', text: JSON.stringify(r), usage: USAGE, model: 'claude-sonnet-5-5' });
      },
      tasks: {},
      allowInternalTasks: false,
    } as Deps,
    rpc: ((fn: string, args: Record<string, unknown>) => {
      if (fn === 'ai_expand_get') return Promise.resolve({ data: { ...c.row, ...rowOver }, error: null });
      if (fn === 'ai_home_context') return Promise.resolve({ data: c.ctx, error: null });
      if (fn === 'taste_profile_save') return Promise.resolve({ data: null, error: null });
      if (fn === 'ai_record_outcome') {
        outcomes.push(String(args.p_outcome));
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === 'ai_expand_save') {
        saves.push(args);
        return Promise.resolve({ data: null, error: null });
      }
      throw new Error(`unexpected rpc ${fn}`);
    }) as Rpc,
    now: () => NOW,
  };
  return { deps, requests, saves, outcomes };
}
const U = '0192f000-0000-7000-8000-000000000001';
const INPUT = { suggestionId: U, ideaId: U };

Deno.test('流程：第一次打開用 AI 寫、檢查、存進快取', async () => {
  const c = caseOf('05');
  const h = harness(c, [goodRaw()]);
  const res = await runExpandSteps(h.deps, 'u1', INPUT);
  assert(res.ok);
  if (!res.ok) return;
  assertEquals(res.data.source, 'ai');
  assertEquals(res.data.draft.ingredients.length, 4);
  assertEquals(h.requests.length, 1);
  assertEquals(h.requests[0]?.model, 'claude-sonnet-5-5');
  assertEquals(h.saves.length, 1);
  assertEquals(h.saves[0]?.p_cache, c.row.cache_id);
  assertEquals(h.saves[0]?.p_idea_id, c.row.idea_id);
  assertEquals((h.saves[0]?.p_draft as RecipeDraft).servings, 2);
});

Deno.test('流程：已經展開過就用存下來的，不呼叫 AI、不重算', async () => {
  const c = caseOf('05');
  const first = checkDraft(goodRaw(), envOf(c), { ...opts, makeId: ids() });
  assert(first.ok);
  if (!first.ok) return;
  const h = harness(c, [goodRaw()], { draft: first.draft });
  const res = await runExpandSteps(h.deps, 'u1', INPUT);
  assert(res.ok && res.data.source === 'cache');
  assertEquals(h.requests.length, 0);
  assertEquals(h.saves.length, 0);
  // 點子後來才收藏：補存進收藏
  const h2 = harness(c, [goodRaw()], { draft: first.draft, bookmark_id: U, snapshot: { title: 't' } });
  await runExpandSteps(h2.deps, 'u1', INPUT);
  assertEquals(h2.saves.length, 1);
  assertEquals(h2.saves[0]?.p_bookmark, U);
});

Deno.test('流程：存下來的做法碰到新加的過敏原就重寫', async () => {
  const c = caseOf('05');
  const first = checkDraft(goodRaw(), envOf(c), { ...opts, makeId: ids() });
  assert(first.ok);
  if (!first.ok) return;
  const allergic = { ...c, ctx: { ...c.ctx, dietary: { allergen_ids: ['egg'], restriction_ids: [], dislike_ingredient_ids: [], no_cooking_alcohol: false } } };
  const h = harness(allergic, [goodRaw()], { draft: first.draft });
  const res = await runExpandSteps(h.deps, 'u1', INPUT);
  assertEquals(res.ok, false); // 點子本身就用蛋：不叫 AI
  assertEquals(h.requests.length, 0);
});

Deno.test('流程：第一次沒過檢查，整份重寫一次，第二次過了', async () => {
  const c = caseOf('05');
  const h = harness(c, [goodRaw({ steps: [step('蒸十分鐘。')] }), goodRaw()]);
  const res = await runExpandSteps(h.deps, 'u1', INPUT);
  assert(res.ok);
  assertEquals(h.requests.length, 2);
  assertEquals(h.saves.length, 1);
  assertEquals(h.outcomes, ['rewritten']);
  // 重寫時告訴 AI 哪一類沒過（只有類別，不含內容）
  const retry = h.requests[1]?.messages[0]?.content ?? '';
  assert(retry.includes('上一次寫的沒有通過檢查'));
  assertEquals((h.requests[0]?.messages[0]?.content ?? '').includes('上一次寫的'), false);
});

Deno.test('流程：兩次都沒過就失敗，什麼都不存', async () => {
  const c = caseOf('05');
  const h = harness(c, [goodRaw({ steps: [step('蒸十分鐘。')] })]);
  const res = await runExpandSteps(h.deps, 'u1', INPUT);
  assertEquals(res, { ok: false, error: 'invalid_output' });
  assertEquals(h.requests.length, MAX_ATTEMPTS);
  assertEquals(h.saves.length, 0);
  assertEquals(h.outcomes, ['blocked']);
});

Deno.test('流程：AI 不能用、拒答、逾時都失敗，什麼都不存', async () => {
  const c = caseOf('05');
  for (const r of ['upstream', 'refusal'] as const) {
    const h = harness(c, [r]);
    const res = await runExpandSteps(h.deps, 'u1', INPUT);
    assertEquals(res.ok, false);
    assertEquals(h.saves.length, 0);
  }
  const off = harness(c, [goodRaw()]);
  off.deps.ai.getContext = () => Promise.resolve({ ...ACCOUNT, ai_enabled: false });
  assertEquals(await runExpandSteps(off.deps, 'u1', INPUT), { ok: false, error: 'ai_disabled' });
});

Deno.test('流程：不是自己的點子、自己的食譜、收藏找不到，都回 invalid_input', async () => {
  const c = caseOf('05');
  assertEquals(await runExpandSteps(harness(c, [goodRaw()]).deps, 'u1', { nope: 1 }), { ok: false, error: 'invalid_input' });
  const missing = harness(c, [goodRaw()]);
  missing.deps.rpc = (fn: string) => Promise.resolve({ data: fn === 'ai_expand_get' ? null : c.ctx, error: null });
  assertEquals(await runExpandSteps(missing.deps, 'u1', INPUT), { ok: false, error: 'invalid_input' });
  const own = harness(c, [goodRaw()], { idea: { ...(c.row.idea as NonNullable<typeof c.row.idea>), candidateRef: 'own:x' } });
  const r = await runExpandSteps(own.deps, 'u1', INPUT);
  assertEquals(r, { ok: false, error: 'invalid_input' });
  assertEquals(own.requests.length, 0);
});

Deno.test('流程：收藏的家常菜只有快照，照樣展開並存進收藏', async () => {
  const c = caseOf('01');
  const raw = goodRaw({
    ingredients: [ing('板豆腐', { unit: 'block' }), ing('豬絞肉', { amount: 150, unit: 'g' }), ing('蒜頭', { unit: 'clove', amount: 3 }), ing('蔥', { unit: 'stalk' }), ing('辣椒', { unit: 'piece' }), ing('醬油', { amount: 1, unit: 'tbsp' })],
    steps: [step('豆腐切塊，放進熱水汆燙。', { techniques: ['boil'] }), step('熱鍋炒香絞肉、蒜與辣椒。', { techniques: ['stir-fry'], equipment: ['wok'] }), step('下醬油和豆腐，輕輕推勻，撒蔥花。', { techniques: ['stir-fry'], equipment: ['wok'] })],
  });
  const h = harness(c, [raw]);
  const res = await runExpandSteps(h.deps, 'u1', { bookmarkId: U });
  assert(res.ok, JSON.stringify(res));
  assertEquals(h.saves[0]?.p_bookmark, c.row.bookmark_id);
  assertEquals(h.saves[0]?.p_cache, null);
  if (res.ok) assertEquals(c.assert(res.data.draft, envOf(c)), []);
});

Deno.test('流程：和快取列對不上的 id 不會寫進別人的點子（寫入的 id 都來自後端自己讀的資料）', async () => {
  const c = caseOf('05');
  const h = harness(c, [goodRaw()]);
  await runExpandSteps(h.deps, 'u1', { suggestionId: '0192f000-0000-7000-8000-0000000000aa', ideaId: '0192f000-0000-7000-8000-0000000000bb' });
  assertEquals(h.saves[0]?.p_cache, c.row.cache_id); // 不是手機送來的
  assertNotEquals(h.saves[0]?.p_cache, '0192f000-0000-7000-8000-0000000000aa');
});

Deno.test('量詞與刀工描述不算份量；外鍋水照寫；影響換算的數字照擋', () => {
  for (const t of ['煎成一片蛋皮。', '再加一顆煎蛋蓋在飯上。', '把雞胸肉橫向片開成兩片。', '外鍋倒入半杯水，按下開關。', '外鍋一杯水，蒸到開關跳起。']) {
    assertEquals(stepWordingProblems(t), false, t);
  }
  for (const t of ['蒸十分鐘。', '加入兩大匙醬油。', '倒入半杯水。', '煮到八十度。', '外鍋 1 杯水。', '放一百公克豆腐。']) {
    assertEquals(stepWordingProblems(t), true, t);
  }
});

Deno.test('過敏的人：食材名稱用字典比對（白米飯、白飯對得到），對不到仍整份不用', () => {
  const env = envOf(caseOf('03'));
  assertEquals(resolveIngredientId('白米飯'), 'rice');
  assertEquals(resolveIngredientId('白飯'), 'rice');
  const noSteps = { steps: [step('把雞腿肉煮熟，盛在飯旁。')] };
  const r = checkDraft(goodRaw({ ingredients: [ing('雞腿肉'), ing('白米飯', { amount: 2, unit: 'piece' })], ...noSteps }), env, opts);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.draft.ingredients[1]?.ingredientId, 'rice');
  const unknown = checkDraft(goodRaw({ ingredients: [ing('雞腿肉'), ing('神祕調味粉')], ...noSteps }), env, opts);
  assertEquals(unknown.ok, false);
  if (!unknown.ok) assert('allergen_unknown_ingredient' in unknown.problems);
});
