import { assertEquals } from 'jsr:@std/assert@1';
import type { DictRow } from '../_shared/ingredient-candidates.ts';
import type { AiResult } from '../ai/pipeline.ts';
import { type ClaimedJob, type RunnerDeps, runNormalization } from './runner.ts';

const row = (id: string, name: string, aliases: string[] = [], deprecated = false): DictRow => ({
  id, name: { 'zh-TW': name }, aliases: { 'zh-TW': aliases }, deprecated,
});
const DICT = [row('chili', '辣椒', ['朝天椒']), row('garlic', '大蒜', ['蒜頭']), row('old', '舊辣椒', [], true)];
const job = (id: string, text: string, by: string | null = 'u1'): ClaimedJob => ({ id, key: text.toLowerCase(), text, requested_by: by, attempts: 1 });
const okAi = (choices: number[], model = 'claude-haiku-5-5'): AiResult => ({
  ok: true, output: { choices }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, model,
});

function harness(jobs: ClaimedJob[], asks: (AiResult | ((user: string) => AiResult))[], budget = 'ok') {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const askLog: { user: string; input: { terms: { text: string; candidates: { id: string }[] }[] } }[] = [];
  let n = 0;
  const deps: RunnerDeps = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'ai_budget_state') return Promise.resolve({ data: budget, error: null });
      if (fn === 'claim_background_jobs') return Promise.resolve({ data: jobs, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    loadDict: () => Promise.resolve(DICT),
    ask: (user, input) => {
      askLog.push({ user, input });
      const a = asks[Math.min(n++, asks.length - 1)];
      return Promise.resolve(typeof a === 'function' ? a(user) : a);
    },
  };
  return { deps, calls, askLog, called: (fn: string) => calls.filter((c) => c.fn === fn) };
}

Deno.test('選第幾個候選：選到就對應，0 就是沒有合適的；一次只問一次 AI', async () => {
  const h = harness([job('a', '小朝天椒'), job('b', '蒜頭粉')], [okAi([1, 0])]);
  const s = await runNormalization(h.deps);
  assertEquals(h.askLog.length, 1);
  assertEquals(h.askLog[0].input.terms.length, 2);
  assertEquals(s.mapped, 1);
  assertEquals(s.none, 1);
  const results = h.called('complete_normalization_jobs')[0].args.p_results as { id: string; ingredient_id: string | null }[];
  assertEquals(results.find((r) => r.id === 'a')?.ingredient_id, h.askLog[0].input.terms[0].candidates[0].id);
  assertEquals(results.find((r) => r.id === 'b')?.ingredient_id, null);
});

Deno.test('候選裡沒有已淘汰的；沒有候選的詞不問 AI，直接記成沒有合適的', async () => {
  const h = harness([job('a', '舊辣椒'), job('b', 'ｚｚｚ')], [okAi([1])]);
  await runNormalization(h.deps);
  const terms = h.askLog[0].input.terms;
  assertEquals(terms.length, 1);
  assertEquals(terms[0].candidates.some((c) => c.id === 'old'), false);
  const results = h.called('complete_normalization_jobs')[0].args.p_results as { id: string; ingredient_id: string | null }[];
  assertEquals(results.find((r) => r.id === 'b')?.ingredient_id, null);
});

Deno.test('AI 選的編號不在候選裡就丟掉（任務失敗重試，不寫對應）', async () => {
  const h = harness([job('a', '小朝天椒'), job('b', '蒜頭')], [okAi([9, 1])]);
  const s = await runNormalization(h.deps);
  assertEquals(s.failed, 1);
  assertEquals(h.called('fail_background_job')[0].args, { p_id: 'a', p_code: 'invalid_choice', p_retry: true });
  const results = h.called('complete_normalization_jobs')[0].args.p_results as { id: string }[];
  assertEquals(results.map((r) => r.id), ['b']);
});

Deno.test('回傳長度和詞數不一致：全部當作失敗', async () => {
  const h = harness([job('a', '小朝天椒'), job('b', '蒜頭')], [okAi([1])]);
  const s = await runNormalization(h.deps);
  assertEquals(s.failed, 2);
  assertEquals(h.called('complete_normalization_jobs').length, 0);
});

Deno.test('預算用完：不領任務、不呼叫 AI', async () => {
  const h = harness([job('a', '小朝天椒')], [okAi([1])], 'exhausted');
  const s = await runNormalization(h.deps);
  assertEquals(s.paused, 'budget');
  assertEquals(h.called('claim_background_jobs').length, 0);
  assertEquals(h.askLog.length, 0);
});

Deno.test('呼叫時預算剛好用完：放回佇列，不算一次嘗試', async () => {
  const h = harness([job('a', '小朝天椒')], [{ ok: false, error: 'budget_exhausted' }]);
  const s = await runNormalization(h.deps);
  assertEquals(s.paused, 'budget');
  assertEquals(h.called('release_background_jobs')[0].args, { p_ids: ['a'], p_delay_seconds: 600 });
  assertEquals(h.called('fail_background_job').length, 0);
});

Deno.test('排隊的人超過上限：換下一位排隊的人代付', async () => {
  const h = harness([job('a', '小朝天椒', 'u1'), job('b', '蒜頭', 'u2')], [(u) => (u === 'u1' ? { ok: false, error: 'over_limit' } : okAi([1, 1]))]);
  const s = await runNormalization(h.deps);
  assertEquals(h.askLog.map((x) => x.user), ['u1', 'u2']);
  assertEquals(s.mapped, 2);
});

Deno.test('所有人都不能代付：放回佇列；沒有排隊的人（帳號已刪）：放棄', async () => {
  const blocked = harness([job('a', '小朝天椒', 'u1')], [{ ok: false, error: 'ai_paused' }]);
  const s1 = await runNormalization(blocked.deps);
  assertEquals(s1.released, 1);
  const orphan = harness([job('a', '小朝天椒', null)], [okAi([1])]);
  const s2 = await runNormalization(orphan.deps);
  assertEquals(orphan.askLog.length, 0);
  assertEquals(orphan.called('fail_background_job')[0].args, { p_id: 'a', p_code: 'no_requester', p_retry: false });
  assertEquals(s2.failed, 1);
});

Deno.test('Claude 出錯：任務失敗並留代號，之後退避重試', async () => {
  const h = harness([job('a', '小朝天椒')], [{ ok: false, error: 'upstream_error' }]);
  const s = await runNormalization(h.deps);
  assertEquals(s.failed, 1);
  assertEquals(h.called('fail_background_job')[0].args, { p_id: 'a', p_code: 'upstream_error', p_retry: true });
});

Deno.test('佇列是空的：什麼都不做', async () => {
  const h = harness([], [okAi([])]);
  const s = await runNormalization(h.deps);
  assertEquals(s.claimed, 0);
  assertEquals(h.askLog.length, 0);
});
