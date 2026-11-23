// AI 輸出的程式再檢查（03〈安全與信任〉）：不合格的點子直接拿掉，不補；過敏原與安全規則不只靠 AI。
// 純函式：不碰網路與資料庫，評估集與單元測試用假的 AI 回應餵進來。紀錄只留原因與數量，不含內容。
import { difficultyOverall, forbiddenWordingHits, matchIngredient, newId, violatesLimits } from '../../../../packages/core/src/index.ts';
import { bannedTechniqueIds, ideaIngredients, ingredientIndex, type HomeEnv } from './env.ts';
import { SLOT_LIMITS, SLOTS, type DropReason, type HomeIdea, type RawIdea, type RawOutput, type Slot } from './types.ts';

export const MAX_TITLE = 40;
export const MAX_WHY = 120;
export const MAX_COMMENT = 80;
export const MAX_IDEAS = 5;
// 偶爾下廚的人：難易度總分（1–10）超過這個就拿掉
export const OCCASIONAL_MAX_DIFFICULTY = 4;

// 帶單位的數字（阿拉伯數字已經整個禁止；這裡抓中文數字加時間、重量、容量、溫度的單位）
const UNIT_NUMBER = /[零一二兩三四五六七八九十百半]+\s*(分鐘|分|小時|秒|公克|克|公斤|毫升|公升|公分|度|大匙|小匙|茶匙|湯匙|匙|杯|斤)/;

const TEMP_MARK = /\{\{temp:\d{2,3}(?:\.\d)?:[CF]\}\}/g;

// 自由文字的檢查：先把合法的溫度標記拿掉，再用語系檔同一套禁用字眼掃（也抓得到帶單位的數字：任何數字都不行）
export function wordingProblems(text: string): string[] {
  const stripped = text.replace(TEMP_MARK, '');
  if (stripped.includes('{{') || stripped.includes('}}')) return ['標記格式錯誤'];
  const hits = forbiddenWordingHits(stripped);
  if (UNIT_NUMBER.test(stripped)) hits.push('帶單位的數字');
  return hits;
}

export function normalizeTitle(t: string): string {
  return t.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

export function includesAny(text: string, terms: readonly string[]): boolean {
  const t = text.normalize('NFKC').toLowerCase();
  return terms.some((term) => term.length > 0 && t.includes(term.normalize('NFKC').toLowerCase()));
}

const isStr = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && [...v.trim()].length >= min && [...v].length <= max;
const isIntIn = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const strList = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 80);

// 形狀檢查（schema 沒擋的：長度、範圍、數量）
export function shapeOk(r: RawIdea): boolean {
  const d = r.difficulty;
  return (
    (SLOTS as string[]).includes(r.slot) &&
    typeof r.candidate_ref === 'string' &&
    isStr(r.title, 1, MAX_TITLE) &&
    isStr(r.why, 1, MAX_WHY) &&
    strList(r.uses_pantry_ids, 30) &&
    strList(r.uses_priority_ids, 30) &&
    Array.isArray(r.other_ingredients) && r.other_ingredients.length <= 15 &&
    r.other_ingredients.every((o) => isStr(o?.name, 1, 40)) &&
    typeof d === 'object' && d !== null &&
    isIntIn(d.ingredients, 1, 5) && isIntIn(d.equipment, 1, 5) && isIntIn(d.time, 1, 5) && isIntIn(d.technique, 1, 5) && isIntIn(d.failure_risk, 1, 5) &&
    strList(r.techniques, 10) &&
    strList(r.equipment, 10) &&
    Array.isArray(r.substitutions) && r.substitutions.length <= 6 &&
    r.substitutions.every((s) => isStr(s?.need, 1, 40) && isStr(s?.use, 1, 40))
  );
}

export interface CheckOptions {
  // 之前已經出現過的（換一組時不再給）：菜名與候選代號
  shownTitles?: ReadonlySet<string>;
  shownRefs?: ReadonlySet<string>;
  makeId?: () => string;
  // 對話用：每個槽位與整體的數量上限（預設是首頁的 2／2／1、最多 5）
  slotLimits?: Readonly<Record<Slot, number>>;
  maxIdeas?: number;
  // 對話用：使用者在對話中說的、廚房沒記的食材 ID。點子可以用，會放進 usesMentionedIds
  extraIds?: ReadonlySet<string>;
}

export interface CheckResult {
  ideas: HomeIdea[];
  chefComment: string | null;
  dropped: Partial<Record<DropReason, number>>;
}

