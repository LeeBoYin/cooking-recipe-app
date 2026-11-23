// dictation（M1b-03）：把口述整理進編輯頁的欄位。
// 流程：驗證輸入 → 帳號與開關 → 組提示詞、呼叫 Claude → 驗證格式 → 程式合併（保留作者填的內容，只補新的）
// → 作者原本的食材或步驟被模型改到就重寫一次，還是不行就那一份維持作者原本的 → 回傳。
// 什麼都不存：口述原文與欄位由手機隨草稿存檔。紀錄只有數量與原因代號，不含口述與內容。
import {
  DICTATION_HIGHLIGHTS,
  DICTATION_LIMITS,
  DICTATION_MAX_CHARS,
  type DictationCurrent,
  type DictationInput,
  type DictationItem,
  type DictationResponse,
  type DifficultyValues,
  mergeKeepingOriginals,
} from '../../../../packages/core/src/index.ts';
import { type AiErrorCode, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import { recordOutcome, type Rpc } from '../usage.ts';
import { buildDictationPrompt, DICTATION_SCHEMA, type RawDictation } from './prompt.ts';

export type DictationRunResult = { ok: true; data: DictationResponse } | { ok: false; error: AiErrorCode };
type DictationResultData = DictationResponse['result'];

export interface DictationDeps {
  ai: Deps;
  rpc: Rpc;
}

export const MAX_ATTEMPTS = 2; // 作者填的項目被改到：重寫一次

const len = (s: string) => [...s].length;

function strings(v: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems) return null;
  return v.every((x) => typeof x === 'string' && x.trim() !== '' && len(x) <= maxChars) ? (v as string[]) : null;
}

function parseCurrent(raw: unknown): DictationCurrent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { title, story, tips, ingredients, steps, highlights, difficultySource, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  if (typeof title !== 'string' || len(title) > DICTATION_LIMITS.title) return null;
  if (typeof story !== 'string' || len(story) > DICTATION_LIMITS.story) return null;
  if (typeof tips !== 'string' || len(tips) > DICTATION_LIMITS.tips) return null;
  const ing = strings(ingredients, DICTATION_LIMITS.ingredients, DICTATION_LIMITS.ingredient);
  const stp = strings(steps, DICTATION_LIMITS.steps, DICTATION_LIMITS.step);
  const hl = strings(highlights, DICTATION_HIGHLIGHTS.length, 40);
  if (!ing || !stp || !hl) return null;
  if (difficultySource !== null && difficultySource !== 'author' && difficultySource !== 'ai') return null;
  return { title, story, tips, ingredients: ing, steps: stp, highlights: hl, difficultySource };
}

export function parseDictationInput(raw: unknown): { ok: true; value: DictationInput } | { ok: false } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false };
  const { text, lang, current, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false };
  if (typeof text !== 'string' || typeof lang !== 'string' || lang.length === 0 || lang.length > 20) return { ok: false };
  const trimmed = text.trim();
  if (trimmed === '' || len(trimmed) > DICTATION_MAX_CHARS) return { ok: false };
  const cur = parseCurrent(current);
  if (!cur) return { ok: false };
  return { ok: true, value: { text: trimmed, lang, current: cur } };
}

const clampFacet = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
const cutTo = (s: string, max: number) => (len(s) > max ? [...s].slice(0, max).join('') : s);

// 模型的輸出和作者已經填的內容合併。食材與步驟：作者原本的項目被改到就是 null（那一份不採用）
export function mergeOutput(cur: DictationCurrent, raw: RawDictation): { ingredients: DictationItem[] | null; steps: DictationItem[] | null } {
  return {
    ingredients: mergeKeepingOriginals(cur.ingredients, raw.ingredients, DICTATION_LIMITS.ingredients, DICTATION_LIMITS.ingredient),
    steps: mergeKeepingOriginals(cur.steps, raw.steps, DICTATION_LIMITS.steps, DICTATION_LIMITS.step),
  };
}

// 整理成回給編輯頁的結果。作者填過的欄位原樣保留，空的才用模型的；作者填的食材或步驟被改到的那一份維持作者原本的
export function buildResult(cur: DictationCurrent, raw: RawDictation): DictationResultData {
  const merged = mergeOutput(cur, raw);
  const keep = (original: string[]): DictationItem[] => original.map((text, from) => ({ text, from }));
  const difficulty: DifficultyValues | null =
    cur.difficultySource === 'author'
      ? null
      : {
          ingredients: clampFacet(raw.difficulty.ingredients),
          equipment: clampFacet(raw.difficulty.equipment),
          time: clampFacet(raw.difficulty.time),
          technique: clampFacet(raw.difficulty.technique),
          failure_risk: clampFacet(raw.difficulty.failure_risk),
        };
  const highlights =
    cur.highlights.length > 0
      ? cur.highlights
      : [...new Set(raw.highlights.filter((h) => (DICTATION_HIGHLIGHTS as readonly string[]).includes(h)))].slice(0, 2);
  return {
    title: cur.title !== '' ? cur.title : cutTo(raw.title.trim(), DICTATION_LIMITS.title),
    story: cur.story !== '' ? cur.story : cutTo(raw.story.trim(), DICTATION_LIMITS.story),
    tips: cur.tips !== '' ? cur.tips : cutTo(raw.tips.trim(), DICTATION_LIMITS.tips),
    ingredients: merged.ingredients ?? keep(cur.ingredients),
    steps: merged.steps ?? keep(cur.steps),
    highlights,
    difficulty,
  };
}

export async function runDictation(deps: DictationDeps, userId: string, rawInput: unknown): Promise<DictationRunResult> {
  const parsed = parseDictationInput(rawInput);
  if (!parsed.ok) return { ok: false, error: 'invalid_input' };
  const input = parsed.value;
  const cur = input.current;

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  let problems: ('ingredients' | 'steps')[] = [];
  let raw: RawDictation | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildDictationPrompt(input, problems);
    const def: TaskDefinition<Record<string, never>> = {
      parseInput: () => ({ ok: true, value: {} }),
      buildPrompt: () => prompt,
      outputSchema: DICTATION_SCHEMA,
      inputSize: () => ({ length: len(input.text), limit: DICTATION_MAX_CHARS }),
    };
    const result = await runAi({ ...deps.ai, tasks: { dictation: def as never } }, userId, 'dictation', { attempt, n: len(input.text) });
    if (!result.ok) {
      // 格式不對、被截斷：重寫一次；其他（AI 不能用、被擋下、逾時…）直接失敗，手機把原話放進心得
      if ((result.error === 'invalid_output' || result.error === 'truncated') && attempt < MAX_ATTEMPTS) continue;
      if (result.error === 'invalid_output') await recordOutcome(deps.rpc, userId, 'dictation', 'blocked');
      return result;
    }
    raw = result.output as RawDictation;
    const merged = mergeOutput(cur, raw);
    problems = [...(merged.ingredients ? [] : (['ingredients'] as const)), ...(merged.steps ? [] : (['steps'] as const))];
    console.log('ai: dictation checked', JSON.stringify({ attempt, problems }));
    if (problems.length === 0) {
      await recordOutcome(deps.rpc, userId, 'dictation', attempt === 1 ? 'passed' : 'rewritten');
      break;
    }
  }
  if (!raw) return { ok: false, error: 'invalid_output' };
  // 重寫後作者填的項目還是被改到：那一份不採用，維持作者原本的（buildResult 處理）
  if (problems.length > 0) await recordOutcome(deps.rpc, userId, 'dictation', 'blocked');
  return { ok: true, data: { status: 'ok', result: buildResult(cur, raw) } };
}
