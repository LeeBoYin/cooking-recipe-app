import { assertEquals } from 'jsr:@std/assert@1';
import { validate } from '../_shared/json-schema.ts';
import { AI_TASKS, isTaskName, publicTaskList } from '../_shared/ai-models.ts';
import { type AiContext, type AiErrorCode, type ClaudeRequest, type ClaudeResponse, type Deps, runAi, UpstreamError } from './pipeline.ts';
import { TASKS } from './tasks.ts';

const OK_CTX: AiContext = { status: 'active', ai_paused: false, plan: 'free', ai_enabled: true };
const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0 };

function response(over: Partial<ClaudeResponse> = {}): ClaudeResponse {
  return { stopReason: 'end_turn', text: JSON.stringify({ reply: 'hi', length: 2 }), usage: USAGE, model: 'claude-haiku-5-5', ...over };
}

function deps(over: Partial<Deps> & { reply?: ClaudeResponse | Error } = {}): Deps & { calls: ClaudeRequest[] } {
  const calls: ClaudeRequest[] = [];
  const reply = over.reply ?? response();
  return {
    calls,
    getContext: () => Promise.resolve(OK_CTX),
    claude: (req) => {
      calls.push(req);
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
    },
    tasks: TASKS,
    allowInternalTasks: true,
    ...over,
  };
}

Deno.test('成功：回傳輸出與 token 用量，請求依設定檔組出來', async () => {
  const d = deps();
  const r = await runAi(d, 'u1', '_selftest', { text: 'hi' });
  assertEquals(r, { ok: true, output: { reply: 'hi', length: 2 }, usage: USAGE, model: 'claude-haiku-5-5' });
  const req = d.calls[0];
  assertEquals([req.model, req.effort, req.thinking, req.maxTokens], ['claude-haiku-5-5', 'low', 'off', 200]);
  assertEquals(req.system.length, 1);
  assertEquals(req.system[0].cache, true); // 前段可快取
  assertEquals(req.messages, [{ role: 'user', content: 'hi' }]);
});

Deno.test('檢查順序：帳號 → AI 開關 → 白名單 → 輸入，擋下時不呼叫 Claude', async () => {
  const cases: [string, Partial<Deps>, unknown, unknown, AiErrorCode][] = [
    ['沒有帳號資料', { getContext: () => Promise.resolve(null) }, '_selftest', { text: 'a' }, 'account_inactive'],
    ['停用', { getContext: () => Promise.resolve({ ...OK_CTX, status: 'suspended' }) }, '_selftest', { text: 'a' }, 'account_inactive'],
    ['暫停 AI', { getContext: () => Promise.resolve({ ...OK_CTX, ai_paused: true }) }, '_selftest', { text: 'a' }, 'ai_paused'],
    ['總開關關閉', { getContext: () => Promise.resolve({ ...OK_CTX, ai_enabled: false }) }, '_selftest', { text: 'a' }, 'ai_disabled'],
    ['不在白名單', {}, 'tell_me_a_joke', { text: 'a' }, 'unknown_task'],
    ['任務名稱不是字串', {}, { x: 1 }, { text: 'a' }, 'unknown_task'],
    ['原型鏈上的名稱', {}, 'constructor', {}, 'unknown_task'],
    ['在白名單但還沒實作', {}, 'chat', { text: 'a' }, 'task_not_available'],
    ['正式環境不能呼叫內部任務', { allowInternalTasks: false }, '_selftest', { text: 'a' }, 'task_not_available'],
    ['輸入不是物件', {}, '_selftest', 'a', 'invalid_input'],
    ['輸入空字串', {}, '_selftest', { text: '' }, 'invalid_input'],
    ['輸入太長', {}, '_selftest', { text: '字'.repeat(201) }, 'invalid_input'],
  ];
  for (const [name, over, task, input, expected] of cases) {
    const d = deps(over);
    const r = await runAi(d, 'u1', task, input);
    assertEquals(r, { ok: false, error: expected }, name);
    assertEquals(d.calls.length, 0, `${name}：不該呼叫 Claude`);
  }
});

Deno.test('長度用字數算，不是位元組', async () => {
  const r = await runAi(deps(), 'u1', '_selftest', { text: '字'.repeat(200) });
  assertEquals(r.ok, true);
});

Deno.test('用量保護的掛載點：回傳代號就擋下，不呼叫 Claude', async () => {
  const d = deps({ guard: () => Promise.resolve('rate_limited') });
  assertEquals(await runAi(d, 'u1', '_selftest', { text: 'a' }), { ok: false, error: 'rate_limited' });
  assertEquals(d.calls.length, 0);
});

Deno.test('用量保護的掛載點：可以改寫這次的設定（降級）', async () => {
  const d = deps({ guard: ({ config }) => Promise.resolve({ config: { ...config, maxOutputTokens: 50 } }) });
  await runAi(d, 'u1', '_selftest', { text: 'a' });
  assertEquals(d.calls[0].maxTokens, 50);
});

Deno.test('stop_reason：拒答、截斷、其他都回統一的錯誤碼', async () => {
  const cases: [string | null, AiErrorCode][] = [
    ['refusal', 'refused'],
    ['max_tokens', 'truncated'],
    ['tool_use', 'invalid_output'],
    ['pause_turn', 'invalid_output'],
    [null, 'invalid_output'],
  ];
  for (const [stopReason, expected] of cases) {
    const r = await runAi(deps({ reply: response({ stopReason }) }), 'u1', '_selftest', { text: 'a' });
    assertEquals(r, { ok: false, error: expected }, String(stopReason));
  }
});

