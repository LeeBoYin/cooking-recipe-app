// 存檔時把一列食材原文（「蒜 2–3 瓣」）拆成「標準食材 ID＋數量＋單位」（03〈食材正規化〉、16 `save_recipe`）。
// 中文原文不適合在資料庫裡解析，所以由手機用這裡的純函式算好再送，資料庫只檢查。
// 食材對應只做程式比對（完全相同 → 別名 → 模糊比對）；對不到的留空，M1a 起再交給背景的 AI 正規化。
// 解析不出來的欄位就留空，原文照存。
import { matchCountUnit, parseIngredient, type QuantityToken } from './ingredient-text.ts';
import type { UnitCode } from './units.ts';

// 字典裡的一筆食材，只取比對要用的欄位（結構相容 `@zhusha/ingredients` 的 Ingredient，core 不必依賴它）
export type DictIngredient = {
  id: string;
  name: Readonly<Record<string, string>>;
  aliases: Readonly<Record<string, readonly string[]>>;
  deprecated?: boolean | undefined;
  replacedBy?: string | undefined;
};

export type IngredientIndex = {
  byName: ReadonlyMap<string, string>; // 標準名稱 → ID
  byAlias: ReadonlyMap<string, string>; // 別名 → ID
  terms: ReadonlyArray<{ term: string; id: string }>; // 模糊比對用，長的在前
};

export type ParsedIngredient = {
  ingredientId?: string;
  amount?: number;
  amountMax?: number;
  unit?: UnitCode;
};

function norm(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// 已淘汰的換成取代它的 ID（最多追三層）；淘汰了又沒有取代的當作沒有
function resolveId(byId: ReadonlyMap<string, DictIngredient>, id: string): string | null {
  let cur = byId.get(id);
  for (let i = 0; cur && i < 3; i++) {
    if (!cur.deprecated) return cur.id;
    cur = cur.replacedBy ? byId.get(cur.replacedBy) : undefined;
  }
  return null;
}

export function buildIngredientIndex(dict: readonly DictIngredient[]): IngredientIndex {
  const byId = new Map(dict.map((d) => [d.id, d]));
  const byName = new Map<string, string>();
  const byAlias = new Map<string, string>();
  for (const d of dict) {
    const id = resolveId(byId, d.id);
    if (!id) continue;
    for (const n of Object.values(d.name)) if (norm(n) && !byName.has(norm(n))) byName.set(norm(n), id);
    for (const list of Object.values(d.aliases)) {
      for (const a of list) if (norm(a) && !byAlias.has(norm(a))) byAlias.set(norm(a), id);
    }
  }
  const terms = [...byName, ...byAlias].map(([term, id]) => ({ term, id })).sort((a, b) => b.term.length - a.term.length);
  return { byName, byAlias, terms };
}

// 模糊比對的門檻：食材名字（兩個字以上）要包含在這一列的名字裡，並佔六成以上。
// 單字（蛋、薑、蒜）只認完全相同，所以「薑黃粉」不會變成「薑」；「阿嬤的辣醬」只佔四成，也不會變成「辣醬」
const FUZZY_MIN_CHARS = 2;
const FUZZY_MIN_COVERAGE = 0.6;

export function matchIngredient(name: string, index: IngredientIndex): string | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const exact = index.byName.get(n) ?? index.byAlias.get(n);
  if (exact) return exact;
  const length = [...n].length;
  for (const { term, id } of index.terms) {
    const termLength = [...term].length;
    if (termLength < FUZZY_MIN_CHARS || termLength / length < FUZZY_MIN_COVERAGE) continue;
    if (n.includes(term)) return id;
  }
  return undefined;
}

// 安全用途（過敏原、飲食限制檢查）的比對：只認名稱或別名「完全相同」，不用包含、不用模糊。
// 包含的規則會錯：「柴魚高湯」含「高湯」會被當成雞高湯，對魚過敏的人就被放行。對不到就回 undefined，呼叫端照舊擋下
export function matchIngredientExact(name: string, index: IngredientIndex): string | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return index.byName.get(n) ?? index.byAlias.get(n);
}

// 一定不含過敏原、葷素都可的基本項，字典不收：對不到字典也不算「不明食材」
const PLAIN_SAFE_NAMES: ReadonlySet<string> = new Set(['水', '清水', '開水', '冷水', '熱水', '溫水', '冰水', '滾水', '冰塊', '礦泉水'].map(norm));
export function isPlainSafeIngredient(name: string): boolean {
  return PLAIN_SAFE_NAMES.has(norm(name));
}

const TO_TASTE = /適量|適當|隨意|隨喜好/;
const PINCH = /少許|少量|一點點|些許/;

// 一列食材文字：拿掉數量（與緊接的計數單位）、括號與「適量」之後剩下的，就是食材名字
export function parseIngredientLine(text: string, index: IngredientIndex): ParsedIngredient {
  return parseLine(text, index).parsed;
}

// 同上，另外回傳拆出來的食材名字（食材正規化用：存在食譜每列的 name，對應與回填靠它）
export function parseIngredientLineNamed(text: string, index: IngredientIndex): ParsedIngredient & { name: string } {
  const { parsed, name } = parseLine(text, index);
  return { ...parsed, name };
}

function parseLine(text: string, index: IngredientIndex): { parsed: ParsedIngredient; name: string } {
  const out: ParsedIngredient = {};
  const segments = parseIngredient(text);
  const nameParts: string[] = [];
  let primary: QuantityToken | undefined;
  let skipCount = false;
  for (const seg of segments) {
    if (typeof seg === 'string') {
      let rest = seg;
      if (skipCount) {
        skipCount = false;
        const count = matchCountUnit(rest);
        if (count && out.unit === undefined) {
          out.unit = count.code;
          rest = rest.slice(count.length);
        }
      }
      nameParts.push(rest);
      continue;
    }
    if (!primary) {
      primary = seg;
      if (Number.isFinite(seg.amount) && seg.amount > 0) {
        out.amount = seg.amount;
        if (seg.amountMax !== undefined && seg.amountMax >= seg.amount) out.amountMax = seg.amountMax;
        if (seg.unit) out.unit = seg.unit;
        else skipCount = true; // 沒有可換算的單位：看後面有沒有「瓣」「顆」這類計數單位
      }
    }
  }
  const whole = nameParts.join('');
  if (out.amount === undefined) {
    if (TO_TASTE.test(text)) out.unit = 'to_taste';
    else if (PINCH.test(text)) out.unit = 'pinch';
  }
  const name = whole
    .replace(TO_TASTE, '')
    .replace(PINCH, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[,，、;；:：]+/g, ' ')
    .trim();
  const id = matchIngredient(name, index);
  if (id) out.ingredientId = id;
  return { parsed: out, name };
}
