// 把一段文字對到字典的食材 ID（不信任模型給的 ID）。只給對話（chat）「提到的食材」用，不影響安全。
// 過敏原與飲食限制的檢查不能用這支（「包含」與模糊比對會對錯，例：柴魚高湯含「高湯」→ 雞高湯），改用 core 的 matchIngredientExact（名稱或別名完全相同）。
// 名稱完全相同 → 別名完全相同 → 話裡含有名稱或別名（取最長的，例：「鄰居送的筍子」含別名「筍子」）→ 模糊比對（只有一個候選才採用）。
// 對不到回 null。只用標準 TypeScript，Deno 2.1 相容。
import { ingredients as ingredientDict } from '../../../packages/ingredients/src/index.ts';
import { pickCandidates, type DictRow } from './ingredient-candidates.ts';

export const norm = (t: string): string => t.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

const dictRows: DictRow[] = ingredientDict.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases, deprecated: i.deprecated === true }));
const activeRows = dictRows.filter((r) => !r.deprecated);

export function resolveIngredientId(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  for (const r of activeRows) if (Object.values(r.name).some((n) => norm(n) === t)) return r.id;
  for (const r of activeRows) if (Object.values(r.aliases).flat().some((a) => norm(a) === t)) return r.id;
  let best: { id: string; len: number } | null = null;
  for (const r of activeRows) {
    for (const term of [...Object.values(r.name), ...Object.values(r.aliases).flat()]) {
      const n = norm(term);
      const len = [...n].length;
      if (len >= 2 && t.includes(n) && (!best || len > best.len)) best = { id: r.id, len };
    }
  }
  if (best) return best.id;
  const fuzzy = pickCandidates(text, dictRows);
  return fuzzy.length === 1 ? (fuzzy[0]?.id ?? null) : null;
}
