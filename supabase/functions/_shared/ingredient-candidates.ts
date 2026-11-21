// 食材正規化：從字典挑出「可能是這個詞」的候選，只把候選送給 AI（不送整本字典，03〈食材正規化〉）。
// 純函式：標準寫法與資料庫的 private.normalize_term 一致（全形轉半形、小寫、去空白）。
// 只用標準 TypeScript，Deno 2.1 相容。

export interface DictRow {
  id: string;
  name: Record<string, string>;
  aliases: Record<string, string[]>;
  deprecated: boolean;
}

export interface Candidate {
  id: string;
  name: string; // 給 AI 看的名字（zh-TW 優先）
}

export const MAX_CANDIDATES = 8;
const MIN_SCORE = 0.25;

export function normalizeTerm(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
}

function bigrams(s: string): Set<string> {
  const chars = [...s];
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  return out;
}

// 0～1：一個名字像不像這個詞。包含關係看長度比例；其餘用字元二連詞的重疊（Dice）加上共用字元的比例
function similarity(term: string, name: string): number {
  if (!term || !name) return 0;
  if (term === name) return 1;
  const tl = [...term].length;
  const nl = [...name].length;
  if (nl >= 2 && term.includes(name)) return 0.55 + 0.4 * (nl / tl);
  if (tl >= 2 && name.includes(term)) return 0.55 + 0.4 * (tl / nl);
  const a = bigrams(term);
  const b = bigrams(name);
  let dice = 0;
  if (a.size && b.size) {
    let common = 0;
    for (const g of a) if (b.has(g)) common++;
    dice = (2 * common) / (a.size + b.size);
  }
  const ta = new Set(term);
  const tb = new Set(name);
  let shared = 0;
  for (const c of ta) if (tb.has(c)) shared++;
  const chars = (0.5 * shared) / Math.max(ta.size, tb.size);
  return Math.max(dice, chars);
}

function displayName(row: DictRow): string {
  return row.name['zh-TW'] ?? Object.values(row.name)[0] ?? row.id;
}

// 已淘汰的食材不當候選。回傳最像的前幾個，分數太低的不列（沒有候選 = 不用問 AI）
export function pickCandidates(term: string, dict: readonly DictRow[], limit = MAX_CANDIDATES): Candidate[] {
  const t = normalizeTerm(term);
  const scored: { row: DictRow; score: number }[] = [];
  for (const row of dict) {
    if (row.deprecated) continue;
    let best = 0;
    for (const n of Object.values(row.name)) best = Math.max(best, similarity(t, normalizeTerm(n)));
    for (const list of Object.values(row.aliases)) for (const a of list) best = Math.max(best, similarity(t, normalizeTerm(a)));
    if (best >= MIN_SCORE) scored.push({ row, score: best });
  }
  scored.sort((x, y) => y.score - x.score || (x.row.id < y.row.id ? -1 : 1));
  return scored.slice(0, limit).map((s) => ({ id: s.row.id, name: displayName(s.row) }));
}
