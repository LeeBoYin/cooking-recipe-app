// 首頁點子卡片與抽屜要顯示的內容。兩種來源（規則評分、AI）先轉成同一個 IdeaView，畫面只認它。
// 卡片不顯示槽位標籤（熟悉的、變化版、新挑戰）：由 why 自然說明（03）。
import { formatTemperature, replaceTempMarks, type AiIdea, type Idea, type TasteProfile, type TemperaturePref } from '@zhusha/core';
import type { IntlShape } from 'react-intl';
import type { ChefLineFn } from '../../chef/useChef.ts';
import { getIngredient } from '@zhusha/ingredients';
import { reasonText } from './reason.ts';

export interface IdeaView {
  key: string;
  title: string;
  why: string;
  kitchenHas: boolean; // 卡片標「食材廚房有」
  difficulty?: number | undefined; // 1–10，不是都有的時候卡片上放這個
  ingredients: { name: string; have: boolean; said?: boolean }[]; // said：使用者在對話中說的
  others: string[]; // 其他材料：只列名字，不寫「缺」
  substitutions: { need: string; use: string }[];
  source: 'own' | 'dish' | 'ai';
  recipeId?: string; // 自己的食譜：打開食譜
  baseDishId?: string; // 家常菜：可以收藏
  suggestionId?: string; // AI 想的點子在快取裡的 id：沒有 baseDishId 的點子用它收藏
}

const nameOf = (id: string) => getIngredient(id)?.name['zh-TW'] ?? id;

export function viewOfRuleIdea(idea: Idea, profile: TasteProfile, intl: IntlShape, chefLine: ChefLineFn): IdeaView {
  const have = new Set(idea.haveIngredientIds);
  return {
    key: idea.key,
    title: idea.title,
    why: reasonText(idea.reason, profile, intl, chefLine, idea.key),
    kitchenHas: idea.allInKitchen,
    difficulty: idea.difficulty,
    ingredients: idea.mainIngredientIds.map((id) => ({ name: nameOf(id), have: have.has(id) })),
    others: [],
    substitutions: [],
    source: idea.source,
    ...(idea.source === 'own' ? { recipeId: idea.id } : { baseDishId: idea.id }),
  };
}

// 理由裡的 {{temp:180:C}} 依使用者的偏好轉成攝氏或華氏
export function renderMarks(text: string, pref: TemperaturePref): string {
  return replaceTempMarks(text, (value, unit) => formatTemperature({ value, unit }, pref));
}

export function viewOfAiIdea(idea: AiIdea, pref: TemperaturePref, suggestionId?: string | null): IdeaView {
  const ref = idea.candidateRef ?? '';
  const familiar = idea.slot === 'familiar';
  return {
    key: idea.id,
    title: idea.title,
    why: renderMarks(idea.why, pref),
    kitchenHas: idea.usesPantryIds.length + (idea.usesMentionedIds?.length ?? 0) > 0 && idea.otherIngredients.length === 0,
    difficulty: idea.difficulty.overall,
    ingredients: [
      ...idea.usesPantryIds.map((id) => ({ name: nameOf(id), have: true })),
      ...(idea.usesMentionedIds ?? []).map((id) => ({ name: nameOf(id), have: false, said: true })),
    ],
    others: idea.otherIngredients.map((o) => o.name),
    substitutions: idea.substitutions.map((s) => ({ need: renderMarks(s.need, pref), use: renderMarks(s.use, pref) })),
    source: familiar && ref.startsWith('own:') ? 'own' : familiar && ref.startsWith('dish:') ? 'dish' : 'ai',
    ...(familiar && ref.startsWith('own:') ? { recipeId: ref.slice(4) } : {}),
    ...(familiar && ref.startsWith('dish:') ? { baseDishId: ref.slice(5) } : {}),
    ...(suggestionId ? { suggestionId } : {}),
  };
}
