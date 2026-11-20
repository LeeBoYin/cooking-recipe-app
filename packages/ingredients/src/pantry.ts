// 食材頁用的純邏輯：字典查詢、搜尋、最近買的、常買排序。不碰網路與畫面。
import ingredientsData from '../data/ingredients.json' with { type: 'json' };
import type { Ingredient } from './types.ts';

const ingredients = ingredientsData as Ingredient[];

const byId = new Map(ingredients.map((i) => [i.id, i]));

export function getIngredient(id: string | null | undefined): Ingredient | undefined {
  return id ? byId.get(id) : undefined;
}

// 在名稱與別名裡找（不分大小寫）。名稱完全相同的排最前面，其次是開頭相同，最後是包含
export function searchIngredients(query: string, limit = 8): Ingredient[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { item: Ingredient; score: number }[] = [];
  for (const item of ingredients) {
    if (item.deprecated) continue;
    const names = [item.name['zh-TW'], ...item.aliases['zh-TW']].map((n) => n.toLowerCase());
    let score = -1;
    for (const n of names) {
      if (n === q) score = Math.max(score, 3);
      else if (n.startsWith(q)) score = Math.max(score, 2);
      else if (n.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}

// 「最近買的」：只有生鮮、在字典的天數內。added_on 是 YYYY-MM-DD；today 也是（以廚房時區算好的當地日期）
export function isRecentlyBought(ingredientId: string | null, addedOn: string, today: string): boolean {
  const days = getIngredient(ingredientId)?.recentDays;
  if (!days) return false;
  const diff = (Date.parse(today) - Date.parse(addedOn)) / 86_400_000;
  return diff >= 0 && diff < days;
}

// 常買清單：先照過去加入的次數排（多的在前，同次數照字典順序），再用地區的常見食材補在後面。次數只用來排序
export function rankFrequent(addedIngredientIds: (string | null)[], regionCommonIds: string[], limit = 40): string[] {
  const counts = new Map<string, number>();
  for (const id of addedIngredientIds) if (id && byId.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const order = new Map(regionCommonIds.map((id, i) => [id, i]));
  const mine = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || ((order.get(a) ?? 1e6) - (order.get(b) ?? 1e6)));
  const rest = regionCommonIds.filter((id) => byId.has(id) && !counts.has(id));
  return [...mine, ...rest].slice(0, limit);
}