Deno.test('輸出不是 JSON 或不符合 schema', async () => {
  const bad = ['not json', '', JSON.stringify({ reply: 'x' }), JSON.stringify({ reply: 1, length: 1 }), JSON.stringify({ reply: 'x', length: 1, extra: true })];
  for (const text of bad) {
    const r = await runAi(deps({ reply: response({ text }) }), 'u1', '_selftest', { text: 'a' });
    assertEquals(r, { ok: false, error: 'invalid_output' }, text);
  }
});

Deno.test('Claude 出錯：upstream_error；其他例外往外丟', async () => {
  assertEquals(await runAi(deps({ reply: new UpstreamError('x') }), 'u1', '_selftest', { text: 'a' }), { ok: false, error: 'upstream_error' });
  let thrown = false;
  try {
    await runAi(deps({ reply: new Error('boom') }), 'u1', '_selftest', { text: 'a' });
  } catch {
    thrown = true;
  }
  assertEquals(thrown, true);
});

Deno.test('用量紀錄的掛載點：成功與被截斷、拒答都會交出 token 用量', async () => {
  const seen: { ok: boolean; cache: number }[] = [];
  const onUsage: Deps['onUsage'] = (r) => {
    seen.push({ ok: r.ok, cache: r.usage.cacheReadTokens });
    return Promise.resolve();
  };
  await runAi(deps({ onUsage }), 'u1', '_selftest', { text: 'a' });
  await runAi(deps({ onUsage, reply: response({ stopReason: 'max_tokens' }) }), 'u1', '_selftest', { text: 'a' });
  assertEquals(seen, [{ ok: true, cache: 50 }, { ok: false, cache: 50 }]);
});

Deno.test('設定檔：白名單、內部任務不顯示在後台', () => {
  assertEquals(isTaskName('chat'), true);
  assertEquals(isTaskName('toString'), false);
  assertEquals(publicTaskList().some((t) => t.task.startsWith('_')), false);
  for (const c of Object.values(AI_TASKS)) {
    assertEquals(c.model === 'claude-haiku-5-5' || c.thinking === 'adaptive', true, 'Sonnet／Opus 關不掉思考');
  }
});

Deno.test('JSON Schema 驗證', () => {
  const schema = {
    type: 'object',
    properties: { n: { type: 'integer', minimum: 1, maximum: 5 }, tags: { type: 'array', items: { enum: ['a', 'b'] }, maxItems: 2 }, s: { type: 'string', maxLength: 2 } },
    required: ['n'],
    additionalProperties: false,
  };
  assertEquals(validate(schema, { n: 3, tags: ['a'], s: '字字' }), []);
  assertEquals(validate(schema, { n: 0 }).length, 1);
  assertEquals(validate(schema, { n: 1.5 }).length, 1);
  assertEquals(validate(schema, { tags: [] }).length, 1);
  assertEquals(validate(schema, { n: 1, tags: ['c'] }).length, 1);
  assertEquals(validate(schema, { n: 1, tags: ['a', 'b', 'a'] }).length, 1);
  assertEquals(validate(schema, { n: 1, s: '字字字' }).length, 1);
  assertEquals(validate(schema, { n: 1, z: 1 }).length, 1);
  assertEquals(validate(schema, [1]).length, 1);
  assertEquals(validate({ type: 'string', pattern: 'x' }, 'x').length, 1); // 不認得的關鍵字不放行
  assertEquals(validate({ anyOf: [{ type: 'string' }, { type: 'null' }] }, null), []);
  // 錯誤只有位置，不含值
  assertEquals(validate(schema, { n: 'secret' }).join('').includes('secret'), false);
});

Deno.test('normalize_ingredients：輸入檢查與提示', async () => {
  const def = TASKS.normalize_ingredients!;
  const bad = [null, {}, { terms: [] }, { terms: [{ text: 'x', candidates: [] }] }, { terms: [{ text: '', candidates: [{ id: 'a', name: 'b' }] }] }];
  for (const b of bad) assertEquals(def.parseInput(b as never).ok, false);
  const good = { terms: [{ text: '小朝天椒', candidates: [{ id: 'chili', name: '辣椒' }, { id: 'pepper', name: '胡椒' }] }] };
  assertEquals(def.parseInput(good as never).ok, true);
  const d = deps({ reply: response({ text: JSON.stringify({ choices: [1] }) }) });
  const r = await runAi(d, 'u1', 'normalize_ingredients', good);
  assertEquals(r.ok, true);
  // 候選用編號，輸出只有整數：使用者輸入不會出現在輸出裡
  assertEquals(d.calls[0].messages[0].content.includes('1) 辣椒'), true);
  assertEquals(d.calls[0].model, 'claude-haiku-5-5');
  assertEquals(d.calls[0].maxTokens, 300);
  assertEquals(validate(def.outputSchema, { choices: ['x'] }).length > 0, true); // 範圍與長度由 runner 檢查，不在 schema
  assertEquals(validate(def.outputSchema, { choices: [0, 3] }).length, 0);
});
