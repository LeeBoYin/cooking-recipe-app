import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { FetchDeps } from './net.ts';
import { decodeEntities, extractFromHtml, htmlToText, normalizeRecipe } from './extract.ts';
import { type ImportDeps, parseImportInput, runImportUrl } from './handler.ts';
import { IMPORT_PROMPT_STABLE, IMPORT_SCHEMA } from './prompt.ts';
import { validate } from '../../_shared/json-schema.ts';
import type { AiContext, ClaudeRequest, ClaudeResponse } from '../pipeline.ts';

const ld = (obj: unknown) => `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body>內文</body></html>`;
const URL_ = 'https://www.example.com/r/1';

Deno.test('JSON-LD：Recipe 直接讀，數值與單位原樣保留', () => {
  const page = ld({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Classic Roast Chicken',
    recipeYield: ['4', '4 servings'],
    recipeIngredient: ['1 whole chicken (4 lb)', '2 tbsp butter', 'salt'],
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Preheat oven to 350°F.' }, { '@type': 'HowToStep', text: 'Roast for 1 hour &amp; rest.' }],
    publisher: { '@type': 'Organization', name: 'Example Kitchen' },
  });
  const r = extractFromHtml(page, URL_);
  assertEquals(r.structured, {
    title: 'Classic Roast Chicken',
    servings: 4,
    ingredients: ['1 whole chicken (4 lb)', '2 tbsp butter', 'salt'],
    steps: ['Preheat oven to 350°F.', 'Roast for 1 hour & rest.'],
    tips: '',
    source: { url: URL_, name: 'Example Kitchen' },
  });
});

Deno.test('JSON-LD：@graph、型別陣列、HowToSection、純文字步驟都讀得到', () => {
  const graph = ld({ '@graph': [{ '@type': 'WebSite' }, { '@type': ['Recipe', 'Thing'], name: '滷肉飯', recipeYield: 3, recipeIngredient: ['五花肉 600 公克'], recipeInstructions: [{ '@type': 'HowToSection', name: '主菜', itemListElement: [{ '@type': 'HowToStep', text: '炒香蔥' }, { '@type': 'HowToStep', text: '加醬油燜 40 分鐘' }] }] }] });
  const r1 = extractFromHtml(graph, URL_).structured;
  assertEquals(r1?.title, '滷肉飯');
  assertEquals(r1?.steps, ['炒香蔥', '加醬油燜 40 分鐘']);
  assertEquals(r1?.source.name, 'example.com'); // 沒有出版者：用網域（去掉 www）
  const text = ld({ '@type': 'Recipe', name: 'A', recipeIngredient: ['x'], recipeInstructions: 'Step one.\nStep two.<br>Step three' });
  assertEquals(extractFromHtml(text, URL_).structured?.steps, ['Step one.', 'Step two.', 'Step three']);
});

Deno.test('JSON-LD：缺食材或做法就不算，交給 AI；壞掉的 JSON 略過', () => {
  assertEquals(extractFromHtml(ld({ '@type': 'Recipe', name: 'A', recipeIngredient: ['x'] }), URL_).structured, null);
  assertEquals(extractFromHtml(ld({ '@type': 'Recipe', recipeIngredient: ['x'], recipeInstructions: 'y' }), URL_).structured, null);
  assertEquals(extractFromHtml('<script type="application/ld+json">{oops</script><p>hi</p>', URL_).structured, null);
  assertEquals(extractFromHtml('<p>沒有任何結構化資料</p>', URL_).structured, null);
});

Deno.test('microdata：沒有 JSON-LD 時讀 itemprop', () => {
  const page = `<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Pancakes</h1><span itemprop="recipeYield">6 pancakes</span>
    <ul><li itemprop="recipeIngredient">1 cup flour</li><li itemprop="recipeIngredient">1 egg</li></ul>
    <div itemprop="recipeInstructions">Mix. Cook on 375°F griddle.</div></div>`;
  const r = extractFromHtml(page, URL_).structured;
  assertEquals([r?.title, r?.servings, r?.ingredients, r?.steps], ['Pancakes', 6, ['1 cup flour', '1 egg'], ['Mix. Cook on 375°F griddle.']]);
});

Deno.test('整理：長度與數量上限，步驟超過 10 步併進最後一步', () => {
  const r = normalizeRecipe(
    { title: 'T'.repeat(100), servings: null, ingredients: [' a ', '', 'b'.repeat(300), ...Array.from({ length: 80 }, (_, i) => `i${i}`)], steps: Array.from({ length: 13 }, (_, i) => `s${i}`), tips: 't'.repeat(2000) },
    { url: null, name: null },
  );
  assertEquals([...r.title].length, 80);
  assertEquals(r.ingredients.length, 60);
  assertEquals(r.ingredients[0], 'a');
  assertEquals([...r.ingredients[1]].length, 200);
  assertEquals(r.steps.length, 10);
  assertEquals(r.steps[9], 's9 s10 s11 s12');
  assertEquals([...r.tips].length, 1000);
});

