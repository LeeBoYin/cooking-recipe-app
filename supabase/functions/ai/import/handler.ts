// import_url（M1b-05）：從網址或貼上的文字匯入一篇食譜，回傳給編輯頁預填（手機建立草稿，使用者看過再發佈）。
// 流程：驗證輸入 → （網址）後端抓網頁 → 有 schema.org Recipe 就由程式讀、不呼叫 AI → 否則（或貼上文字）走 AI 擷取
// → 程式整理長度與數量 → 回傳。失敗什麼都不存。紀錄只有原因代號，不含網址與內容。
import { IMPORT_MAX_TEXT_CHARS, type ImportInput, type ImportResponse } from '../../../../packages/core/src/index.ts';
import { type AiErrorCode, type Deps, runAi, type TaskDefinition } from '../pipeline.ts';
import { extractFromHtml, normalizeRecipe } from './extract.ts';
import { fetchPage, type FetchDeps, URL_MAX_CHARS } from './net.ts';
import { buildImportPrompt, IMPORT_SCHEMA, type RawImport } from './prompt.ts';

export type ImportResult = { ok: true; data: ImportResponse } | { ok: false; error: AiErrorCode };

export interface ImportDeps {
  ai: Deps;
  net: FetchDeps;
}

// 網頁文字太短，多半是要執行 JavaScript 才會出現內容、或是要登入：不叫 AI
const MIN_PAGE_TEXT_CHARS = 80;

export function parseImportInput(raw: unknown): { ok: true; value: ImportInput } | { ok: false } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false };
  const { url, text, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false };
  if (typeof url === 'string' && text === undefined) {
    const v = url.trim();
    return v.length > 0 && v.length <= URL_MAX_CHARS ? { ok: true, value: { url: v } } : { ok: false };
  }
  if (typeof text === 'string' && url === undefined) {
    const v = text.trim();
    return v.length > 0 && [...v].length <= IMPORT_MAX_TEXT_CHARS ? { ok: true, value: { text: v } } : { ok: false };
  }
  return { ok: false };
}

export async function runImportUrl(deps: ImportDeps, userId: string, rawInput: unknown): Promise<ImportResult> {
  const parsed = parseImportInput(rawInput);
  if (!parsed.ok) return { ok: false, error: 'invalid_input' };
  const input = parsed.value;

  const account = await deps.ai.getContext(userId);
  if (!account || account.status !== 'active') return { ok: false, error: 'account_inactive' };
  if (account.ai_paused) return { ok: false, error: 'ai_paused' };

  let pageText: string;
  let source: { url: string | null; name: string | null } = { url: null, name: null };
  if ('url' in input) {
    const page = await fetchPage(input.url, deps.net);
    if (!page.ok) {
      console.log('ai: import fetch', page.error);
      return { ok: false, error: page.error === 'url_invalid' ? 'import_url_invalid' : 'import_fetch_failed' };
    }
    const extracted = extractFromHtml(page.html, page.finalUrl);
    // 網頁有結構化的食譜資料：程式直接讀，不呼叫 AI（AI 關閉或預算用完時也能用）
    if (extracted.structured) return { ok: true, data: { status: 'ok', via: 'structured', recipe: extracted.structured } };
    if ([...extracted.text].length < MIN_PAGE_TEXT_CHARS) return { ok: false, error: 'import_no_recipe' };
    pageText = extracted.text;
    source = { url: page.finalUrl, name: extracted.siteName };
  } else {
    pageText = input.text;
  }

  if (!account.ai_enabled) return { ok: false, error: 'ai_disabled' };
  const def: TaskDefinition<Record<string, never>> = {
    parseInput: () => ({ ok: true, value: {} }),
    buildPrompt: () => buildImportPrompt(pageText),
    outputSchema: IMPORT_SCHEMA,
    inputSize: () => ({ length: [...pageText].length, limit: Math.max(IMPORT_MAX_TEXT_CHARS, 12_000) }),
  };
  const result = await runAi({ ...deps.ai, tasks: { import_url: def as never } }, userId, 'import_url', { n: pageText.length });
  if (!result.ok) return result;

  const raw = result.output as RawImport;
  const recipe = normalizeRecipe(
    { title: raw.title, servings: raw.servings >= 1 && raw.servings <= 99 ? raw.servings : null, ingredients: raw.ingredients, steps: raw.steps, tips: raw.tips },
    source,
  );
  // 沒找到食譜，或抽出來什麼都沒有（沒標題、或食材與做法都空）
  if (!raw.found || !recipe.title || (recipe.ingredients.length === 0 && recipe.steps.length === 0)) return { ok: false, error: 'import_no_recipe' };
  console.log('ai: import extracted', JSON.stringify({ ingredients: recipe.ingredients.length, steps: recipe.steps.length }));
  return { ok: true, data: { status: 'ok', via: 'ai', recipe } };
}
