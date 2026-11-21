// 評估集實跑（手動，不進 CI）：用真的 Claude 跑 10 組假使用者，記下每次的 token、快取、成本、自動檢查的通過率，
// 並把 Sonnet 與 Haiku 的輸出並排整理成 summary.md，給人工打分口吻與合理度。會花錢（每組不到 1 美分）。
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/home/eval/run.ts [--model sonnet|haiku|both] [--case 05] [--out 資料夾]
//
// 終端機只印數量與代號，不印 AI 的輸出；輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
import { AI_TASKS, costUsd, type ModelId } from '../../../_shared/ai-models.ts';
import { createClaude } from '../../claude.ts';
import type { ClaudeResponse } from '../../pipeline.ts';
import { validate } from '../../../_shared/json-schema.ts';
import { checkHomeOutput } from '../check.ts';
import { buildHomeEnv } from '../env.ts';
import { buildHomePrompt, buildHomeSchema } from '../prompt.ts';
import type { HomeIdea, RawOutput } from '../types.ts';
import { EVAL_CASES, NOW } from './cases.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const which = args.get('model') ?? 'both';
const only = args.get('case');
type ModelRun = { label: string; model: ModelId; thinking: 'adaptive' | 'off' };
const MODELS: ModelRun[] = [
  { label: 'sonnet', model: 'claude-sonnet-5-5', thinking: 'adaptive' },
  { label: 'haiku', model: 'claude-haiku-5-5', thinking: 'off' }, // 預算降級時的設定（BUDGET_DEGRADE）
].filter((m) => which === 'both' || m.label === which) as ModelRun[];

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
  model: string;
  ok: boolean;
  raw: number;
  kept: number;
  dropped: Record<string, number>;
  assertFails: string[];
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  ms: number;
  ideas: HomeIdea[];
  chefComment: string | null;
  error?: string;
}
const rows: Row[] = [];

for (const c of EVAL_CASES) {
  if (only && !c.id.startsWith(only)) continue;
  const env = buildHomeEnv(c.ctx, c.now ?? NOW);
  if (!c.callsAi) {
    console.log(`${c.id}: 不叫 AI（新手門檻）${env.notEnough ? '：符合預期' : '：不符合預期！'}`);
    continue;
  }
  const prompt = buildHomePrompt(env, { titles: [], refs: [] });
  const schema = buildHomeSchema(env);
  for (const m of MODELS) {
    const cfg = AI_TASKS.home_ideas;
    const t0 = Date.now();
    let res: ClaudeResponse | null = null;
    let error: string | undefined;
    try {
      res = await claude({
        model: m.model,
        maxTokens: cfg.maxOutputTokens,
        effort: cfg.effort,
        thinking: m.thinking,
        system: [{ text: prompt.stable, cache: true }, ...(prompt.volatile ? [{ text: prompt.volatile, cache: false }] : [])],
        messages: prompt.messages,
        outputSchema: schema,
      });
    } catch {
      error = 'upstream_error';
    }
    const ms = Date.now() - t0;
    let raw: RawOutput | null = null;
    if (res) {
      if (res.stopReason !== 'end_turn') error = `stop_reason:${res.stopReason}`;
      else {
        try {
          raw = JSON.parse(res.text) as RawOutput;
          if (validate(schema, raw).length > 0) {
            error = 'schema_invalid';
            raw = null;
          }
        } catch {
          error = 'invalid_json';
        }
      }
    }
    const checked = raw ? checkHomeOutput(raw, env) : { ideas: [] as HomeIdea[], chefComment: null, dropped: {} };
    const row: Row = {
      case: c.id,
      model: m.label,
      ok: !!raw,
      raw: raw?.suggestions.length ?? 0,
      kept: checked.ideas.length,
      dropped: checked.dropped as Record<string, number>,
      assertFails: raw ? c.assert(checked.ideas, env) : ['沒有輸出'],
      input: res?.usage.inputTokens ?? 0,
      output: res?.usage.outputTokens ?? 0,
      cacheRead: res?.usage.cacheReadTokens ?? 0,
      cacheWrite: res?.usage.cacheWriteTokens ?? 0,
      cost: res ? costUsd(res.model, res.usage) : 0,
      ms,
      ideas: checked.ideas,
      chefComment: checked.chefComment,
      ...(error ? { error } : {}),
    };
    rows.push(row);
    await Deno.writeTextFile(`${out}/${c.id}.${m.label}.json`, JSON.stringify({ row, rawOutput: raw }, null, 2));
    console.log(`${c.id} ${m.label}: ${row.ok ? 'ok' : error} 原始 ${row.raw}、留下 ${row.kept}、自動檢查失敗 ${row.assertFails.length}、$${row.cost.toFixed(5)}、${ms}ms`);
  }
}

// 彙整表與並排輸出（給人工打分）
const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);
let md = `# 首頁點子評估（${stamp}）\n\n## 彙整\n\n| 模型 | 組數 | 有效輸出 | 原始點子 | 檢查後留下 | 留下比例 | 自動斷言全過 | 平均輸入 token | 平均輸出 token | 平均成本（美元） | 平均延遲 |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const m of MODELS) {
  const rs = rows.filter((r) => r.model === m.label);
  const n = rs.length;
  const sum = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0);
  md += `| ${m.label} | ${n} | ${rs.filter((r) => r.ok).length} | ${sum((r) => r.raw)} | ${sum((r) => r.kept)} | ${pct(sum((r) => r.kept), sum((r) => r.raw))} | ${rs.filter((r) => r.ok && r.assertFails.length === 0).length}/${n} | ${Math.round(sum((r) => r.input) / (n || 1))} | ${Math.round(sum((r) => r.output) / (n || 1))} | ${(sum((r) => r.cost) / (n || 1)).toFixed(5)} | ${Math.round(sum((r) => r.ms) / (n || 1))}ms |\n`;
}
const cacheOf = (label: string, f: (r: Row) => number) => rows.filter((r) => r.model === label).reduce((a, r) => a + f(r), 0);
md += `\n快取讀取／寫入 token 合計：${MODELS.map((m) => `${m.label} ${cacheOf(m.label, (r) => r.cacheRead)}／${cacheOf(m.label, (r) => r.cacheWrite)}`).join('；')}\n`;
md += `\n## 各組並排（人工打分：口吻 1–5、合理度 1–5）\n`;
for (const c of EVAL_CASES.filter((x) => x.callsAi && (!only || x.id.startsWith(only)))) {
  md += `\n### ${c.id}　${c.name}\n\n期待：${c.expectation}\n\n`;
  for (const m of MODELS) {
    const r = rows.find((x) => x.case === c.id && x.model === m.label);
    if (!r) continue;
    md += `**${m.label}**　原始 ${r.raw}／留下 ${r.kept}　被拿掉：${JSON.stringify(r.dropped)}　自動斷言：${r.assertFails.length ? r.assertFails.join('；') : '全過'}\n\n`;
    md += r.ideas.map((i) => `- [${i.slot}] **${i.title}**（難度 ${i.difficulty.overall}）${i.why}`).join('\n');
    md += `\n- 大廚的話：${r.chefComment ?? '（沒過檢查，改用情境句子）'}\n\n打分：口吻 ＿　合理度 ＿\n\n`;
  }
}
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
