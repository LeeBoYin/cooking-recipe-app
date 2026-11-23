// 用說的評估集實跑（手動，不進 CI）：用真的 Claude 跑 10 組假的口述，Sonnet 5.5（正式模型）與 Haiku 5.5 各跑一次，
// 比較「整理得準不準」：作者填的內容有沒有被改（程式合併規則）、自動斷言、token、成本、延遲，
// 並把整理結果寫進 summary.md，給人工打分（填對、沒亂補、口吻對）。差距小就把 dictation 改用 Haiku（改 _shared/ai-models.ts）。
// 會花錢（10 組 × 2 個模型，合計不到 1 美元）。
//
// 在你自己的終端機執行，金鑰只放在這個指令的環境變數（不要貼進對話、不要寫進檔案）：
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/dictation/eval/run.ts [--case 03] [--model sonnet|haiku|both] [--out 資料夾]
//
// 終端機只印數量與代號，不印 AI 的輸出；輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
// 這裡每組只呼叫一次 Claude（不含自動重寫）：看第一次的輸出有多常守住作者填的內容，才知道重寫會多常發生。
import { AI_TASKS, costUsd, type TaskConfig } from '../../../_shared/ai-models.ts';
import { validate } from '../../../_shared/json-schema.ts';
import { DICTATION_LIMITS, type DictationResult, mergeKeepingOriginals } from '../../../../../packages/core/src/index.ts';
import { createClaude } from '../../claude.ts';
import type { ClaudeResponse } from '../../pipeline.ts';
import { buildDictationPrompt, DICTATION_SCHEMA, type RawDictation } from '../prompt.ts';
import { buildResult } from '../handler.ts';
import { DICTATION_CASES } from './cases.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const only = args.get('case');
const which = args.get('model') ?? 'both';

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('請先設定 ANTHROPIC_API_KEY（只放在這個指令的環境變數，不要貼進對話、不要寫進檔案）');
  Deno.exit(1);
}
const claude = createClaude(apiKey);
const ALL_MODELS: { name: string; cfg: TaskConfig }[] = [
  { name: 'Sonnet 5.5', cfg: AI_TASKS.dictation },
  { name: 'Haiku 5.5', cfg: { ...AI_TASKS.dictation, model: 'claude-haiku-5-5', thinking: 'off' } },
];
const MODELS = ALL_MODELS.filter((m) => which === 'both' || m.name.toLowerCase().startsWith(which));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = args.get('out') ?? new URL(`./out/${stamp}/`, import.meta.url).pathname;
await Deno.mkdir(out, { recursive: true });

interface Row {
  model: string;
  case: string;
  ok: boolean; // 有效輸出（格式對）
  keptOriginals: boolean; // 作者填的食材與步驟都原樣保留（不用重寫）
  assertFails: string[];
  input: number;
  output: number;
  cost: number;
  ms: number;
  result: DictationResult | null;
  error?: string;
}
const rows: Row[] = [];

