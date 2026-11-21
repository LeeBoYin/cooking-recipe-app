// 要展開做法的點子：把 ai_expand_get 的資料（首頁或對話的點子、收藏的快照）整理成同一個形狀。純函式。
// 自己的食譜（candidateRef 是 own:）不展開——直接打開食譜，不呼叫 AI。
import { baseDishes } from '../../../../packages/taste/src/index.ts';
import type { ExpandRow } from './types.ts';

export interface ExpandIdea {
  title: string;
  why: string;
  usesIds: string[]; // 手邊食材與使用者在對話中說的食材（字典 ID）
  others: string[]; // 其他材料（名稱）
  techniques: string[];
  equipment: string[];
  substitutions: { need: string; use: string }[];
  // 家常菜骨架：主要食材、手法、廚具
  dish: { id: string; name: string; ingredientIds: string[]; techniques: string[]; equipment: string[] } | null;
}

const dishById = new Map(baseDishes.map((d) => [d.id, d]));

export function ideaFromRow(row: ExpandRow): ExpandIdea | null {
  const idea = row.idea;
  const ref = idea?.candidateRef ?? '';
  if (ref.startsWith('own:')) return null;
  const dishId = ref.startsWith('dish:') ? ref.slice(5) : (row.snapshot?.baseDishId ?? null);
  const d = dishId ? dishById.get(dishId) : undefined;
  const dish = d ? { id: d.id, name: d.name['zh-TW'], ingredientIds: d.ingredientIds, techniques: d.techniques, equipment: d.equipmentTypeIds } : null;

  if (idea) {
    return {
      title: idea.title,
      why: idea.why,
      usesIds: [...new Set([...idea.usesPantryIds, ...(idea.usesMentionedIds ?? [])])],
      others: idea.otherIngredients.map((o) => o.name),
      techniques: [...new Set([...idea.techniques, ...(dish?.techniques ?? [])])],
      equipment: [...new Set([...idea.equipment, ...(dish?.equipment ?? [])])],
      substitutions: idea.substitutions,
      dish,
    };
  }
  // 收藏的點子，快取已經清掉：只剩收藏時定下的菜名、理由、主要食材
  const s = row.snapshot;
  if (!s) return null;
  return {
    title: s.title,
    why: s.why ?? '',
    usesIds: row.ingredient_ids,
    others: [],
    techniques: dish?.techniques ?? [],
    equipment: dish?.equipment ?? [],
    substitutions: [],
    dish,
  };
}
