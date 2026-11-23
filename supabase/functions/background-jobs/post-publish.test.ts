import { assertEquals } from 'jsr:@std/assert@1';
import type { AiResult } from '../ai/pipeline.ts';
import type { PostPublishInput } from '../ai/post-publish/prompt.ts';
import { type PostPublishContext, type PostPublishDeps, runPostPublish, wantsDifficulty } from './post-publish.ts';

const ctx = (over: Partial<PostPublishContext> = {}): PostPublishContext => ({
  recipe_id: 'r1', user_id: 'u1', mode: 'publish', lang: 'zh-TW', title: '炒蛋', story: '好吃', tips: null,
  ingredients: [{ text: '蛋 3 顆', ingredient_id: null }], steps: ['炒'], difficulty_source: null, tags_confirmed: false,
  updated_at: '2026-11-23T00:00:00Z', ...over,
});
const okAi = (output: unknown): AiResult => ({ ok: true, output, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-5-5' });
const RAW = { cuisine_keys: ['cuisine.taiwan.home'], main_ingredients: [], techniques: ['pan-fry'], equipment_type_ids: [], difficulty: { ingredients: 1, equipment: 1, time: 1, technique: 2, failure_risk: 1 } };

function harness(contexts: (PostPublishContext | null)[], asks: AiResult[], budget = 'ok') {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const askLog: { user: string; input: PostPublishInput }[] = [];
  let n = 0;
  const deps: PostPublishDeps = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'ai_budget_state') return Promise.resolve({ data: budget, error: null });
      if (fn === 'claim_background_jobs') return Promise.resolve({ data: contexts.map((_, i) => ({ id: `j${i}` })), error: null });
      if (fn === 'post_publish_context') return Promise.resolve({ data: contexts[Number(String(args.p_job).slice(1))], error: null });
      return Promise.resolve({ data: null, error: null });
    },
    ask: (user, input) => {
      askLog.push({ user, input });
      return Promise.resolve(asks[Math.min(n++, asks.length - 1)]!);
    },
  };
  return { deps, calls, askLog, called: (fn: string) => calls.filter((c) => c.fn === fn) };
}

Deno.test('要不要估難易度：author 不估；沒有時估；AI 估的只有做法改了才重估；只有照片不估', () => {
  assertEquals(wantsDifficulty(ctx({ difficulty_source: 'author', mode: 'edit' })), false);
  assertEquals(wantsDifficulty(ctx({ difficulty_source: null })), true);
  assertEquals(wantsDifficulty(ctx({ difficulty_source: 'ai', mode: 'publish' })), false);
  assertEquals(wantsDifficulty(ctx({ difficulty_source: 'ai', mode: 'edit' })), true);
  assertEquals(wantsDifficulty(ctx({ story: '', steps: [], ingredients: [] })), false);
  assertEquals(wantsDifficulty(ctx({ steps: [], ingredients: [], story: '只有心得' })), true);
});

Deno.test('一個任務：問一次 AI，標籤與難易度一起寫回，作者名義計費', async () => {
  const h = harness([ctx()], [okAi(RAW)]);
  const s = await runPostPublish(h.deps);
  assertEquals(h.askLog.length, 1);
  assertEquals(h.askLog[0]!.user, 'u1');
  assertEquals(h.askLog[0]!.input.withDifficulty, true);
  const done = h.called('complete_post_publish')[0]!.args;
  assertEquals((done.p_tags as { cuisine_keys: string[] }).cuisine_keys, ['cuisine.taiwan.home']);
  assertEquals((done.p_difficulty as { estimated_from: string }).estimated_from, 'recipe');
  assertEquals(done.p_read_at, '2026-11-23T00:00:00Z');
  assertEquals(s.done, 1);
});

Deno.test('作者動過的難易度：不要難易度，只回標籤', async () => {
  const { difficulty: _d, ...tagsOnly } = RAW;
  const h = harness([ctx({ difficulty_source: 'author' })], [okAi(tagsOnly)]);
  await runPostPublish(h.deps);
  assertEquals(h.askLog[0]!.input.withDifficulty, false);
  assertEquals(h.called('complete_post_publish')[0]!.args.p_difficulty, null);
});

Deno.test('食譜已經不在：不問 AI，任務結束', async () => {
  const h = harness([null], [okAi(RAW)]);
  const s = await runPostPublish(h.deps);
  assertEquals(h.askLog.length, 0);
  assertEquals(s.skipped, 1);
});

Deno.test('預算用完：不領任務，暫停', async () => {
  const h = harness([ctx()], [okAi(RAW)], 'exhausted');
  const s = await runPostPublish(h.deps);
  assertEquals(s.paused, 'budget');
  assertEquals(h.called('claim_background_jobs').length, 0);
});

Deno.test('途中預算用完：這個與後面的放回佇列，不算一次嘗試', async () => {
  const h = harness([ctx(), ctx(), ctx()], [okAi(RAW), { ok: false, error: 'budget_exhausted' }]);
  const s = await runPostPublish(h.deps);
  assertEquals(s.done, 1);
  assertEquals(s.paused, 'budget');
  assertEquals(h.called('release_background_jobs')[0]!.args.p_ids, ['j1', 'j2']);
});

Deno.test('這個人超過上限：放回去晚點再試；其他錯誤退避重試；輸入不合法不重試', async () => {
  const h = harness([ctx(), ctx(), ctx()], [{ ok: false, error: 'over_limit' }, { ok: false, error: 'upstream_error' }, { ok: false, error: 'invalid_input' }]);
  await runPostPublish(h.deps);
  assertEquals(h.called('release_background_jobs')[0]!.args, { p_ids: ['j0'], p_delay_seconds: 300 });
  const fails = h.called('fail_background_job').map((c) => c.args);
  assertEquals(fails, [{ p_id: 'j1', p_code: 'upstream_error', p_retry: true }, { p_id: 'j2', p_code: 'invalid_input', p_retry: false }]);
});

Deno.test('要估難易度但 AI 沒給：失敗重試，不寫半套', async () => {
  const { difficulty: _d, ...tagsOnly } = RAW;
  const h = harness([ctx()], [okAi(tagsOnly)]);
  await runPostPublish(h.deps);
  assertEquals(h.called('complete_post_publish').length, 0);
  assertEquals(h.called('fail_background_job')[0]!.args.p_code, 'invalid_output');
});
