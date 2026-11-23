// 首頁點子卡片與抽屜要顯示的內容。AI 想的點子先轉成 IdeaView，畫面只認它。
// 卡片不顯示槽位標籤（熟悉的、變化版、新挑戰）：由 why 自然說明（03）。
import { renderTempMarks, type AiIdea, type IdeaSlot, type TemperaturePref } from '@zhusha/core';
import { getIngredient } from '@zhusha/ingredients';
import { techniques as techniqueDict } from '@zhusha/equipment';
import { baseDishes } from '@zhusha/taste';

export interface IdeaView {
  key: string;
  title: string;
  why: string;
  kitchenHas: boolean; // 卡片標「食材廚房有」
  difficulty?: number | undefined; // 1–10，不是都有的時候卡片上放這個
  ingredients: { id?: string; name: string; have: boolean; said?: boolean }[]; // said：使用者在對話中說的
  others: string[]; // 其他材料：只列名字，不寫「缺」
  substitutions: { need: string; use: string }[];
  techniques: string[]; // 手法的名稱：做法還沒寫好（或寫不出來）時，家常菜的骨架就是食材加手法
  source: 'own' | 'dish' | 'ai';
  recipeId?: string; // 自己的食譜：打開食譜
  baseDishId?: string; // 家常菜：可以收藏
  slot?: IdeaSlot; // 產品事件用
  suggestionId?: string; // AI 想的點子在快取裡的 id：沒有 baseDishId 的點子用它收藏
}

const nameOf = (id: string) => getIngredient(id)?.name['zh-TW'] ?? id;
const techniqueById = new Map(techniqueDict.map((t) => [t.id, t.name['zh-TW']]));
const dishById = new Map(baseDishes.map((d) => [d.id, d]));
export const techniqueNames = (ids: readonly string[]): string[] => [...new Set(ids)].map((id) => techniqueById.get(id) ?? id);
export const dishTechniques = (dishId: string | undefined): string[] => techniqueNames(dishId ? (dishById.get(dishId)?.techniques ?? []) : []);

// 理由裡的 {{temp:180:C}} 依使用者的偏好轉成攝氏或華氏
export function renderMarks(text: string, pref: TemperaturePref): string {
  return renderTempMarks(text, pref);
}

export function viewOfAiIdea(idea: AiIdea, pref: TemperaturePref, suggestionId?: string | null): IdeaView {
  const ref = idea.candidateRef ?? '';
  const familiar = idea.slot === 'familiar';
  return {
    key: idea.id,
    slot: idea.slot,
    title: idea.title,
    why: renderMarks(idea.why, pref),
    kitchenHas: idea.usesPantryIds.length + (idea.usesMentionedIds?.length ?? 0) > 0 && idea.otherIngredients.length === 0,
    difficulty: idea.difficulty.overall,
    ingredients: [
      ...idea.usesPantryIds.map((id) => ({ id, name: nameOf(id), have: true })),
      ...(idea.usesMentionedIds ?? []).map((id) => ({ id, name: nameOf(id), have: false, said: true })),
      // 家常菜的骨架：主要食材裡手邊沒有的也列出來（骨架就是食材加手法）
      ...(familiar && ref.startsWith('dish:') ? (dishById.get(ref.slice(5))?.ingredientIds ?? []).filter((id) => !idea.usesPantryIds.includes(id)).map((id) => ({ id, name: nameOf(id), have: false })) : []),
    ],
    others: idea.otherIngredients.map((o) => o.name),
    substitutions: idea.substitutions.map((s) => ({ need: renderMarks(s.need, pref), use: renderMarks(s.use, pref) })),
    techniques: techniqueNames([...idea.techniques, ...(familiar && ref.startsWith('dish:') ? (dishById.get(ref.slice(5))?.techniques ?? []) : [])]),
    source: familiar && ref.startsWith('own:') ? 'own' : familiar && ref.startsWith('dish:') ? 'dish' : 'ai',
    ...(familiar && ref.startsWith('own:') ? { recipeId: ref.slice(4) } : {}),
    ...(familiar && ref.startsWith('dish:') ? { baseDishId: ref.slice(5) } : {}),
    ...(suggestionId ? { suggestionId } : {}),
  };
}

// 做法的食材清單每一列要加的標籤：用標準食材 ID 對 view 的食材（「你說的」「廚房有」）；沒有 ID 的列不加
export function ingredientBadges(view: Pick<IdeaView, 'ingredients'>, ingredientId: string | null | undefined): { said: boolean; have: boolean } {
  if (!ingredientId) return { said: false, have: false };
  const hit = view.ingredients.find((i) => i.id === ingredientId);
  return { said: !!hit?.said, have: !!hit?.have };
}

// 卡片上的主要食材：點子用到的廚房食材與使用者提到的食材（不重複）
export function mainIngredientNames(view: Pick<IdeaView, 'ingredients'>): string[] {
  return [...new Set(view.ingredients.filter((i) => i.have || i.said).map((i) => i.name))];
}

// 收藏列表的標籤列另有「煮過沒」，固定最多 3 個加「+N」
export const MAX_INGREDIENT_TAGS = 3;
export function mainIngredientTags(view: Pick<IdeaView, 'ingredients'>): { names: string[]; extra: number } {
  const names = mainIngredientNames(view);
  return { names: names.slice(0, MAX_INGREDIENT_TAGS), extra: Math.max(0, names.length - MAX_INGREDIENT_TAGS) };
}

// 一行放得下幾個標籤：widths 是每個標籤的寬度，moreWidth(n) 是「+n」標籤的寬度；
// 放不下的算進「+N」，「+N」本身的寬度也要算進去；至少放 1 個（寬度不明或沒有標籤時回 0 或全部）。
export function fitTagCount(widths: readonly number[], available: number, gap: number, moreWidth: (extra: number) => number): number {
  const total = widths.length;
  if (total === 0) return 0;
  if (!(available > 0)) return total; // 還量不到寬度：先全放，量到再算
  const sums: number[] = [];
  let run = 0;
  for (const [i, w] of widths.entries()) {
    run += w + (i > 0 ? gap : 0);
    sums.push(run);
  }
  if (sums[total - 1]! <= available) return total;
  for (let n = total - 1; n >= 1; n--) {
    if (sums[n - 1]! + gap + moreWidth(total - n) <= available) return n;
  }
  return 1;
}

// 對話裡的點子卡片「你提到的食材」：這道有沒有用到那一樣。ID 對得上，或字出現在菜名與其他材料裡
export function mentionUsed(view: Pick<IdeaView, 'ingredients' | 'others' | 'title'>, m: { text: string; ingredientId: string | null }): boolean {
  if (m.ingredientId && view.ingredients.some((i) => i.id === m.ingredientId && (i.have || i.said))) return true;
  const t = m.text.trim();
  return t.length > 0 && [view.title, ...view.others].some((x) => x.includes(t));
}
