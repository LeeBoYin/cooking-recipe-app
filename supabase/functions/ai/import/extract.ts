// 從網頁取出食譜（純函式，不碰網路）：
// 1. 網頁有 schema.org Recipe 的結構化資料（JSON-LD 優先、再試 microdata）就由程式直接讀，不呼叫 AI。
// 2. 沒有（或讀出來太少）就把網頁轉成純文字，交給 AI 擷取。
// 只取文字：不執行網頁的程式，script／style／導覽列都先拿掉。數值與單位原樣保留，不換算。
import type { ImportedRecipe } from '../../../../packages/core/src/index.ts';

export const IMPORT_LIMITS = { title: 80, ingredient: 200, step: 500, tips: 1000, ingredients: 60, steps: 10 } as const;
export const PAGE_TEXT_MAX_CHARS = 12_000; // 交給 AI 的網頁文字上限

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,8}));/gi, (m, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name) return ENTITIES[name.toLowerCase()] ?? m;
    const code = dec ? Number(dec) : parseInt(hex ?? '', 16);
    if (!Number.isFinite(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return m;
    return String.fromCodePoint(code);
  });
}

const clean = (s: string): string => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const cut = (s: string, max: number): string => ([...s].length > max ? [...s].slice(0, max).join('') : s);

// ---- JSON-LD ----

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const body = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '').trim();
    try {
      out.push(JSON.parse(body));
    } catch {
      // 壞掉的 JSON 略過
    }
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const typesOf = (o: Record<string, unknown>): string[] => (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).filter((t): t is string => typeof t === 'string');

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findRecipe(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (typesOf(node).some((t) => t === 'Recipe' || t.endsWith('/Recipe'))) return node;
  return findRecipe(node['@graph'], depth + 1);
}

function textOf(v: unknown): string {
  if (typeof v === 'string') return clean(v);
  if (typeof v === 'number') return String(v);
  if (isObj(v)) return textOf(v.text ?? v.name);
  return '';
}

// 做法：字串（可能整段、用換行分步）、HowToStep 清單、或 HowToSection 裡再有一層
function stepsOf(v: unknown, depth = 0): string[] {
  if (depth > 3 || v == null) return [];
  if (typeof v === 'string') {
    const lines = v.split(/\r?\n|<br\s*\/?>|<\/p>|<\/li>/i).map(clean).filter(Boolean);
    return lines;
  }
  if (Array.isArray(v)) return v.flatMap((x) => stepsOf(x, depth + 1));
  if (isObj(v)) {
    if (Array.isArray(v.itemListElement)) return stepsOf(v.itemListElement, depth + 1);
    const t = textOf(v);
    return t ? [t] : [];
  }
  return [];
}

// 份量：recipeYield 可能是 4、"4"、"4 servings"、["4", "4 servings"]；只認得出第一個整數，認不出就 null
function servingsOf(v: unknown): number | null {
  const first = Array.isArray(v) ? v[0] : v;
  const s = typeof first === 'number' ? String(first) : typeof first === 'string' ? first : '';
  const n = /\d+/.exec(s);
  const value = n ? Number(n[0]) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 99 ? value : null;
}