for (const m of MODELS) {
  for (const c of DICTATION_CASES) {
    if (only && !c.id.startsWith(only)) continue;
    const prompt = buildDictationPrompt(c.input);
    const t0 = Date.now();
    let res: ClaudeResponse | null = null;
    let error: string | undefined;
    try {
      res = await claude({
        model: m.cfg.model,
        maxTokens: m.cfg.maxOutputTokens,
        effort: m.cfg.effort,
        thinking: m.cfg.thinking,
        system: [{ text: prompt.stable, cache: true }],
        messages: prompt.messages,
        outputSchema: DICTATION_SCHEMA,
      });
    } catch {
      error = 'upstream_error';
    }
    const ms = Date.now() - t0;
    let raw: RawDictation | null = null;
    if (res) {
      if (res.stopReason !== 'end_turn') error = `stop_reason:${res.stopReason}`;
      else {
        try {
          raw = JSON.parse(res.text) as RawDictation;
          if (validate(DICTATION_SCHEMA, raw).length > 0) {
            error = 'schema_invalid';
            raw = null;
          }
        } catch {
          error = 'invalid_json';
        }
      }
    }
    const cur = c.input.current;
    const kept =
      !!raw &&
      mergeKeepingOriginals(cur.ingredients, raw.ingredients, DICTATION_LIMITS.ingredients, DICTATION_LIMITS.ingredient) !== null &&
      mergeKeepingOriginals(cur.steps, raw.steps, DICTATION_LIMITS.steps, DICTATION_LIMITS.step) !== null;
    const result = raw ? buildResult(cur, raw) : null;
    const row: Row = {
      model: m.name,
      case: c.id,
      ok: !!raw,
      keptOriginals: kept,
      assertFails: result ? c.assert(result) : ['沒有有效的輸出'],
      input: res?.usage.inputTokens ?? 0,
      output: res?.usage.outputTokens ?? 0,
      cost: res ? costUsd(res.model, res.usage) : 0,
      ms,
      result,
      ...(error ? { error } : {}),
    };
    rows.push(row);
    await Deno.writeTextFile(`${out}/${m.name.split(' ')[0]}-${c.id}.json`, JSON.stringify({ row, rawOutput: raw }, null, 2));
    console.log(`${m.name} ${c.id}: ${row.ok ? 'ok' : error}、守住作者的內容 ${kept ? '是' : '否'}、斷言失敗 ${row.assertFails.length}、$${row.cost.toFixed(5)}、${ms}ms`);
  }
}

let md = `# 用說的評估（${stamp}）\n\n## 彙整\n\n| 模型 | 組數 | 有效輸出 | 守住作者填的內容 | 自動斷言全過 | 平均輸入 token | 平均輸出 token | 平均成本（美元） | 平均延遲 |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const m of MODELS) {
  const rs = rows.filter((r) => r.model === m.name);
  const n = rs.length || 1;
  const sum = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0);
  md += `| ${m.name} | ${rs.length} | ${rs.filter((r) => r.ok).length} | ${rs.filter((r) => r.keptOriginals).length}/${rs.length} | ${rs.filter((r) => r.assertFails.length === 0).length}/${rs.length} | ${Math.round(sum((r) => r.input) / n)} | ${Math.round(sum((r) => r.output) / n)} | ${(sum((r) => r.cost) / n).toFixed(5)} | ${Math.round(sum((r) => r.ms) / n)}ms |\n`;
}
md += `\n## 各組（人工打分：填得對 1–5、沒亂補 1–5、口吻 1–5；兩個模型並排比）\n`;
for (const c of DICTATION_CASES.filter((x) => !only || x.id.startsWith(only))) {
  md += `\n### ${c.id}　${c.name}\n\n期待：${c.expectation}\n\n口述：${c.input.text}\n`;
  for (const m of MODELS) {
    const r = rows.find((x) => x.model === m.name && x.case === c.id);
    if (!r) continue;
    md += `\n**${m.name}**　守住作者的內容：${r.keptOriginals ? '是' : '否'}　自動斷言：${r.assertFails.length ? r.assertFails.join('；') : '全過'}\n\n`;
    const x = r.result;
    if (x) {
      md += `- 標題：${x.title}\n- 心得：${x.story}\n- 料理筆記：${x.tips}\n- 值得記住：${x.highlights.join('、') || '（沒有）'}\n- 難易度：${x.difficulty ? Object.values(x.difficulty).join('／') : '（不回傳）'}\n`;
      md += `- 食材：${x.ingredients.map((i) => `${i.text}${i.from === null ? '（新）' : ''}`).join('；')}\n- 步驟：${x.steps.map((s, i) => `${i + 1}. ${s.text}${s.from === null ? '（新）' : ''}`).join(' ')}\n\n打分：填得對 ＿　沒亂補 ＿　口吻 ＿\n`;
    }
  }
}
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
