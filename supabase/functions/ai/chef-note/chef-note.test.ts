import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { AI_TASKS } from '../../_shared/ai-models.ts';
import type { AiContext, ClaudeRequest, ClaudeResponse } from '../pipeline.ts';
import type { Rpc } from '../usage.ts';
import { checkChefNote, CHEF_NOTE_DEADLINE_MS, type ChefNoteDeps, runChefNote } from './handler.ts';
import { buildChefNotePrompt, CHEF_NOTE_PROMPT_STABLE } from './prompt.ts';

const CTX: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const RID = '01a206a3-5c9b-7169-a921-9da572dfc95b';
const RECIPE = { lang: 'zh-TW', title: '薑絲蛋花湯', story: '薑放很多', tips: null, ingredients: ['薑 一大塊', '蛋 2 顆'], steps: ['煮滾', '倒蛋液'] };

function mk(opts: { note?: unknown; recipe?: unknown; ctx?: AiContext; stop?: string; saved?: boolean; clock?: number[] } = {}) {
  const calls: ClaudeRequest[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const clock = opts.clock ?? [0, 100];
  let t = 0;
  const rpc: Rpc = (fn, args) => {
    rpcCalls.push({ fn, args });
    if (fn === 'chef_note_context') return Promise.resolve({ data: opts.recipe === undefined ? RECIPE : opts.recipe, error: null });
    if (fn === 'save_chef_note') return Promise.resolve({ data: opts.saved ?? true, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  const deps: ChefNoteDeps & { calls: ClaudeRequest[]; rpcCalls: typeof rpcCalls } = {
    calls,
    rpcCalls,
    rpc,
    now: () => clock[Math.min(t++, clock.length - 1)]!,
    ai: {
      getContext: () => Promise.resolve(opts.ctx ?? CTX),
      claude: (req) => {
        calls.push(req);
        const res: ClaudeResponse = {
          stopReason: opts.stop ?? 'end_turn',
          text: JSON.stringify({ note: opts.note ?? '薑放得這麼大方，冷天喝這碗剛好。' }),
          usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
          model: 'claude-haiku-5-5',
        };
        return Promise.resolve(res);
      },
      tasks: {},
      allowInternalTasks: false,
    },
  };
  return deps;
}

Deno.test('任務設定：Haiku 5.5、不思考、輸出很短，不是背景任務', () => {
  assertEquals(AI_TASKS.chef_note.model, 'claude-haiku-5-5');
  assertEquals(AI_TASKS.chef_note.thinking, 'off');
  assertEquals('background' in AI_TASKS.chef_note, false);
});

Deno.test('提示詞：只根據這一篇、不提次數、不催促', () => {
  assertStringIncludes(CHEF_NOTE_PROMPT_STABLE, '只根據這一篇');
  assertStringIncludes(CHEF_NOTE_PROMPT_STABLE, '不要提到做了幾次');
  assertStringIncludes(buildChefNotePrompt(RECIPE).messages[0]!.content, '薑絲蛋花湯');
});

Deno.test('檢查：長度、次數與頻率、催促、驚嘆號與問句都擋下', () => {
  assertEquals(checkChefNote({ note: '薑放得這麼大方，冷天喝這碗剛好。' }), '薑放得這麼大方，冷天喝這碗剛好。');
  for (const bad of ['', '這是你第三次做這道菜了。', '你最近常做這道。', '下次記得少放鹽。', '好香！', '要不要加點胡椒？', '連續兩週都煮湯。', 'x'.repeat(61)]) {
    assertEquals(checkChefNote({ note: bad }), null, bad);
  }
  // 一律用中文說：英文整句不收；給建議的（下次可以…、可以試試…）不收，只說觀察
  assertEquals(checkChefNote({ note: 'Eight cloves of garlic is a bold call.' }), null);
  assertEquals(checkChefNote({ note: '烤到硬梆梆還能笑翻全家，下次可以先看看時間。' }), null); // 評估 05 的輸出
  assertEquals(checkChefNote({ note: '可以試試少放一點糖。' }), null);
  for (const bad of ['要記得翻面。', '記得要關火。', '記得先熱鍋。', '別忘了關火。']) assertEquals(checkChefNote({ note: bad }), null, bad);
  const e05 = '烤過頭變成石頭還能全家笑翻，這份手工餅乾的故事比味道更讓人記得。'; // 第二次評估 05 的輸出
  assertEquals(checkChefNote({ note: e05 }), e05);
  assertEquals(checkChefNote({ note: '蒜放了八瓣 garlic，一定很香。' }), '蒜放了八瓣 garlic，一定很香。'); // 夾英文食材名可以
  assertEquals(checkChefNote(null), null);
  assertEquals(checkChefNote({ note: 3 }), null);
});

Deno.test('成功：單獨呼叫一次、存進 recipe_private，回傳那句話', async () => {
  const d = mk();
  const r = await runChefNote(d, 'u1', { recipe_id: RID });
  assertEquals(r, { ok: true, data: { status: 'ok', note: '薑放得這麼大方，冷天喝這碗剛好。' } });
  assertEquals(d.calls.length, 1);
  assertEquals(d.rpcCalls.find((c) => c.fn === 'save_chef_note')?.args, { p_user: 'u1', p_recipe: RID, p_text: '薑放得這麼大方，冷天喝這碗剛好。' });
});

Deno.test('不是第一次發佈、不是自己的、已經有一句話：資料庫回 null，不叫 AI', async () => {
  const d = mk({ recipe: null });
  assertEquals(await runChefNote(d, 'u1', { recipe_id: RID }), { ok: true, data: { status: 'none' } });
  assertEquals(d.calls.length, 0);
});

Deno.test('超過 2 秒：不存、不顯示', async () => {
  const d = mk({ clock: [0, CHEF_NOTE_DEADLINE_MS + 1] });
  assertEquals(await runChefNote(d, 'u1', { recipe_id: RID }), { ok: true, data: { status: 'none' } });
  assertEquals(d.rpcCalls.some((c) => c.fn === 'save_chef_note'), false);
});

Deno.test('AI 不能用或沒過檢查：不顯示（不是錯誤）、不存', async () => {
  for (const d of [mk({ stop: 'refusal' }), mk({ stop: 'max_tokens' }), mk({ note: '第五次做了！' })]) {
    assertEquals(await runChefNote(d, 'u1', { recipe_id: RID }), { ok: true, data: { status: 'none' } });
    assertEquals(d.rpcCalls.some((c) => c.fn === 'save_chef_note'), false);
  }
});

Deno.test('帳號停用、AI 暫停或關閉：回錯誤代號；輸入不合法：invalid_input', async () => {
  assertEquals(await runChefNote(mk({ ctx: { ...CTX, status: 'suspended' } }), 'u1', { recipe_id: RID }), { ok: false, error: 'account_inactive' });
  assertEquals(await runChefNote(mk({ ctx: { ...CTX, ai_paused: true } }), 'u1', { recipe_id: RID }), { ok: false, error: 'ai_paused' });
  assertEquals(await runChefNote(mk({ ctx: { ...CTX, ai_enabled: false } }), 'u1', { recipe_id: RID }), { ok: false, error: 'ai_disabled' });
  for (const bad of [null, {}, { recipe_id: 'x' }, { recipe_id: RID, extra: 1 }, []]) {
    assertEquals(await runChefNote(mk(), 'u1', bad), { ok: false, error: 'invalid_input' });
  }
});

Deno.test('沒存成功（已經有一句話）：不顯示', async () => {
  assertEquals(await runChefNote(mk({ saved: false }), 'u1', { recipe_id: RID }), { ok: true, data: { status: 'none' } });
});

Deno.test('提示詞：一律用介面語言（中文）、不給建議；不再把食譜的語言交給 AI 決定', () => {
  const en = { ...RECIPE, lang: 'en', title: 'Garlic butter shrimp' };
  const p = buildChefNotePrompt(en);
  assert(CHEF_NOTE_PROMPT_STABLE.includes('一律用介面語言') && CHEF_NOTE_PROMPT_STABLE.includes('台灣繁體中文'));
  assert(CHEF_NOTE_PROMPT_STABLE.includes('不給建議') && CHEF_NOTE_PROMPT_STABLE.includes('只說觀察'));
  assertEquals(CHEF_NOTE_PROMPT_STABLE.includes('語言用食譜的語言'), false);
  assertEquals(p.messages[0]?.content.includes('語言：'), false);
});