function siteNameOf(recipe: Record<string, unknown> | null, html: string, finalUrl: string): string | null {
  const publisher = recipe?.publisher;
  const fromRecipe = isObj(publisher) ? textOf(publisher.name) : typeof publisher === 'string' ? clean(publisher) : '';
  if (fromRecipe) return cut(fromRecipe, 60);
  const og = /<meta\b[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html) ?? /<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']og:site_name["']/i.exec(html);
  if (og && clean(og[1])) return cut(clean(og[1]), 60);
  try {
    return new URL(finalUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---- microdata（itemprop）----
// 簡化讀法：找 itemtype 含 schema.org/Recipe 的區塊，依序取 itemprop 的文字。夠應付常見的食譜網站；讀不到就交給 AI。
function microdataRecipe(html: string): { title: string; servings: unknown; ingredients: string[]; steps: string[] } | null {
  const start = /itemtype\s*=\s*["']https?:\/\/schema\.org\/Recipe["']/i.exec(html);
  if (!start) return null;
  const region = html.slice(start.index);
  const props = (name: string): string[] => {
    const out: string[] = [];
    const re = new RegExp(`<(\\w+)\\b[^>]*\\bitemprop\\s*=\\s*["']${name}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'gi');
    for (const m of region.matchAll(re)) {
      const t = clean(m[2]);
      if (t) out.push(t);
    }
    return out;
  };
  const ingredients = [...props('recipeIngredient'), ...props('ingredients')];
  return { title: props('name')[0] ?? '', servings: props('recipeYield')[0], ingredients, steps: props('recipeInstructions') };
}

// ---- 整理成編輯頁吃得下的格式 ----

export function normalizeRecipe(
  raw: { title: string; servings: number | null; ingredients: string[]; steps: string[]; tips: string },
  source: { url: string | null; name: string | null },
): ImportedRecipe {
  const ingredients = raw.ingredients.map((s) => cut(s.trim(), IMPORT_LIMITS.ingredient)).filter(Boolean).slice(0, IMPORT_LIMITS.ingredients);
  let steps = raw.steps.map((s) => s.trim()).filter(Boolean);
  // 步驟最多 10 步：多出來的接在第 10 步後面
  if (steps.length > IMPORT_LIMITS.steps) {
    const head = steps.slice(0, IMPORT_LIMITS.steps - 1);
    steps = [...head, steps.slice(IMPORT_LIMITS.steps - 1).join(' ')];
  }
  return {
    title: cut(raw.title.trim(), IMPORT_LIMITS.title),
    servings: raw.servings,
    ingredients,
    steps: steps.map((s) => cut(s, IMPORT_LIMITS.step)),
    tips: cut(raw.tips.trim(), IMPORT_LIMITS.tips),
    source,
  };
}

export interface Extracted {
  // 程式直接讀到的食譜（有標題、至少一項食材與一個步驟）；沒有就是 null，交給 AI
  structured: ImportedRecipe | null;
  // 交給 AI 的網頁文字（已截短）
  text: string;
  siteName: string | null;
}

export function extractFromHtml(html: string, finalUrl: string): Extracted {
  const source = (name: string | null) => ({ url: finalUrl, name });
  const recipe = jsonLdBlocks(html).map((b) => findRecipe(b)).find((r) => r !== null) ?? null;
  const siteName = siteNameOf(recipe, html, finalUrl);

  let structured: ImportedRecipe | null = null;
  if (recipe) {
    const candidate = normalizeRecipe(
      {
        title: textOf(recipe.name),
        servings: servingsOf(recipe.recipeYield),
        ingredients: (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map(textOf).filter(Boolean),
        steps: stepsOf(recipe.recipeInstructions),
        tips: '',
      },
      source(siteName),
    );
    if (candidate.title && candidate.ingredients.length > 0 && candidate.steps.length > 0) structured = candidate;
  }
  if (!structured) {
    const micro = microdataRecipe(html);
    if (micro) {
      const candidate = normalizeRecipe({ title: micro.title, servings: servingsOf(micro.servings), ingredients: micro.ingredients, steps: micro.steps, tips: '' }, source(siteName));
      if (candidate.title && candidate.ingredients.length > 0 && candidate.steps.length > 0) structured = candidate;
    }
  }
  return { structured, text: htmlToText(html), siteName };
}

// 網頁轉純文字：拿掉不會是食譜內容的區塊，標籤換成換行或空白，最後截短
export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|template|aside|title)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|ul|ol|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const lines = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = [title ? clean(title) : '', ...lines].filter(Boolean).join('\n');
  return cut(text, PAGE_TEXT_MAX_CHARS);
}
