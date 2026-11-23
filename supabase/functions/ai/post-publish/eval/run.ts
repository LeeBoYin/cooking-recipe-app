// 發佈後整理評估集實跑（手動，不進 CI）：用真的 Claude（Haiku 5.5，正式模型）跑一句話與標籤＋難易度各幾組，
// 自動斷言（一句話過 checkChefNote；標籤在字典裡、難易度總分在範圍內）＋寫 summary.md 給人工看（一句話具不具體、有沒有憑空加料）。
// 會花錢（每組不到 0.001 美元）。
//
// 在你自己的終端機執行，金鑰只放在這個指令的環境變數（不要貼進對話、不要寫進檔案）：
//
//   ANTHROPIC_API_KEY=... deno run --no-lock --no-config -A supabase/functions/ai/post-publish/eval/run.ts [--only note|tags] [--out 資料夾]
//
// 終端機只印數量與代號，輸出寫進檔案（預設 eval/out/，已加進 .gitignore）。
import { AI_TASKS, costUsd } from '../../../_shared/ai-models.ts';
import { validate } from '../../../_shared/json-schema.ts';
import { difficultyOverall } from '../../../../../packages/core/src/index.ts';
import { createClaude } from '../../claude.ts';
import { checkChefNote } from '../../chef-note/handler.ts';
import { buildChefNotePrompt, CHEF_NOTE_SCHEMA } from '../../chef-note/prompt.ts';
import { checkPostPublish } from '../check.ts';
import { buildPostPublishPrompt, postPublishSchema, type RawPostPublish } from '../prompt.ts';
import { CHEF_NOTE_CASES, TAG_CASES } from './cases.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i += 2) args.set((Deno.args[i] ?? '').replace(/^--/, ''), Deno.args[i + 1] ?? '');
const only = args.get('only');

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
if (!apiKey) {
  console.error('請先設定 ANTHROPIC_API_KEY（只放在這個指令的環境變數，不要貼進對話、不要寫進檔案）');
  Deno.exit(1);
}
const claude = createClaude(apiKey);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = args.get('out') ?? new URL(`./out/${stamp}/`, import.meta.url).pathname;
await Deno.mkdir(out, { recursive: true });

let md = `# 發佈後整理評估（${stamp}）\n`;
let cost = 0;

if (only !== 'tags') {
  const cfg = AI_TASKS.chef_note;
  md += `\n## 一句話（自動斷言＋人工看：具體、不空洞、沒憑空加料、沒提次數）\n\n| 組 | 通過檢查 | 延遲 | 那句話 |\n|---|---|---|---|\n`;
  for (const c of CHEF_NOTE_CASES) {
    const prompt = buildChefNotePrompt(c.recipe);
    const t0 = Date.now();
    let note: string | null = null;
    try {
      const res = await claude({ model: cfg.model, maxTokens: cfg.maxOutputTokens, effort: cfg.effort, thinking: cfg.thinking, system: [{ text: prompt.stable, cache: true }], messages: prompt.messages, outputSchema: CHEF_NOTE_SCHEMA });
      cost += costUsd(res.model, res.usage);
      const parsed = res.stopReason === 'end_turn' ? (JSON.parse(res.text) as unknown) : null;
      note = parsed && validate(CHEF_NOTE_SCHEMA, parsed).length === 0 ? checkChefNote(parsed) : null;
      md += `| ${c.id} ${c.name} | ${note ? '是' : '否'} | ${Date.now() - t0}ms | ${note ?? ((parsed as { note?: string } | null)?.note ?? '（沒有輸出）')} |\n`;
    } catch {
      md += `| ${c.id} ${c.name} | 否 | ${Date.now() - t0}ms | （呼叫失敗） |\n`;
    }
    console.log(`note ${c.id}: ${note ? 'ok' : 'fail'} ${Date.now() - t0}ms`);
  }
}

if (only !== 'note') {
  const cfg = AI_TASKS.post_publish;
  md += `\n## 標籤與難易度\n\n| 組 | 有效輸出 | 斷言失敗 | 總分 | 菜系 | 主食材 | 手法 | 廚具 |\n|---|---|---|---|---|---|---|---|\n`;
  for (const c of TAG_CASES) {
    const prompt = buildPostPublishPrompt(c.input);
    const schema = postPublishSchema(c.input.withDifficulty);
    const fails: string[] = [];
    let row = '';
    try {
      const res = await claude({ model: cfg.model, maxTokens: cfg.maxOutputTokens, effort: cfg.effort, thinking: cfg.thinking, system: [{ text: prompt.stable, cache: true }], messages: prompt.messages, outputSchema: schema });
      cost += costUsd(res.model, res.usage);
      const raw = res.stopReason === 'end_turn' ? (JSON.parse(res.text) as RawPostPublish) : null;
      if (!raw || validate(schema, raw).length > 0) throw new Error('invalid');
      const r = checkPostPublish(raw, { withDifficulty: c.input.withDifficulty, hasSteps: c.input.steps.length > 0 });
      const overall = r.difficulty ? difficultyOverall(r.difficulty) : null;
      if (c.overall && (overall === null || overall < c.overall[0] || overall > c.overall[1])) fails.push(`總分 ${overall} 不在 ${c.overall.join('–')}`);
      if (!c.overall && r.difficulty) fails.push('不該有難易度');
      if (c.expectCuisine && !r.tags.cuisine_keys.some((k) => k.startsWith(c.expectCuisine!) || c.expectCuisine!.startsWith(k))) fails.push(`菜系沒有 ${c.expectCuisine}`);
      if (c.expectTechniques && !c.expectTechniques.some((t) => r.tags.techniques.includes(t))) fails.push(`手法沒有 ${c.expectTechniques.join('／')}`);
      row = `| ${c.id} ${c.name} | 是 | ${fails.join('；') || '全過'} | ${overall ?? '—'} | ${r.tags.cuisine_keys.join('、')} | ${r.tags.main_ingredient_ids.join('、')} | ${r.tags.techniques.join('、')} | ${r.tags.equipment_type_ids.join('、')} |`;
    } catch {
      row = `| ${c.id} ${c.name} | 否 | 沒有有效的輸出 | | | | | |`;
    }
    md += `${row}\n`;
    console.log(`tags ${c.id}: ${fails.length === 0 && !row.includes('沒有有效') ? 'ok' : 'fail'}`);
  }
}

md += `\n合計成本：US$${cost.toFixed(5)}\n`;
await Deno.writeTextFile(`${out}/summary.md`, md);
console.log(`已寫入 ${out}`);
