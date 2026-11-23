// 靈感彩蛋評估集實跑（手動，不進 CI）：用真的 Claude（Haiku 5.5）跑 6 組假使用者，記下 token、成本、自動檢查的通過率，
// 並整理成 summary.md 給人工打分（一句話的口吻、那道菜合不合理）。每組不到 1 美分。
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/egg/eval/run.ts [--case e03] [--out 資料夾]
//
// 終端機只印數量與代號，不印 AI 的輸出；輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
import { AI_TASKS, costUsd } from '../../../_shared/ai-models.ts';
import { validate } from '../../../_shared/json-schema.ts';
import { createClaude } from '../../claude.ts';
import type { ClaudeResponse } from '../../pipeline.ts';
import { buildHomeEnv } from '../../home/env.ts';
import type { HomeIdea } from '../../home/types.ts';
import { checkEgg } from '../check.ts';
import { buildEggPrompt, EGG_SCHEMA } from '../prompt.ts';
import { EGG_CASES, NOW } from './cases.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const only = args.get('case');

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('請先設定 ANTHROPIC_API_KEY（只放在這個指令的環境變數，不要寫進檔案）');
  Deno.exit(1);
}
const claude = createClaude(apiKey);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = args.get('out') ?? new URL(`./out/${stamp}/`, import.meta.url).pathname;
await Deno.mkdir(out, { recursive: true });

interface Row {
  case: string;
  ok: boolean;
  kept: boolean;
  dropped: Record<string, number>;
  assertFails: string[];
  input: number;
  output: number;
  cost: number;
  ms: number;
  idea: HomeIdea | null;
  error?: string;
}
const rows: Row[] = [];
const cfg = AI_TASKS.inspiration_egg;

for (const c of EGG_CASES) {
  if (only && !c.id.startsWith(only)) continue;
  const env = buildHomeEnv(c.ctx, NOW);
  const prompt = buildEggPrompt(env, c.feature);
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
      outputSchema: EGG_SCHEMA,
    });
  } catch {
    error = 'upstream_error';
  }
  const ms = Date.now() - t0;
  let raw: unknown = null;
  if (res) {
    if (res.stopReason !== 'end_turn') error = `stop_reason:${res.stopReason}`;
    else {
      try {
        raw = JSON.parse(res.text);
        if (validate(EGG_SCHEMA, raw).length > 0) {
          error = 'schema_invalid';
          raw = null;
        }
      } catch {
        error = 'invalid_json';
      }
    }
  }
  const checked = raw ? checkEgg(raw, env, c.feature) : { idea: null, dropped: {} };
  const row: Row = {
    case: c.id,
    ok: !!raw,
    kept: !!checked.idea,
    dropped: checked.dropped as Record<string, number>,
    assertFails: checked.idea ? c.assert(checked.idea) : raw ? ['沒過程式檢查'] : ['沒有輸出'],
    input: res?.usage.inputTokens ?? 0,
    output: res?.usage.outputTokens ?? 0,
    cost: res ? costUsd(res.model, res.usage) : 0,
    ms,
    idea: checked.idea,
    ...(error ? { error } : {}),
  };
  rows.push(row);
  await Deno.writeTextFile(`${out}/${c.id}.json`, JSON.stringify({ row, rawOutput: raw }, null, 2));
  console.log(`${c.id}: ${row.ok ? 'ok' : error} 檢查${row.kept ? '通過' : '沒過'}、自動斷言失敗 ${row.assertFails.length}、$${row.cost.toFixed(5)}、${ms}ms`);
}

const n = rows.length || 1;
const avg = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0) / n;
let md = `# 靈感彩蛋評估（${stamp}）\n\n## 彙整\n\n組數 ${rows.length}；有效輸出 ${rows.filter((r) => r.ok).length}；程式檢查通過 ${rows.filter((r) => r.kept).length}；自動斷言全過 ${rows.filter((r) => r.kept && r.assertFails.length === 0).length}\n\n`;
md += `平均輸入 ${Math.round(avg((r) => r.input))} token、輸出 ${Math.round(avg((r) => r.output))} token、成本 $${avg((r) => r.cost).toFixed(5)}、延遲 ${Math.round(avg((r) => r.ms))}ms\n\n## 各組（人工打分：一句話的口吻 1–5、那道菜合理度 1–5）\n`;
for (const c of EGG_CASES.filter((x) => !only || x.id.startsWith(only))) {
  const r = rows.find((x) => x.case === c.id);
  if (!r) continue;
  md += `\n### ${c.id}　${c.name}\n\n程式挑的：${c.feature.name}\n\n期待：${c.expectation}\n\n被拿掉：${JSON.stringify(r.dropped)}　自動斷言：${r.assertFails.length ? r.assertFails.join('；') : '全過'}\n\n`;
  md += r.idea ? `- **${r.idea.title}**（難度 ${r.idea.difficulty.overall}）${r.idea.why}\n\n` : '- （沒有出現）\n\n';
  md += '打分：口吻 ＿　合理度 ＿\n';
}
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
