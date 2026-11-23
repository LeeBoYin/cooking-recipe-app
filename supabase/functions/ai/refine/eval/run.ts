// 用說的改食譜評估集實跑（手動，不進 CI）：用真的 Claude（Haiku 5.5，正式模型）跑 8 組假的修改指令，
// 看「只改該改的」「對不上時不亂改」「夾帶的指令不照做」：自動斷言、token、成本、延遲，
// 並把變更清單寫進 summary.md，給人工打分。會花錢（8 組，合計不到 0.01 美元）。
//
// 在你自己的終端機執行，金鑰只放在這個指令的環境變數（不要貼進對話、不要寫進檔案）：
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/refine/eval/run.ts [--case 03] [--out 資料夾]
//
// 終端機只印數量與代號，不印 AI 的輸出；輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
import { AI_TASKS, costUsd } from '../../../_shared/ai-models.ts';
import { validate } from '../../../_shared/json-schema.ts';
import { type RawRefine, type RefineChange, refineChanges } from '../../../../../packages/core/src/index.ts';
import { createClaude } from '../../claude.ts';
import type { ClaudeResponse } from '../../pipeline.ts';
import { buildRefinePrompt, REFINE_SCHEMA } from '../prompt.ts';
import { REFINE_CASES } from './cases.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const only = args.get('case');

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('請先設定 ANTHROPIC_API_KEY（只放在這個指令的環境變數，不要貼進對話、不要寫進檔案）');
  Deno.exit(1);
}
const claude = createClaude(apiKey);
const cfg = AI_TASKS.edit_by_voice;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = args.get('out') ?? new URL(`./out/${stamp}/`, import.meta.url).pathname;
await Deno.mkdir(out, { recursive: true });

interface Row {
  case: string;
  ok: boolean;
  assertFails: string[];
  input: number;
  output: number;
  cost: number;
  ms: number;
  changes: RefineChange[] | null;
  error?: string;
}
const rows: Row[] = [];
const cases = REFINE_CASES.filter((c) => !only || c.id.startsWith(only));

for (const c of cases) {
  const prompt = buildRefinePrompt(c.input);
  const t0 = Date.now();
  let res: ClaudeResponse | null = null;
  let error: string | undefined;
  try {
    res = await claude({
      model: cfg.model,
      maxTokens: cfg.maxOutputTokens,
      effort: cfg.effort,
      thinking: cfg.thinking,
      system: [{ text: prompt.stable, cache: true }],
      messages: prompt.messages,
      outputSchema: REFINE_SCHEMA,
    });
  } catch {
    error = 'upstream_error';
  }
  const ms = Date.now() - t0;
  let raw: RawRefine | null = null;
  if (res) {
    if (res.stopReason !== 'end_turn') error = `stop_reason:${res.stopReason}`;
    else {
      try {
        raw = JSON.parse(res.text) as RawRefine;
        if (validate(REFINE_SCHEMA, raw).length > 0) {
          error = 'schema_invalid';
          raw = null;
        }
      } catch {
        error = 'invalid_json';
      }
    }
  }
  const changes = raw ? refineChanges(c.input.current, raw) : null;
  const row: Row = {
    case: c.id,
    ok: !!raw,
    assertFails: changes ? c.assert(changes) : ['沒有有效的輸出'],
    input: res?.usage.inputTokens ?? 0,
    output: res?.usage.outputTokens ?? 0,
    cost: res ? costUsd(res.model, res.usage) : 0,
    ms,
    changes,
    ...(error ? { error } : {}),
  };
  rows.push(row);
  await Deno.writeTextFile(`${out}/${c.id}.json`, JSON.stringify({ row, rawOutput: raw }, null, 2));
  console.log(`${c.id}: ${row.ok ? 'ok' : error}、斷言失敗 ${row.assertFails.length}、修改 ${changes?.length ?? 0} 處、$${row.cost.toFixed(5)}、${ms}ms`);
}

const n = rows.length || 1;
const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
let md = `# 用說的改食譜評估（${stamp}）\n\n## 彙整\n\n| 模型 | 組數 | 有效輸出 | 自動斷言全過 | 平均輸入 token | 平均輸出 token | 平均成本（美元） | 平均延遲 |\n|---|---|---|---|---|---|---|---|\n`;
md += `| ${cfg.model} | ${rows.length} | ${rows.filter((r) => r.ok).length} | ${rows.filter((r) => r.assertFails.length === 0).length}/${rows.length} | ${Math.round(sum((r) => r.input) / n)} | ${Math.round(sum((r) => r.output) / n)} | ${(sum((r) => r.cost) / n).toFixed(5)} | ${Math.round(sum((r) => r.ms) / n)}ms |\n`;
md += `\n## 各組（人工打分：改得對 1–5、沒亂動 1–5）\n`;
const show = (c: RefineChange): string => {
  if (c.kind === 'field') return `${c.field}：「${c.from}」→「${c.to}」`;
  if (c.op === 'add') return `${c.kind} 新增（第 ${c.after + 1} 項後面）：${c.to}`;
  if (c.op === 'remove') return `${c.kind} 拿掉第 ${c.index + 1} 項：${c.from}`;
  return `${c.kind} 第 ${c.index + 1} 項：「${c.from}」→「${c.to}」`;
};
for (const c of cases) {
  const r = rows.find((x) => x.case === c.id);
  if (!r) continue;
  md += `\n### ${c.id}　${c.name}\n\n期待：${c.expectation}\n\n指令：${c.input.text}\n\n自動斷言：${r.assertFails.length ? r.assertFails.join('；') : '全過'}\n\n`;
  md += (r.changes ?? []).length ? (r.changes ?? []).map((x) => `- ${show(x)}`).join('\n') : '（沒有修改）';
  md += `\n\n打分：改得對 ＿　沒亂動 ＿\n`;
}
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
