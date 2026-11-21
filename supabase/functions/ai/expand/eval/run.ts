// 展開做法評估集實跑（手動，不進 CI）：用真的 Claude（只跑 Sonnet 5.5，展開做法的正式模型）跑 5 組假使用者，
// 記下 token、快取、成本、延遲、程式檢查有沒有過（沒過就是「會自動重寫」的情況）與自動斷言，
// 並把食材與步驟整理成 summary.md，給人工打分步驟合不合理、口吻對不對。會花錢（5 組不到 1 美元）。
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/expand/eval/run.ts [--case 03] [--out 資料夾]
//
// 終端機只印數量與代號，不印 AI 的輸出；輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
// 這裡只呼叫一次 Claude（不含自動重寫）：看第一次的輸出有多常過檢查，才知道重寫會多常發生。
import { AI_TASKS, costUsd } from '../../../_shared/ai-models.ts';
import { validate } from '../../../_shared/json-schema.ts';
import type { RecipeDraft } from '../../../../../packages/core/src/index.ts';
import { createClaude } from '../../claude.ts';
import type { ClaudeResponse } from '../../pipeline.ts';
import { buildHomeEnv } from '../../home/env.ts';
import { checkDraft } from '../check.ts';
import { ideaFromRow } from '../idea.ts';
import { buildExpandPrompt, buildExpandSchema } from '../prompt.ts';
import type { RawDraft } from '../types.ts';
import { EXPAND_CASES, NOW } from './cases.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const only = args.get('case');

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('請先設定 ANTHROPIC_API_KEY（只放在這個指令的環境變數，不要寫進檔案）');
  Deno.exit(1);
}
const claude = createClaude(apiKey);
const cfg = AI_TASKS.expand_steps;
const schema = buildExpandSchema();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = args.get('out') ?? new URL(`./out/${stamp}/`, import.meta.url).pathname;
await Deno.mkdir(out, { recursive: true });

interface Row {
  case: string;
  ok: boolean; // 有效輸出（格式對）
  checked: boolean; // 程式檢查過了
  problems: string[];
  assertFails: string[];
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  ms: number;
  draft: RecipeDraft | null;
  error?: string;
}
const rows: Row[] = [];

for (const c of EXPAND_CASES) {
  if (only && !c.id.startsWith(only)) continue;
  const env = buildHomeEnv(c.ctx, NOW);
  const idea = ideaFromRow(c.row);
  if (!idea) {
    console.log(`${c.id}: 點子不能展開（自己的食譜）`);
    continue;
  }
  const prompt = buildExpandPrompt(env, idea, c.row.household_size);
  const t0 = Date.now();
  let res: ClaudeResponse | null = null;
  let error: string | undefined;
  try {
    res = await claude({
      model: cfg.model,
      maxTokens: cfg.maxOutputTokens,
      effort: cfg.effort,
      thinking: cfg.thinking,
      system: [{ text: prompt.stable, cache: true }, ...(prompt.volatile ? [{ text: prompt.volatile, cache: false }] : [])],
      messages: prompt.messages,
      outputSchema: schema,
    });
  } catch {
    error = 'upstream_error';
  }
  const ms = Date.now() - t0;
  let raw: RawDraft | null = null;
  if (res) {
    if (res.stopReason !== 'end_turn') error = `stop_reason:${res.stopReason}`;
    else {
      try {
        raw = JSON.parse(res.text) as RawDraft;
        if (validate(schema, raw).length > 0) {
          error = 'schema_invalid';
          raw = null;
        }
      } catch {
        error = 'invalid_json';
      }
    }
  }
  const checked = raw ? checkDraft(raw, env, { servings: c.row.household_size, model: res?.model ?? '' }) : null;
  const draft = checked?.ok ? checked.draft : null;
  const row: Row = {
    case: c.id,
    ok: !!raw,
    checked: !!draft,
    problems: checked && !checked.ok ? Object.entries(checked.problems).map(([k, n]) => `${k}×${n}`) : [],
    assertFails: draft ? c.assert(draft, env) : ['沒有通過檢查的輸出'],
    input: res?.usage.inputTokens ?? 0,
    output: res?.usage.outputTokens ?? 0,
    cacheRead: res?.usage.cacheReadTokens ?? 0,
    cacheWrite: res?.usage.cacheWriteTokens ?? 0,
    cost: res ? costUsd(res.model, res.usage) : 0,
    ms,
    draft,
    ...(error ? { error } : {}),
  };
  rows.push(row);
  await Deno.writeTextFile(`${out}/${c.id}.json`, JSON.stringify({ row, rawOutput: raw }, null, 2));
  console.log(`${c.id}: ${row.ok ? 'ok' : error}、${row.checked ? '檢查通過' : `檢查沒過 ${row.problems.join(' ')}`}、斷言失敗 ${row.assertFails.length}、$${row.cost.toFixed(5)}、${ms}ms`);
}

const n = rows.length || 1;
const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
let md = `# 展開做法評估（${stamp}）\n\n## 彙整\n\n| 組數 | 有效輸出 | 檢查一次就過 | 自動斷言全過 | 平均輸入 token | 平均輸出 token | 平均成本（美元） | 平均延遲 | 快取讀取／寫入 token |\n|---|---|---|---|---|---|---|---|---|\n`;
md += `| ${rows.length} | ${rows.filter((r) => r.ok).length} | ${rows.filter((r) => r.checked).length}/${rows.length} | ${rows.filter((r) => r.checked && r.assertFails.length === 0).length}/${rows.length} | ${Math.round(sum((r) => r.input) / n)} | ${Math.round(sum((r) => r.output) / n)} | ${(sum((r) => r.cost) / n).toFixed(5)} | ${Math.round(sum((r) => r.ms) / n)}ms | ${sum((r) => r.cacheRead)}／${sum((r) => r.cacheWrite)} |\n`;
md += `\n## 各組（人工打分：步驟合理度 1–5、口吻 1–5）\n`;
for (const c of EXPAND_CASES.filter((x) => !only || x.id.startsWith(only))) {
  const r = rows.find((x) => x.case === c.id);
  if (!r) continue;
  md += `\n### ${c.id}　${c.name}\n\n期待：${c.expectation}\n\n檢查：${r.checked ? '通過' : `沒過（${r.problems.join('、') || r.error}）`}　自動斷言：${r.assertFails.length ? r.assertFails.join('；') : '全過'}\n\n`;
  if (r.draft) {
    md += `${r.draft.servings} 人份\n\n` + r.draft.ingredients.map((i) => `- ${i.name} ${i.amount ?? ''}${i.amountMax ? `–${i.amountMax}` : ''} ${i.unit ?? ''}${i.optional ? '（可省略）' : ''}${i.group ? `［${i.group}］` : ''}`).join('\n');
    md += '\n\n' + r.draft.steps.map((s) => `${s.order}. ${s.text}${s.timerSeconds ? `（計時 ${s.timerSeconds} 秒）` : ''}${s.targetTemp ? `（${s.targetTemp.value}°${s.targetTemp.unit}）` : ''}`).join('\n');
    md += `\n\n小提醒：${r.draft.tips ?? '（沒有）'}\n\n打分：合理度 ＿　口吻 ＿\n\n`;
  }
}
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
