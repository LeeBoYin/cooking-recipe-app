// 對話用的環境：在首頁的環境（HomeEnv）上，依這段對話說過的話調整候選、加上「你說的」食材。純函式。
import type { ChatMessage, Idea } from '../../../../packages/core/src/index.ts';
import { IDEA_TOP_POOL, violatesLimits } from '../../../../packages/core/src/index.ts';
import { ingredients as ingredientDict } from '../../../../packages/ingredients/src/index.ts';
import { pickCandidates, type DictRow } from '../../_shared/ingredient-candidates.ts';
import { buildHomeEnv, ideaIngredients, ingredientName, termsOf, type HomeEnv } from '../home/env.ts';
import type { HomeContextRow } from '../home/types.ts';
import type { ChatConversationRow, ChatMention } from './types.ts';

export const norm = (t: string): string => t.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export interface ChatEnv {
  env: HomeEnv; // 候選已依對話調整
  // 使用者說過的（這一則之前記下的），廚房沒記、也沒有被排除的食材
  mentioned: { id: string; name: string }[];
  // 說過但字典對不到的說法（沒有踩到排除清單的才留）
  unknownMentions: string[];
  // 這段對話之前記下的全部「說過的食材」（含廚房有的；排除清單的不留）：「盡量用到提到的食材」的檢查用
  allMentions: ChatMention[];
  // 這段對話使用者說過的全部話（含這一則），正規化後，驗證 AI 回報的「說了什麼食材」用
  userText: string;
}

const dictRows: DictRow[] = ingredientDict.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases, deprecated: i.deprecated === true }));
const activeRows = dictRows.filter((r) => !r.deprecated);

// 把使用者說的字對到字典 ID（不信任模型給的 ID）：名稱完全相同 → 別名完全相同 → 話裡含有名稱或別名（取最長的，
// 例：「鄰居送的筍子」含別名「筍子」）→ 模糊比對（只有一個候選才採用）。對不到回 null
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

// 字典裡名稱或別名（兩個字以上）出現在話裡的食材
export function scanIngredients(text: string): string[] {
  const t = norm(text);
  const out: string[] = [];
  for (const i of ingredientDict) {
    if (termsOf(i.id, 2).some((term) => [...term].length >= 2 && t.includes(norm(term)))) out.push(i.id);
  }
  return out;
}

export function buildChatEnv(ctx: HomeContextRow, now: Date, conv: Pick<ChatConversationRow, 'messages' | 'mentioned_ingredients'> | null, message: string): ChatEnv {
  const base = buildHomeEnv(ctx, now);
  const userTexts = [...(conv?.messages ?? []).filter((m: ChatMessage) => m.role === 'user').map((m) => m.text), message];

  const seen = new Set<string>();
  const mentioned: ChatEnv['mentioned'] = [];
  const unknownMentions: string[] = [];
  for (const m of (conv?.mentioned_ingredients ?? []) as ChatMention[]) {
    if (m.ingredientId) {
      if (seen.has(m.ingredientId) || base.pantryIds.has(m.ingredientId)) continue;
      // 排除清單的食材不送給 AI
      if (violatesLimits([m.ingredientId], {}, base.limits, ideaIngredients)) continue;
      seen.add(m.ingredientId);
      mentioned.push({ id: m.ingredientId, name: ingredientName(m.ingredientId) });
    } else if (m.text && ![...base.hardTerms, ...base.dislikeTerms].some((term) => term.length > 0 && norm(m.text).includes(norm(term)))) {
      unknownMentions.push(m.text);
    }
  }

  // 候選依對話調整：這段對話說過的食材（含這一則裡提到的）有用到的往前排；同分維持原本的順序
  const wanted = new Set([...mentioned.map((x) => x.id), ...scanIngredients(userTexts.join('\n'))]);
  const boost = (i: Idea) => i.mainIngredientIds.filter((id) => wanted.has(id)).length;
  const ranked = base.pool.ideas
    .map((idea, order) => ({ idea, order, boost: boost(idea) }))
    .sort((a, b) => b.boost - a.boost || a.order - b.order)
    .slice(0, IDEA_TOP_POOL);
  const env: HomeEnv = { ...base, candidates: ranked.map(({ idea }, i) => ({ ref: `c${i + 1}`, idea })) };

  const allMentions = ((conv?.mentioned_ingredients ?? []) as ChatMention[]).filter(
    (m) => m.text && !(m.ingredientId && violatesLimits([m.ingredientId], {}, base.limits, ideaIngredients)) && ![...base.hardTerms, ...base.dislikeTerms].some((term) => term.length > 0 && norm(m.text).includes(norm(term))),
  );
  return { env, mentioned, unknownMentions, allMentions, userText: norm(userTexts.join('\n')) };
}
