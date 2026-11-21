// 對話輸出的程式再檢查（03〈安全與信任〉）：點子走首頁同一套檢查（過敏原、排除清單、關鍵字、手法廚具、禁用字眼…），
// 大廚的話、反問、說過的食材、偏好訊號、摘要另外檢查。不合格的拿掉，不補。純函式，評估集與單元測試餵假的 AI 回應。
// 紀錄只留原因與數量，不含內容。
import { violatesLimits, type AiIdea } from '../../../../packages/core/src/index.ts';
import { checkHomeOutput } from '../home/check.ts';
import { wordingProblems } from '../home/check.ts';
import { dimensionKeys, ideaIngredients } from '../home/env.ts';
import type { DropReason } from '../home/types.ts';
import { norm, type ChatEnv } from './env.ts';
import type { ChatDropReason, ChatMention, ChatSignal, RawChatOutput } from './types.ts';

export const MAX_REPLY = 150;
export const MAX_ASK = 60;
export const MAX_SUMMARY = 120;
export const MAX_IDEAS = 3;
export const MAX_NEW_MENTIONS = 8;
export const MAX_SIGNALS = 3;

export type ChatCheck =
  | { ok: false; reason: 'reply' | 'ideas'; dropped: Partial<Record<ChatDropReason | DropReason, number>> }
  | {
      ok: true;
      reply: string;
      ask: string | null;
      ideas: AiIdea[];
      mentioned: ChatMention[];
      signals: ChatSignal[];
      summary: string | null;
      dropped: Partial<Record<ChatDropReason | DropReason, number>>;
    };

function includesAny(text: string, terms: readonly string[]): boolean {
  const t = norm(text);
  return terms.some((term) => term.length > 0 && t.includes(norm(term)));
}

// 自由文字：不寫帶單位的數字、不催促，也不碰排除清單與不吃的食物
function textOk(text: string, ce: ChatEnv): { wording: boolean; excluded: boolean } {
  return {
    wording: wordingProblems(text).length === 0,
    excluded: !includesAny(text, ce.env.hardTerms) && !includesAny(text, ce.env.dislikeTerms),
  };
}

export function checkChatOutput(raw: RawChatOutput, ce: ChatEnv, opts: { makeId?: () => string } = {}): ChatCheck {
  const { env } = ce;
  const dropped: Partial<Record<ChatDropReason | DropReason, number>> = {};
  const drop = (r: ChatDropReason) => {
    dropped[r] = (dropped[r] ?? 0) + 1;
  };

  // 大廚的話：沒過檢查整則不用（手機顯示大廚想不出來）；一句沒有就不是一則回應
  const reply = typeof raw.reply === 'string' ? raw.reply.trim() : '';
  if (reply.length === 0 || [...reply].length > MAX_REPLY) return { ok: false, reason: 'reply', dropped };
  const r = textOk(reply, ce);
  if (!r.wording) { drop('reply_wording'); return { ok: false, reason: 'reply', dropped }; }
  if (!r.excluded) { drop('reply_excluded'); return { ok: false, reason: 'reply', dropped }; }

  // 反問：沒過檢查就當作沒有反問（只剩 reply，點子照給）
  let ask: string | null = typeof raw.ask === 'string' && raw.ask.trim().length > 0 ? raw.ask.trim() : null;
  if (ask) {
    const a = textOk(ask, ce);
    if ([...ask].length > MAX_ASK || !a.wording) { drop('ask_wording'); ask = null; }
    else if (!a.excluded) { drop('ask_excluded'); ask = null; }
  }

  // 使用者說了什麼食材：字要真的是他說過的話
  const mentioned: ChatMention[] = [];
  const newIds = new Set<string>();
  const seenText = new Set<string>();
  for (const m of Array.isArray(raw.mentioned_ingredients) ? raw.mentioned_ingredients.slice(0, MAX_NEW_MENTIONS) : []) {
    const text = typeof m?.text === 'string' ? m.text.trim() : '';
    const n = norm(text);
    if (!text || [...text].length > 40 || !ce.userText.includes(n) || seenText.has(n)) { drop('mention'); continue; }
    if (includesAny(text, env.hardTerms) || includesAny(text, env.dislikeTerms)) { drop('mention'); continue; }
    let id: string | null = null;
    if (typeof m.ingredient_id === 'string' && m.ingredient_id) {
      // ID 要是字典裡的、不能是排除清單的。字和 ID 對不對得上不硬檢查（字典沒收「筍子」這種說法，但 AI 知道是竹筍）；
      // 對錯了只是點子用錯食材，不影響安全（過敏原與排除清單照樣擋）
      if (!ideaIngredients.has(m.ingredient_id) || violatesLimits([m.ingredient_id], {}, env.limits, ideaIngredients)) { drop('mention'); continue; }
      id = m.ingredient_id;
    }
    seenText.add(n);
    mentioned.push({ text, ingredientId: id });
    if (id && !env.pantryIds.has(id)) newIds.add(id);
  }

  // 點子：有反問就不給點子；用首頁同一套檢查，可以用的食材多了「你說的」
  const extra = new Set([...ce.mentioned.map((x) => x.id), ...newIds]);
  const gave = Array.isArray(raw.suggestions) ? raw.suggestions.length : 0;
  let ideas: AiIdea[] = [];
  if (!ask && gave > 0) {
    const checked = checkHomeOutput(
      { suggestions: raw.suggestions, chef_comment: '' },
      env,
      { slotLimits: { familiar: MAX_IDEAS, twist: MAX_IDEAS, adventure: MAX_IDEAS }, maxIdeas: MAX_IDEAS, extraIds: extra, ...(opts.makeId ? { makeId: opts.makeId } : {}) },
    );
    ideas = checked.ideas;
    for (const [k, v] of Object.entries(checked.dropped)) dropped[k as DropReason] = (dropped[k as DropReason] ?? 0) + (v ?? 0);
    // 給了點子、卻一個都不剩：回應和卡片對不上，整則不用
    if (ideas.length === 0) return { ok: false, reason: 'ideas', dropped };
  }

  const signals: ChatSignal[] = [];
  for (const s of Array.isArray(raw.preference_signals) ? raw.preference_signals : []) {
    if (signals.length >= MAX_SIGNALS) break;
    const ok = typeof s?.dimension_key === 'string' && dimensionKeys.has(s.dimension_key) && typeof s.affinity === 'number' && Number.isFinite(s.affinity) && (s.scope === 'long_term' || s.scope === 'today');
    if (!ok) { drop('signal'); continue; }
    signals.push({ dimensionKey: s.dimension_key, affinity: Math.max(-1, Math.min(1, s.affinity)), scope: s.scope });
  }

  // 摘要：只給下一輪用。太長、有標記、碰到排除清單的就不更新（沿用舊的）
  const s = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const summaryOk = s.length > 0 && [...s].length <= MAX_SUMMARY && !s.includes('{{') && !includesAny(s, env.hardTerms);
  if (s.length > 0 && !summaryOk) drop('summary');

  return { ok: true, reply, ask, ideas, mentioned, signals, summary: summaryOk ? s : null, dropped };
}
