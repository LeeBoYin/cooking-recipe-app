import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { AI_TASKS, BUDGET_DEGRADE, costUsd, degradeConfig, MODEL_PRICES, priceOf } from '../_shared/ai-models.ts';
import { hashInput, runAi, type AiContext, type ClaudeResponse, type Deps } from './pipeline.ts';
import { TASKS } from './tasks.ts';
import { createProtection, type Rpc, sessionIdOf } from './usage.ts';

const CTX: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const USAGE = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 100 };

Deno.test('費用：用價格表算，改價格不用改程式', () => {
  // haiku：1000×0.1 + 200×0.5 + 500×0.01 + 100×0.125 = 217.5 → /1e6
  assertEquals(costUsd('claude-haiku-5-5', USAGE), 0.0002175);
  assertEquals(costUsd('claude-sonnet-5-5', USAGE), (1000 * 2 + 200 * 10 + 500 * 0.1 + 100 * 2.5) / 1e6);
  assertEquals(costUsd('claude-haiku-5-5', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), 0);
  assertEquals(priceOf('claude-sonnet-5-5-20260101'), MODEL_PRICES['claude-sonnet-5-5']); // 帶日期尾巴
  assertEquals(priceOf('claude-sonnet-5-50'), MODEL_PRICES['claude-opus-5-5']); // 前綴不能亂配：認不得照最貴算
  assertEquals(priceOf('something-new'), MODEL_PRICES['claude-opus-5-5']);
});

Deno.test('降級：首頁點子改 Haiku（關思考）、靈感彩蛋改模板、其他不動', () => {
  const home = degradeConfig('home_ideas', AI_TASKS.home_ideas);
  assertEquals(typeof home === 'object' && [home.model, home.thinking, home.maxOutputTokens], ['claude-haiku-5-5', 'off', 2000]);
  assertEquals(degradeConfig('inspiration_egg', AI_TASKS.inspiration_egg), 'use_rules');
  assertEquals(degradeConfig('chat', AI_TASKS.chat), AI_TASKS.chat); // 對話不變
  assertEquals(Object.keys(BUDGET_DEGRADE).sort(), ['home_ideas', 'inspiration_egg']);
});

function fakeRpc(guard: unknown, calls: { fn: string; args: Record<string, unknown> }[] = []): Rpc {
  return (fn, args) => {
    calls.push({ fn, args });
    return Promise.resolve({ data: fn === 'ai_guard_check' ? guard : null, error: null });
  };
}
const CALL = { userId: 'u1', ctx: CTX };

Deno.test('guard：資料庫的判斷轉成錯誤代號；背景任務不算速率', async () => {
  for (const [verdict, expected] of [['budget_exhausted', 'budget_exhausted'], ['over_limit', 'over_limit'], ['rate_limited', 'rate_limited']] as const) {
    const g = createProtection(fakeRpc({ verdict, degraded: false }), null).guard!;
    assertEquals(await g({ ...CALL, task: 'chat', config: AI_TASKS.chat }), expected);
  }
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const g = createProtection(fakeRpc({ verdict: 'ok', degraded: false }, calls), null).guard!;
  assertEquals(await g({ ...CALL, task: 'chat', config: AI_TASKS.chat }), null);
  await g({ ...CALL, task: 'post_publish', config: AI_TASKS.post_publish });
  assertEquals(calls.map((c) => c.args.p_background), [false, true]);
});

Deno.test('guard：預算 80% 時套用降級；對話不變', async () => {
  const g = createProtection(fakeRpc({ verdict: 'ok', degraded: true }), null).guard!;
  const home = await g({ ...CALL, task: 'home_ideas', config: AI_TASKS.home_ideas });
  assertEquals(typeof home === 'object' && home !== null && home.config.model, 'claude-haiku-5-5');
  assertEquals(await g({ ...CALL, task: 'inspiration_egg', config: AI_TASKS.inspiration_egg }), 'budget_exhausted');
  const chat = await g({ ...CALL, task: 'chat', config: AI_TASKS.chat });
  assertEquals(typeof chat === 'object' && chat !== null && chat.config.model, 'claude-sonnet-5-5');
});

Deno.test('guard：資料庫出錯就不放行', async () => {
  const g = createProtection(() => Promise.resolve({ data: null, error: { code: 'XX000' } }), null).guard!;
  await assertRejects(() => g({ ...CALL, task: 'chat', config: AI_TASKS.chat }));
  const g2 = createProtection(fakeRpc({ verdict: 'weird', degraded: false }), null).guard!;
  await assertRejects(() => g2({ ...CALL, task: 'chat', config: AI_TASKS.chat }));
});

Deno.test('onUsage：寫入費用、雜湊與 session，不含輸入內容；寫失敗不丟錯', async () => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const p = createProtection(fakeRpc(null, calls), 'sess-1');
  await p.onUsage!({ userId: 'u1', task: '_selftest', model: 'claude-haiku-5-5', usage: USAGE, ok: true, latencyMs: 12, inputHash: 'a'.repeat(32), inputRatio: 50 });
  assertEquals(calls[0].fn, 'ai_record_usage');
  assertEquals(calls[0].args.p_cost_usd, 0.0002175);
  assertEquals(calls[0].args.p_session_id, 'sess-1');
  assertEquals(JSON.stringify(calls[0].args).includes('text'), false);
  const bad = createProtection(() => Promise.reject(new Error('boom')), null);
  await bad.onUsage!({ userId: 'u1', task: '_selftest', model: 'claude-haiku-5-5', usage: USAGE, ok: true, latencyMs: 1, inputHash: 'a'.repeat(32), inputRatio: null });
});

Deno.test('整合：被 guard 擋下不呼叫 Claude；放行時帶著雜湊與長度比例寫用量', async () => {
  let claudeCalls = 0;
  const recorded: Record<string, unknown>[] = [];
  const base: Deps = {
    getContext: () => Promise.resolve(CTX),
    claude: () => {
      claudeCalls++;
      return Promise.resolve({ stopReason: 'end_turn', text: '{"reply":"hi","length":2}', usage: USAGE, model: 'claude-haiku-5-5' } as ClaudeResponse);
    },
    tasks: TASKS,
    allowInternalTasks: true,
  };
  const blocked = { ...base, guard: () => Promise.resolve('rate_limited' as const) };
  assertEquals(await runAi(blocked, 'u1', '_selftest', { text: 'hi' }), { ok: false, error: 'rate_limited' });
  assertEquals(claudeCalls, 0);
  const ok = { ...base, onUsage: (r: Record<string, unknown>) => (recorded.push(r), Promise.resolve()) };
  await runAi(ok as Deps, 'u1', '_selftest', { text: '字'.repeat(100) });
  assertEquals(recorded[0].inputRatio, 50); // 100 / 200
  assertEquals(recorded[0].inputHash, await hashInput({ text: '字'.repeat(100) }));
  assertEquals(/^[0-9a-f]{32}$/.test(recorded[0].inputHash as string), true);
});

Deno.test('sessionIdOf：讀 JWT 的 session_id', () => {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  assertEquals(sessionIdOf(`h.${enc({ session_id: 'abc' })}.s`), 'abc');
  assertEquals(sessionIdOf(`h.${enc({})}.s`), null);
  assertEquals(sessionIdOf('nope'), null);
});