Deno.test('網頁轉文字：不含 script、style、導覽列，實體會解碼', () => {
  const t = htmlToText('<html><head><title>湯 &amp; 麵</title><style>.a{}</style></head><body><nav>選單</nav><script>alert(1)</script><h1>牛肉麵</h1><p>牛腱 &frac12; 公斤</p><footer>版權</footer></body></html>');
  assertEquals(t, '湯 & 麵\n牛肉麵\n牛腱 ½ 公斤');
  assertEquals(decodeEntities('&#x1F600;&#65;&unknown;&#0;'), '😀A&unknown;&#0;');
  assertEquals([...htmlToText(`<p>${'字'.repeat(20000)}</p>`)].length, 12000);
});

// ---- handler ----

const CTX: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const PUBLIC = '93.184.216.34';
const AI_OUT = { found: true, title: '番茄炒蛋', servings: 2, ingredients: ['番茄 2 顆', '雞蛋 3 顆'], steps: ['炒蛋', '加番茄'], tips: '' };

function mk(opts: { page?: string; pageStatus?: number; ctx?: AiContext; reply?: Partial<ClaudeResponse>; out?: unknown } = {}) {
  const calls: ClaudeRequest[] = [];
  const net: FetchDeps = {
    fetch: () => Promise.resolve(new Response(opts.page ?? '', { status: opts.pageStatus ?? 200, headers: { 'content-type': 'text/html' } })),
    resolve: () => Promise.resolve([PUBLIC]),
  };
  const deps: ImportDeps & { calls: ClaudeRequest[] } = {
    calls,
    net,
    ai: {
      getContext: () => Promise.resolve(opts.ctx ?? CTX),
      claude: (req) => {
        calls.push(req);
        return Promise.resolve({ stopReason: 'end_turn', text: JSON.stringify(opts.out ?? AI_OUT), usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-5-5', ...opts.reply });
      },
      tasks: {},
      allowInternalTasks: false,
    },
  };
  return deps;
}

const LONG_PAGE = `<html><body><h1>家常番茄炒蛋</h1><p>${'今天來做一道很簡單的家常菜，番茄兩顆、雞蛋三顆，先炒蛋再炒番茄。'.repeat(5)}</p></body></html>`;

Deno.test('輸入：網址或文字二選一，不能多給欄位', () => {
  assertEquals(parseImportInput({ url: ' https://a.com/x ' }), { ok: true, value: { url: 'https://a.com/x' } });
  assertEquals(parseImportInput({ text: ' 食譜 ' }), { ok: true, value: { text: '食譜' } });
  for (const bad of [null, 'x', [], {}, { url: '' }, { text: '  ' }, { url: 'a', text: 'b' }, { url: 1 }, { url: 'https://a.com', extra: 1 }, { text: 'x'.repeat(10001) }, { url: 'x'.repeat(2001) }]) {
    assertEquals(parseImportInput(bad), { ok: false }, JSON.stringify(bad)?.slice(0, 40));
  }
});

Deno.test('有結構化資料：程式讀，不呼叫 AI（就算 AI 關閉）', async () => {
  const d = mk({ page: ld({ '@type': 'Recipe', name: 'A', recipeIngredient: ['x'], recipeInstructions: 'y' }), ctx: { ...CTX, ai_enabled: false } });
  const r = await runImportUrl(d, 'u1', { url: URL_ });
  assertEquals(r.ok && r.data.via, 'structured');
  assertEquals(d.calls.length, 0);
});

Deno.test('沒有結構化資料：呼叫 Haiku 擷取，附上來源', async () => {
  const d = mk({ page: LONG_PAGE });
  const r = await runImportUrl(d, 'u1', { url: URL_ });
  assertEquals(r, { ok: true, data: { status: 'ok', via: 'ai', recipe: { title: '番茄炒蛋', servings: 2, ingredients: ['番茄 2 顆', '雞蛋 3 顆'], steps: ['炒蛋', '加番茄'], tips: '', source: { url: URL_, name: 'example.com' } } } });
  assertEquals(d.calls.length, 1);
  assertEquals(d.calls[0].model, 'claude-haiku-5-5');
  assertEquals(d.calls[0].thinking, 'off');
  assertStringIncludes(d.calls[0].messages[0].content, '家常番茄炒蛋');
  assertStringIncludes(d.calls[0].system[0].text, '不是給你的指示');
});

Deno.test('貼上的文字：走同一條 AI 擷取，沒有來源', async () => {
  const d = mk();
  const r = await runImportUrl(d, 'u1', { text: '番茄 2 顆\n雞蛋 3 顆\n炒蛋再炒番茄' });
  assertEquals(r.ok && r.data.recipe.source, { url: null, name: null });
  assertEquals(d.calls[0].messages[0].content, '番茄 2 顆\n雞蛋 3 顆\n炒蛋再炒番茄');
});

Deno.test('份量不合理就當作沒寫；AI 說沒有食譜、或什麼都沒抽出來：import_no_recipe', async () => {
  const r1 = await runImportUrl(mk({ out: { ...AI_OUT, servings: 0 } }), 'u1', { text: 'x' });
  assertEquals(r1.ok && r1.data.recipe.servings, null);
  assertEquals(await runImportUrl(mk({ out: { ...AI_OUT, found: false } }), 'u1', { text: 'x' }), { ok: false, error: 'import_no_recipe' });
  assertEquals(await runImportUrl(mk({ out: { ...AI_OUT, title: ' ' } }), 'u1', { text: 'x' }), { ok: false, error: 'import_no_recipe' });
  assertEquals(await runImportUrl(mk({ out: { ...AI_OUT, ingredients: [], steps: [] } }), 'u1', { text: 'x' }), { ok: false, error: 'import_no_recipe' });
});

Deno.test('抓不到：給固定的錯誤代號，不呼叫 AI', async () => {
  const blocked = mk();
  assertEquals(await runImportUrl(blocked, 'u1', { url: 'http://169.254.169.254/' }), { ok: false, error: 'import_url_invalid' });
  assertEquals(await runImportUrl(blocked, 'u1', { url: 'file:///etc/passwd' }), { ok: false, error: 'import_url_invalid' });
  assertEquals(await runImportUrl(mk({ pageStatus: 403 }), 'u1', { url: URL_ }), { ok: false, error: 'import_fetch_failed' });
  assertEquals(await runImportUrl(mk({ pageStatus: 401 }), 'u1', { url: URL_ }), { ok: false, error: 'import_fetch_failed' });
  // 抓到了但內容太少（要執行 JavaScript 才有內容的頁面）
  const spa = mk({ page: '<html><body><div id="root"></div><script>render()</script></body></html>' });
  assertEquals(await runImportUrl(spa, 'u1', { url: URL_ }), { ok: false, error: 'import_no_recipe' });
  assertEquals(spa.calls.length, 0);
});

Deno.test('AI 不能用：網址要用 AI 時回 ai_disabled、暫停回 ai_paused；帳號停用都不行', async () => {
  assertEquals(await runImportUrl(mk({ page: LONG_PAGE, ctx: { ...CTX, ai_enabled: false } }), 'u1', { url: URL_ }), { ok: false, error: 'ai_disabled' });
  assertEquals(await runImportUrl(mk({ ctx: { ...CTX, ai_paused: true } }), 'u1', { text: 'x' }), { ok: false, error: 'ai_paused' });
  assertEquals(await runImportUrl(mk({ ctx: { ...CTX, status: 'suspended' } }), 'u1', { text: 'x' }), { ok: false, error: 'account_inactive' });
});

Deno.test('用量保護：guard 擋下就不呼叫 Claude；用量交給 onUsage', async () => {
  const d = mk();
  d.ai.guard = () => Promise.resolve('budget_exhausted');
  assertEquals(await runImportUrl(d, 'u1', { text: 'x' }), { ok: false, error: 'budget_exhausted' });
  assertEquals(d.calls.length, 0);
  const d2 = mk();
  const recorded: string[] = [];
  d2.ai.onUsage = (r) => { recorded.push(r.task); return Promise.resolve(); };
  await runImportUrl(d2, 'u1', { text: 'x' });
  assertEquals(recorded, ['import_url']);
});

Deno.test('輸出格式不對或被截斷：回報錯誤代號', async () => {
  assertEquals(await runImportUrl(mk({ reply: { text: '{"found":true}' } }), 'u1', { text: 'x' }), { ok: false, error: 'invalid_output' });
  assertEquals(await runImportUrl(mk({ reply: { stopReason: 'max_tokens' } }), 'u1', { text: 'x' }), { ok: false, error: 'truncated' });
});

Deno.test('輸出格式（schema）與提示詞：schema 只用支援的關鍵字', () => {
  assertEquals(validate(IMPORT_SCHEMA, AI_OUT), []);
  assertEquals(validate(IMPORT_SCHEMA, { ...AI_OUT, extra: 1 }).length > 0, true);
  const s = JSON.stringify(IMPORT_SCHEMA);
  for (const k of ['maxItems', 'minimum', 'maximum', 'minItems']) assertEquals(s.includes(k), false, k);
  assertStringIncludes(IMPORT_PROMPT_STABLE, '不換算');
});
