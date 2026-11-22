// expand_steps（M1a-09）：點子抽屜裡的做法。
// 流程：讀點子本身（後端自己讀，不信任手機送來的內容）→ 已經展開過就用存下來的（重新檢查過敏原與限制）→
// 組提示詞、呼叫 Claude → 驗證格式 → 程式再檢查 → 沒過就整份重寫一次 → 存進快取的 drafts（已收藏就同時存進收藏）→ 回傳。
// 失敗（AI 不能用、被擋下、逾時、兩次都沒過檢查）什麼都不存，手機顯示「大廚需要再想想」。
// 紀錄只有數量與原因代號，不含內容。
import type { ExpandInput, ExpandResponse, RecipeDraft } from '../../../../packages/core/src/index.ts';
import { type AiErrorCode, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import type { Rpc } from '../usage.ts';
import { buildHomeEnv } from '../home/env.ts';
import type { HomeContextRow } from '../home/types.ts';
import { withMergedTaste } from '../taste.ts';
import { checkDraft, storedDraftOk } from './check.ts';
import { ideaFromRow } from './idea.ts';
import { buildExpandPrompt, buildExpandSchema } from './prompt.ts';
import type { DraftProblem, ExpandRow, RawDraft } from './types.ts';

export type ExpandResult = { ok: true; data: ExpandResponse } | { ok: false; error: AiErrorCode };

export interface ExpandDeps {
  ai: Deps;
  rpc: Rpc;
  now?: () => Date;
}

export const MAX_ATTEMPTS = 2; // 第一次沒過檢查，自動重寫一次

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseExpandInput(raw: unknown): { ok: true; value: ExpandInput } | { ok: false } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false };
  const { suggestionId, ideaId, bookmarkId, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false };
  if (typeof bookmarkId === 'string') {
    if (!UUID.test(bookmarkId) || suggestionId !== undefined || ideaId !== undefined) return { ok: false };
    return { ok: true, value: { bookmarkId } };
  }
  if (typeof suggestionId !== 'string' || typeof ideaId !== 'string' || !UUID.test(suggestionId) || !UUID.test(ideaId)) return { ok: false };
  return { ok: true, value: { suggestionId, ideaId } };
}

export async function runExpandSteps(deps: ExpandDeps, userId: string, rawInput: unknown): Promise<ExpandResult> {
  const parsed = parseExpandInput(rawInput);
  if (!parsed.ok) return { ok: false, error: 'invalid_input' };
  const input = parsed.value;
  const now = (deps.now ?? (() => new Date()))();

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  const got = await deps.rpc('ai_expand_get', {
    p_user: userId,
    p_suggestion: 'suggestionId' in input ? input.suggestionId : null,
    p_idea: 'ideaId' in input ? input.ideaId : null,
    p_bookmark: 'bookmarkId' in input ? input.bookmarkId : null,
  });
  if (got.error) {
    console.error('ai: ai_expand_get failed', got.error.code);
    throw new Error('expand_get');
  }
  if (!got.data) return { ok: false, error: 'invalid_input' }; // 不是自己的、不存在的
  const row = got.data as ExpandRow;
  const idea = ideaFromRow(row);
  if (!idea) return { ok: false, error: 'invalid_input' }; // 自己的食譜：直接打開食譜，不呼叫 AI

  const ctx = await deps.rpc('ai_home_context', { p_user: userId });
  if (ctx.error) {
    console.error('ai: ai_home_context failed', ctx.error.code);
    throw new Error('home_context');
  }
  if (!ctx.data) return { ok: false, error: 'invalid_input' };
  const env = buildHomeEnv(await withMergedTaste(ctx.data as HomeContextRow, deps.rpc, userId, now), now);

  const save = async (draft: RecipeDraft): Promise<void> => {
    const saved = await deps.rpc('ai_expand_save', {
      p_user: userId, p_cache: row.cache_id, p_idea_id: row.idea_id, p_bookmark: row.bookmark_id, p_draft: draft,
    });
    if (saved.error) console.error('ai: ai_expand_save failed', saved.error.code); // 存不到不影響這一次的回應
  };

  // 已經展開過：用存下來的（過敏原或限制改了、不能給他看的就重寫）。廚房之後變了不重算
  if (row.draft && storedDraftOk(row.draft, env)) {
    if (row.bookmark_id && !row.snapshot?.recipeDraft) await save(row.draft); // 點子後來才收藏：補存進收藏
    return { ok: true, data: { status: 'ok', source: 'cache', draft: row.draft } };
  }

  // 點子本身不能給他看（收藏之後才改了過敏原）：不叫 AI
  const servings = Math.min(20, Math.max(1, row.household_size));
  let problems: DraftProblem[] | undefined;
  const itemIds = idea.usesIds;
  if (itemIds.length > 0 && !storedDraftOk({ schemaVersion: 1, servings, model: '', steps: [], ingredients: itemIds.map((id) => ({ id, name: '', ingredientId: id, optional: false })) }, env)) {
    return { ok: false, error: 'invalid_output' };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = buildExpandPrompt(env, idea, servings, problems);
    const def: TaskDefinition<Record<string, never>> = {
      parseInput: () => ({ ok: true, value: {} }),
      buildPrompt: () => prompt,
      outputSchema: buildExpandSchema(),
    };
    const result = await runAi({ ...deps.ai, tasks: { expand_steps: def as never } }, userId, 'expand_steps', { attempt, id: row.idea_id ?? row.bookmark_id });
    if (!result.ok) {
      // 格式不對、被截斷：和沒過檢查一樣重寫一次；其他（AI 不能用、被擋下、逾時…）直接失敗
      if ((result.error === 'invalid_output' || result.error === 'truncated') && attempt < MAX_ATTEMPTS) continue;
      return result;
    }
    const checked = checkDraft(result.output as RawDraft, env, { servings, model: result.model });
    console.log('ai: expand_steps checked', JSON.stringify({ attempt, ok: checked.ok, problems: checked.ok ? {} : checked.problems }));
    if (checked.ok) {
      await save(checked.draft);
      return { ok: true, data: { status: 'ok', source: 'ai', draft: checked.draft } };
    }
    problems = Object.keys(checked.problems) as DraftProblem[];
  }
  return { ok: false, error: 'invalid_output' };
}
