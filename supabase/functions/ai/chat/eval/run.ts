// 對話評估集實跑（手動，不進 CI）：用真的 Claude（只跑 Sonnet 5.5，對話的正式模型）跑 6 段劇本，
// 記下每輪的 token、快取、成本、自動斷言的結果，並把每輪的使用者的話與大廚的回應整理成 summary.md，給人工打分口吻與合理度。
// 會花錢（6 段約 12 輪，合計不到 1 美元）。
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/chat/eval/run.ts [--case 03] [--out 資料夾]
//
// 終端機只印數量與代號，不印 AI 的輸出；輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
import { AI_TASKS, costUsd } from '../../../_shared/ai-models.ts';
import { validate } from '../../../_shared/json-schema.ts';
import { createClaude } from '../../claude.ts';
import type { ClaudeResponse } from '../../pipeline.ts';
import { buildChatSchema } from '../prompt.ts';
import type { RawChatOutput } from '../types.ts';
import { CHAT_CASES, NOW } from './cases.ts';
import { simulate } from './simulate.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const only = args.get('case');

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('請先設定 ANTHROPIC_API_KEY（只放在這個指令的環境變數，不要寫進檔案）');
  Deno.exit(1);
}
const claude = createClaude(apiKey);
const cfg = AI_TASKS.chat;
const schema = buildChatSchema();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = args.get('out') ?? new URL(`./out/${stamp}/`, import.meta.url).pathname;
await Deno.mkdir(out, { recursive: true });

interface TurnRow {
  n: number;
  ok: boolean;
  error?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  ms: number;
}
let body = '';
const all: TurnRow[] = [];
let passed = 0;
let total = 0;

for (const c of CHAT_CASES) {
  if (only && !c.id.startsWith(only)) continue;
  const rows: TurnRow[] = [];
  const sim = await simulate(c.ctx, NOW, c.users, async (prompt, n) => {
    const t0 = Date.now();
    let res: ClaudeResponse | null = null;
    let error: string | undefined;
    try {
      res = await claude({
        model: cfg.model,
        maxTokens: cfg.maxOutputTokens,
        effort: cfg.effort,
        thinking: cfg.thinking,
        system: [{ text: prompt.stable, cache: true }, ...(prompt.volatile ? [{ text: prompt.volatile, cache: prompt.cacheVolatile === true }] : [])],
        messages: prompt.messages,
        outputSchema: schema,
        stream: true,
      });
    } catch {
      error = 'upstream_error';
    }
    let raw: RawChatOutput | null = null;
    if (res) {
      if (res.stopReason !== 'end_turn') error = `stop_reason:${res.stopReason}`;
      else {
        try {
          raw = JSON.parse(res.text) as RawChatOutput;
          if (validate(schema, raw).length > 0) {
            error = 'schema_invalid';
            raw = null;
          }
        } catch {
          error = 'invalid_json';
        }
      }
    }
    const row: TurnRow = {
      n,
      ok: !!raw,
      ...(error ? { error } : {}),
      input: res?.usage.inputTokens ?? 0,
      output: res?.usage.outputTokens ?? 0,
      cacheRead: res?.usage.cacheReadTokens ?? 0,
      cacheWrite: res?.usage.cacheWriteTokens ?? 0,
      cost: res ? costUsd(res.model, res.usage) : 0,
      ms: Date.now() - t0,
    };
    rows.push(row);
    console.log(`${c.id} 第 ${n + 1} 輪: ${row.ok ? 'ok' : error}、輸入 ${row.input}、輸出 ${row.output}、快取讀 ${row.cacheRead}、$${row.cost.toFixed(5)}、${row.ms}ms`);
    return raw;
  }, c.start ?? null);
  all.push(...rows);

  const fails = c.assert(sim);
  total += 1;
  if (fails.length === 0) passed += 1;
  console.log(`${c.id}: 自動斷言 ${fails.length === 0 ? '全過' : `失敗 ${fails.length} 項`}`);
  await Deno.writeTextFile(
    `${out}/${c.id}.json`,
    JSON.stringify({ rows, turns: sim.turns.map((t) => ({ user: t.user, raw: t.raw, checked: t.checked, full: t.full })), fails }, null, 2),
  );

  body += `\n## ${c.id}　${c.name}\n\n期待：${c.expectation}\n\n自動斷言：${fails.length ? fails.join('；') : '全過'}\n\n`;
  let apiTurn = 0;
  for (const t of sim.turns) {
    body += `**使用者**：${t.user}\n\n`;
    if (t.full) {
      body += `（這一段已滿，沒有送出）\n\n`;
      continue;
    }
    const k = t.checked;
    if (!t.raw) body += `（呼叫失敗或格式不合：${rows[apiTurn]?.error ?? ''}）\n\n`;
    else if (!k || !k.ok) body += `（沒過檢查：${k?.reason}，被拿掉：${JSON.stringify(k?.dropped)}）\n\n`;
    else {
      body += `**大廚**：${k.reply}${k.ask ? `\n\n反問：${k.ask}` : ''}\n\n`;
      body += k.ideas.map((x) => `- [${x.slot}] **${x.title}**（難度 ${x.difficulty.overall}）${x.why}`).join('\n') + (k.ideas.length ? '\n\n' : '');
      body += `說過的食材：${JSON.stringify(k.mentioned)}　偏好訊號：${JSON.stringify(k.signals)}　摘要：${k.summary ?? '（沒更新）'}　被拿掉：${JSON.stringify(k.dropped)}\n\n`;
    }
    apiTurn += 1;
    body += `打分：口吻 ＿　合理度 ＿\n\n`;
  }
}

const n = all.length || 1;
const sum = (f: (r: TurnRow) => number) => all.reduce((a, r) => a + f(r), 0);
const md =
  `# 和大廚聊聊評估（${stamp}）\n\n模型：${cfg.model}（effort ${cfg.effort}）\n\n## 彙整\n\n` +
  `- 劇本自動斷言全過：${passed}/${total}\n- 有效輸出：${all.filter((r) => r.ok).length}/${all.length} 輪\n` +
  `- 平均輸入 token ${Math.round(sum((r) => r.input) / n)}、輸出 ${Math.round(sum((r) => r.output) / n)}；快取讀／寫合計 ${sum((r) => r.cacheRead)}／${sum((r) => r.cacheWrite)}\n` +
  `- 平均每輪成本 US$${(sum((r) => r.cost) / n).toFixed(5)}；平均延遲 ${Math.round(sum((r) => r.ms) / n)}ms\n${body}`;
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