export function checkHomeOutput(raw: RawOutput, env: HomeEnv, opts: CheckOptions = {}): CheckResult {
  const makeId = opts.makeId ?? newId;
  const dropped: CheckResult['dropped'] = {};
  const drop = (reason: DropReason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };
  const byRef = new Map(env.candidates.map((c) => [c.ref, c.idea]));
  const equipmentIds = new Set(env.equipmentEnum);
  const hasAllergens = env.limits.allergenIds.length > 0;
  const seenTitles = new Set<string>();
  const slotCount: Record<Slot, number> = { familiar: 0, twist: 0, adventure: 0 };
  const out: HomeIdea[] = [];
  const slotLimits = opts.slotLimits ?? SLOT_LIMITS;
  const maxIdeas = opts.maxIdeas ?? MAX_IDEAS;
  const extra = opts.extraIds;

  for (const r of raw.suggestions) {
    if (!r || typeof r !== 'object' || !shapeOk(r)) { drop('format'); continue; }

    // 候選：熟悉的一定要指到某個候選；變化版與新挑戰可以不指，指了要是真的
    const candidate = r.candidate_ref ? byRef.get(r.candidate_ref) : undefined;
    if (r.candidate_ref && !candidate) { drop('bad_candidate'); continue; }
    if (r.slot === 'familiar' && !candidate) { drop('bad_candidate'); continue; }
    // 熟悉的菜名用候選的（自己的食譜、家常菜的名稱不讓 AI 改）
    const title = r.slot === 'familiar' && candidate ? candidate.title : r.title.trim();

    // 食材：只能用送出去的（沒過期的）；不在清單裡的整個點子拿掉
    if (r.uses_pantry_ids.some((id) => !env.pantryIds.has(id) && !extra?.has(id))) { drop('pantry_not_sent'); continue; }

    // 其他材料：用字典比對出 ID；有設過敏原，而且有對不到字典的，整個拿掉
    const others = r.other_ingredients.map((o) => ({ name: o.name.trim(), ingredientId: matchIngredient(o.name, ingredientIndex) ?? null }));
    if (hasAllergens && others.some((o) => o.ingredientId === null)) { drop('allergen_unknown_ingredient'); continue; }

    // 過敏原、飲食限制、不用料理酒、不吃的食物：用到的食材 ID 查字典
    const usedIds = [...r.uses_pantry_ids, ...others.flatMap((o) => (o.ingredientId ? [o.ingredientId] : []))];
    if (violatesLimits(usedIds, {}, env.limits, ideaIngredients)) { drop('allergen'); continue; }
    // 菜名、其他材料、替代說明、理由用關鍵字再掃一次（字典沒收的說法，例如蝦醬、花生粉）
    const texts = [title, r.why, ...others.map((o) => o.name), ...r.substitutions.flatMap((s) => [s.need, s.use])];
    if (texts.some((t) => includesAny(t, env.hardTerms) || includesAny(t, env.dislikeTerms))) { drop('keyword'); continue; }

    // 做得到嗎：手法要在可用的清單裡，不能是舒肥那類；廚具要是這個人有的
    const doable = new Set(env.techniqueEnum);
    if (r.techniques.some((t) => bannedTechniqueIds.has(t) || !doable.has(t))) { drop('technique'); continue; }
    if (r.equipment.some((e) => !equipmentIds.has(e))) { drop('equipment'); continue; }

    // 不催促、不數次數、不寫帶單位的數字
    if ([r.why, ...r.substitutions.flatMap((s) => [s.need, s.use])].some((t) => wordingProblems(t).length > 0)) { drop('wording'); continue; }

    // 偶爾下廚的人：難易度總分超過上限就拿掉
    const overall = difficultyOverall(r.difficulty);
    if (env.occasional && overall > OCCASIONAL_MAX_DIFFICULTY) { drop('too_hard'); continue; }

    // 重複、已經出現過
    const key = normalizeTitle(title);
    if (seenTitles.has(key)) { drop('duplicate'); continue; }
    if (opts.shownTitles?.has(key) || (candidate && opts.shownRefs?.has(candidate.key))) { drop('already_shown'); continue; }

    // 槽位數量與總數
    if (slotCount[r.slot] >= slotLimits[r.slot] || out.length >= maxIdeas) { drop('slot_limit'); continue; }

    seenTitles.add(key);
    slotCount[r.slot] += 1;
    const priority = new Set(r.uses_priority_ids.filter((id) => r.uses_pantry_ids.includes(id) && env.priorityIds.has(id)));
    out.push({
      id: makeId(),
      slot: r.slot,
      title,
      why: r.why.trim(),
      candidateRef: candidate?.key ?? null,
      usesPantryIds: [...new Set(r.uses_pantry_ids)].filter((id) => !extra || env.pantryIds.has(id)),
      ...(extra ? { usesMentionedIds: [...new Set(r.uses_pantry_ids)].filter((id) => !env.pantryIds.has(id)) } : {}),
      usesPriorityIds: [...priority],
      otherIngredients: others,
      difficulty: { ...r.difficulty, overall },
      techniques: [...new Set(r.techniques)],
      equipment: [...new Set(r.equipment)],
      substitutions: r.substitutions.map((s) => ({ need: s.need.trim(), use: s.use.trim() })),
    });
  }

  // 大廚的話：沒過檢查就不用（手機改用情境句子）
  const c = typeof raw.chef_comment === 'string' ? raw.chef_comment.trim() : '';
  const commentOk =
    c.length > 0 && [...c].length <= MAX_COMMENT && wordingProblems(c).length === 0 && !includesAny(c, env.hardTerms) && !includesAny(c, env.dislikeTerms);
  return { ideas: out, chefComment: commentOk ? c : null, dropped };
}

// 快取裡的點子要重新檢查（使用者可能剛改了過敏原或食材）：只看會變的部分，不重做格式與槽位
export function recheckCachedIdeas(ideas: HomeIdea[], env: HomeEnv): HomeIdea[] {
  return ideas.filter((i) => {
    if (i.usesPantryIds.some((id) => !env.pantryIds.has(id))) return false;
    const ids = [...i.usesPantryIds, ...i.otherIngredients.flatMap((o) => (o.ingredientId ? [o.ingredientId] : []))];
    if (violatesLimits(ids, {}, env.limits, ideaIngredients)) return false;
    if (env.limits.allergenIds.length > 0 && i.otherIngredients.some((o) => o.ingredientId === null)) return false;
    const texts = [i.title, i.why, ...i.otherIngredients.map((o) => o.name), ...i.substitutions.flatMap((s) => [s.need, s.use])];
    if (texts.some((t) => includesAny(t, env.hardTerms) || includesAny(t, env.dislikeTerms))) return false;
    if (env.occasional && i.difficulty.overall > OCCASIONAL_MAX_DIFFICULTY) return false;
    if (env.owned !== null && i.equipment.some((e) => !env.equipmentEnum.includes(e))) return false;
    return true;
  });
}
