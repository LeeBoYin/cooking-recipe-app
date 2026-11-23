// edit_by_voice（M1b-04a）：用說的改食譜。
// 流程：驗證輸入 → 帳號與開關 → 組提示詞、呼叫 Claude → 驗證格式 → 程式把模型的修改驗證成變更清單（編號、長度、數量上限）→ 回傳。
// 什麼都不存：手機列出「會改這些」，作者確認後套進編輯頁還沒儲存的狀態，按儲存才寫入。紀錄只有數量與原因代號，不含指令與食譜內容。
import {
  DICTATION_LIMITS,
  type RawRefine,
  REFINE_MAX_CHARS,
  type RefineCurrent,
  refineChanges,
  type RefineInput,
  type RefineResponse,
} from '../../../../packages/core/src/index.ts';
import { type AiErrorCode, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import { recordOutcome, type Rpc } from '../usage.ts';
import { buildRefinePrompt, REFINE_SCHEMA } from './prompt.ts';

export type RefineRunResult = { ok: true; data: RefineResponse } | { ok: false; error: AiErrorCode };

export interface RefineDeps {
  ai: Deps;
  rpc: Rpc;
}

export const MAX_ATTEMPTS = 2; // 格式不對、被截斷：重試一次

const len = (s: string) => [...s].length;

function strings(v: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems) return null;
  return v.every((x) => typeof x === 'string' && x.trim() !== '' && len(x) <= maxChars) ? (v as string[]) : null;
}

function parseCurrent(raw: unknown): RefineCurrent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { title, story, tips, ingredients, steps, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  if (typeof title !== 'string' || len(title) > DICTATION_LIMITS.title) return null;
  if (typeof story !== 'string' || len(story) > DICTATION_LIMITS.story) return null;
  if (typeof tips !== 'string' || len(tips) > DICTATION_LIMITS.tips) return null;
  const ing = strings(ingredients, DICTATION_LIMITS.ingredients, DICTATION_LIMITS.ingredient);
  const stp = strings(steps, DICTATION_LIMITS.steps, DICTATION_LIMITS.step);
  if (!ing || !stp) return null;
  return { title, story, tips, ingredients: ing, steps: stp };
}

export function parseRefineInput(raw: unknown): { ok: true; value: RefineInput } | { ok: false } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false };
  const { text, lang, current, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false };
  if (typeof text !== 'string' || typeof lang !== 'string' || lang.length === 0 || lang.length > 20) return { ok: false };
  const trimmed = text.trim();
  if (trimmed === '' || len(trimmed) > REFINE_MAX_CHARS) return { ok: false };
  const cur = parseCurrent(current);
  if (!cur) return { ok: false };
  return { ok: true, value: { text: trimmed, lang, current: cur } };
}

export async function runRefine(deps: RefineDeps, userId: string, rawInput: unknown): Promise<RefineRunResult> {
  const parsed = parseRefineInput(rawInput);
  if (!parsed.ok) return { ok: false, error: 'invalid_input' };
  const input = parsed.value;

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  const def: TaskDefinition<Record<string, never>> = {
    parseInput: () => ({ ok: true, value: {} }),
    buildPrompt: () => buildRefinePrompt(input),
    outputSchema: REFINE_SCHEMA,
    inputSize: () => ({ length: len(input.text), limit: REFINE_MAX_CHARS }),
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await runAi({ ...deps.ai, tasks: { edit_by_voice: def as never } }, userId, 'edit_by_voice', { attempt, n: len(input.text) });
    if (!result.ok) {
      if ((result.error === 'invalid_output' || result.error === 'truncated') && attempt < MAX_ATTEMPTS) continue;
      if (result.error === 'invalid_output') await recordOutcome(deps.rpc, userId, 'edit_by_voice', 'blocked');
      return result;
    }
    const changes = refineChanges(input.current, result.output as RawRefine);
    console.log('ai: edit_by_voice checked', JSON.stringify({ attempt, changes: changes.length }));
    await recordOutcome(deps.rpc, userId, 'edit_by_voice', attempt === 1 ? 'passed' : 'rewritten');
    return { ok: true, data: { status: 'ok', changes } };
  }
  return { ok: false, error: 'invalid_output' };
}
