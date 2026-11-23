// 對話輸出的程式再檢查（03〈安全與信任〉）：點子走首頁同一套檢查（過敏原、排除清單、關鍵字、手法廚具、禁用字眼…），
// 大廚的話、反問、說過的食材、偏好訊號、摘要另外檢查。不合格的拿掉，不補。純函式，評估集與單元測試餵假的 AI 回應。
// 紀錄只留原因與數量，不含內容。
import { CHAT_MAX_IDEAS, CHAT_MIN_CHEF_TURNS, CHAT_MAX_OPTIONS, CHAT_MIN_OPTIONS, violatesLimits, type AiIdea, type ChatAsk } from '../../../../packages/core/src/index.ts';
import { checkHomeOutput } from '../home/check.ts';
import { wordingProblems } from '../home/check.ts';
import { dimensionKeys, ideaIngredients } from '../home/env.ts';
import type { DropReason } from '../home/types.ts';
import { norm, type ChatEnv } from './env.ts';
import type { ChatDropReason, ChatMention, ChatSignal, RawChatOutput } from './types.ts';

export const MAX_REPLY = 150;
export const MAX_ASK = 60;
export const MAX_SUMMARY = 120;
export const MAX_IDEAS = CHAT_MAX_IDEAS;
export const MAX_OPTION = 20;
export const MAX_HINT = 20;
export const MAX_NEW_MENTIONS = 8;
export const MAX_SIGNALS = 3;

export type ChatCheck =
  | { ok: false; reason: 'reply' | 'ideas' | 'too_early'; dropped: Partial<Record<ChatDropReason | DropReason, number>> }
  | {
      ok: true;
      reply: string;
      ask: ChatAsk | null;
      hint: string | null;
      ideas: AiIdea[];
      mentioned: ChatMention[];
      signals: ChatSignal[];
      summary: string | null;
      // 點子用到的提到食材太少（使用者提了 3 樣以上、某個點子只用到 1 樣以下）：handler 重寫一次，還是這樣就照給
      lowCoverage: boolean;
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

export interface ChatCheckOpts {
  makeId?: () => string;
  // 這是大廚在這段對話的第幾輪回應（含這一則），由程式算；沒給就不設「至少幾輪」的門檻
  chefTurn?: number;
  // 開新的一段、從舊的摘要接著聊：條件已經問過，不用再問滿 3 輪
  carried?: boolean;
  // 這段對話已經給過點子：之後想換、想調整都照常給，不受「至少 3 輪」限制
  gaveBefore?: boolean;
}

// 這個點子用到幾樣使用者提到的食材：ID 對得上，或字出現在菜名與其他材料裡
export function mentionCoverage(idea: AiIdea, mentions: readonly ChatMention[]): number {
  const used = new Set([...idea.usesPantryIds, ...(idea.usesMentionedIds ?? [])]);
  const haystack = norm([idea.title, ...idea.otherIngredients.map((o) => o.name)].join(' '));
  return mentions.filter((m) => (m.ingredientId && used.has(m.ingredientId)) || (norm(m.text).length > 0 && haystack.includes(norm(m.text)))).length;
}

export function checkChatOutput(raw: RawChatOutput, ce: ChatEnv, opts: ChatCheckOpts = {}): ChatCheck {
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

  // 反問（問題＋2 到 4 個選項）：沒過檢查就當作沒有反問。選項個別檢查，不合格的拿掉，剩不到 2 個就整個不用
  let ask: ChatAsk | null = null;
  const rawAsk = raw.ask;
  if (rawAsk && typeof rawAsk === 'object') {
    const question = typeof rawAsk.question === 'string' ? rawAsk.question.trim() : '';
    const q = textOk(question, ce);
    if (question.length === 0 || [...question].length > MAX_ASK || !q.wording) drop('ask_wording');
    else if (!q.excluded) drop('ask_excluded');
    else {
      const options: string[] = [];
      for (const o of Array.isArray(rawAsk.options) ? rawAsk.options : []) {
        const t = typeof o === 'string' ? o.trim() : '';
        const ot = textOk(t, ce);
        if (!t || [...t].length > MAX_OPTION || !ot.wording || !ot.excluded || options.includes(t)) { drop('ask_options'); continue; }
        if (options.length < CHAT_MAX_OPTIONS) options.push(t);
      }
      if (options.length >= CHAT_MIN_OPTIONS) ask = { question, options, multi: rawAsk.multi === true };
      else drop('ask_options');
    }
  }

  // 接著聊的提示：同反問的檢查，沒過只丟掉提示
  let hint: string | null = null;
  const rawHint = typeof raw.hint === 'string' ? raw.hint.trim() : '';
  if (rawHint) {
    const h = textOk(rawHint, ce);
    if ([...rawHint].length > MAX_HINT || !h.wording || !h.excluded) drop('hint');
    else hint = rawHint;
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
  let lowCoverage = false;
  if (!ask && gave > 0) {
    // 至少 3 輪才給點子；使用者要求時不受限（程式數輪數，不靠模型自己數）
    const wants = raw.user_wants_ideas === true;
    if (opts.chefTurn !== undefined && opts.chefTurn < CHAT_MIN_CHEF_TURNS && !wants && !opts.carried && !opts.gaveBefore) {
      drop('too_early');
      return { ok: false, reason: 'too_early', dropped };
    }
    const checked = checkHomeOutput(
      { suggestions: raw.suggestions, chef_comment: '' },
      env,
      { slotLimits: { familiar: MAX_IDEAS, twist: MAX_IDEAS, adventure: MAX_IDEAS }, maxIdeas: MAX_IDEAS, extraIds: extra, ...(opts.makeId ? { makeId: opts.makeId } : {}) },
    );
    ideas = checked.ideas;
    for (const [k, v] of Object.entries(checked.dropped)) dropped[k as DropReason] = (dropped[k as DropReason] ?? 0) + (v ?? 0);
    // 給了點子、卻一個都不剩：回應和卡片對不上，整則不用
    if (ideas.length === 0) return { ok: false, reason: 'ideas', dropped };
    // 盡量用到提到的食材：提了 3 樣以上、某個點子只用到 1 樣以下
    const all = new Map<string, ChatMention>();
    for (const m of [...ce.allMentions, ...mentioned]) if (!all.has(norm(m.text))) all.set(norm(m.text), m);
    if (all.size >= 3 && ideas.some((i) => mentionCoverage(i, [...all.values()]) <= 1)) { lowCoverage = true; drop('low_coverage'); }
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

  return { ok: true, reply, ask, hint, ideas, mentioned, signals, summary: summaryOk ? s : null, lowCoverage, dropped };
}

// 這次的輸出要不要請 Claude 重寫一次（只重寫一次）：太早給點子、或點子用到的提到食材太少。回傳重寫時給 Claude 的說明；不用重寫就是 undefined
export function retryHint(checked: ChatCheck, chefTurn: number): string | undefined {
  if (!checked.ok) {
    return checked.reason === 'too_early'
      ? `你上一次的回應在第 ${chefTurn} 輪就給了點子，但使用者沒有要求。請重寫：這一輪不要給點子（suggestions 給空陣列），改成接住他說的，附上一個問題和 2 到 4 個選項（ask）。`
      : undefined;
  }
  return checked.lowCoverage
    ? '你上一次給的點子，有的只用到使用者提到的食材裡的一樣。請重寫：每個點子都盡量用到大部分提到的食材；搭不起來的，在 reply 說哪幾樣適合留到下次一起用。'
    : undefined;
}
