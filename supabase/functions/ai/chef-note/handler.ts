// chef_note（M1b-04b）：草稿第一次發佈成功後，大廚回一句話。
// 流程：驗證輸入 → 帳號與開關 → 讀這一篇（資料庫確認是自己的、剛發佈的、還沒有一句話）→ 單獨呼叫一次 Claude →
//   程式檢查（長度、不提次數與頻率、不催促）→ 2 秒內做好才存進 recipe_private.chef_note 並回傳。
// 超過 2 秒、AI 不能用、沒過檢查：不存、不回傳（status: 'none'），發佈本來就已經成功。紀錄只有結果代號，不含內容。
import { type AiErrorCode, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import type { Rpc } from '../usage.ts';
import { buildChefNotePrompt, CHEF_NOTE_MAX_CHARS, CHEF_NOTE_SCHEMA, type ChefNoteRecipe } from './prompt.ts';

export const CHEF_NOTE_DEADLINE_MS = 2000;

export type ChefNoteResult = { ok: true; data: { status: 'ok'; note: string } | { status: 'none' } } | { ok: false; error: AiErrorCode };

export interface ChefNoteDeps {
  ai: Deps;
  rpc: Rpc;
  now?: () => number;
}

// 不提次數、頻率、連續，也不催促或給建議（01 產品原則「偶爾用也完整」）
const FORBIDDEN = /第\s*[0-9０-９一二三四五六七八九十兩]+\s*[次回道篇]|[0-9０-９一二三四五六七八九十兩]+\s*[次回]|幾次|多次|每\s*[天週周日月]|常常|經常|時常|總是|連續|又做|再做|習慣|最近|這陣子|下次|記得|別忘|快去|趕快|要不要|建議/;

export function checkChefNote(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const note = (raw as { note?: unknown }).note;
  if (typeof note !== 'string') return null;
  const text = note.trim();
  const len = [...text].length;
  if (len === 0 || len > CHEF_NOTE_MAX_CHARS) return null;
  if (FORBIDDEN.test(text) || /[!！?？\n]/.test(text)) return null;
  return text;
}

function parseInput(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { recipe_id, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  return typeof recipe_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(recipe_id) ? recipe_id : null;
}

export async function runChefNote(deps: ChefNoteDeps, userId: string, rawInput: unknown): Promise<ChefNoteResult> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const recipeId = parseInput(rawInput);
  if (!recipeId) return { ok: false, error: 'invalid_input' };

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };
  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };

  // 不是自己的、不是剛發佈的（不是第一次發佈）、已經有一句話：不叫 AI
  const { data: recipe, error } = await deps.rpc('chef_note_context', { p_user: userId, p_recipe: recipeId });
  if (error) {
    console.error('ai: chef_note_context failed', error.code);
    return { ok: false, error: 'server_error' };
  }
  if (!recipe) return { ok: true, data: { status: 'none' } };
  const r = recipe as ChefNoteRecipe;

  const def: TaskDefinition<Record<string, never>> = {
    parseInput: () => ({ ok: true, value: {} }),
    buildPrompt: () => buildChefNotePrompt(r),
    outputSchema: CHEF_NOTE_SCHEMA,
  };
  const result = await runAi({ ...deps.ai, tasks: { chef_note: def as never } }, userId, 'chef_note', { recipe_id: recipeId });
  // AI 不能用（預算、速率、出錯…）：不顯示，不是錯誤；帳號與開關的代號前面已經擋掉
  if (!result.ok) return { ok: true, data: { status: 'none' } };
  const note = checkChefNote(result.output);
  console.log('ai: chef_note checked', JSON.stringify({ passed: note !== null }));
  if (!note) return { ok: true, data: { status: 'none' } };
  // 太慢就不顯示、也不存：「超過 2 秒就不顯示」
  if (now() - startedAt > CHEF_NOTE_DEADLINE_MS) return { ok: true, data: { status: 'none' } };

  const saved = await deps.rpc('save_chef_note', { p_user: userId, p_recipe: recipeId, p_text: note });
  if (saved.error || saved.data !== true) {
    if (saved.error) console.error('ai: save_chef_note failed', saved.error.code);
    return { ok: true, data: { status: 'none' } };
  }
  return { ok: true, data: { status: 'ok', note } };
}
