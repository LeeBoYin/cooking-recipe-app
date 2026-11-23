// 展開好的做法的程式再檢查（03〈安全與信任〉）：過敏原、飲食限制、不吃的食材、安全規則、手法與廚具、單位與數字。
// 任何一項不合格，整份不用（不只刪掉違規的食材，因為步驟裡可能還寫著它）。純函式：評估集與單元測試餵假的 AI 回應。
// 紀錄只留原因與數量，不含內容。
import { isPlainSafeIngredient, matchIngredientExact, newId, violatesLimits, type DraftIngredient, type DraftStep, type RecipeDraft, type UnitCode } from '../../../../packages/core/src/index.ts';
import { donenessFor, sousVidePresetsFor } from '../../../../packages/equipment/src/index.ts';
import { includesAny } from '../home/check.ts';
import { ideaIngredients, ingredientIndex, type HomeEnv } from '../home/env.ts';
import { isKnownTechnique } from './names.ts';
import { DRAFT_UNITS, NO_AMOUNT_UNITS } from './prompt.ts';
import type { DraftProblem, RawDraft } from './types.ts';

export const MAX_INGREDIENTS = 30;
export const MAX_STEPS = 15;
export const MAX_STEP_CHARS = 200;
export const MAX_TIPS_CHARS = 300;

const TEMP_MARK = /\{\{temp:\d{2,3}(?:\.\d)?:[CF](?::min(?::\d{2,3}(?:\.\d)?)?)?\}\}/g;
// 只擋「會影響換算」的數字：時間、重量、容量、溫度（阿拉伯數字整個禁止，這裡抓「兩分鐘」「一大匙」）。
// 量詞描述（一片蛋皮、一顆煎蛋、片開成兩片）不是份量，不擋
const CN_NUM = '零一二兩三四五六七八九十百半';
const UNIT_NUMBER = new RegExp(`[${CN_NUM}]+\\s*(分鐘|分|小時|秒|公克|克|公斤|毫升|公升|公分|度|大匙|小匙|茶匙|湯匙|匙|杯|斤)`);
// 電鍋外鍋的水（外鍋半杯水、外鍋一杯水）：真的份量，但不隨人數變、電鍋量杯約 180 ml 也不是美式 cup，照寫、不換算
const POT_WATER = new RegExp(`外鍋[^。，、；,;]{0,6}?[${CN_NUM}]+\\s*杯(?:的)?水`, 'g');
const BODY_TALK = /罪惡|熱量|卡路里|減肥|瘦身|身材|發胖|不健康|變胖/;

// 步驟與小提醒的用字：不寫數字（溫度用標記）、不談身材。步驟是祈使句，不套首頁「不要命令」的那套禁用字眼
export function stepWordingProblems(text: string): boolean {
  const stripped = text.replace(TEMP_MARK, '').replace(POT_WATER, '外鍋水');
  return stripped.includes('{{') || stripped.includes('}}') || /[0-9０-９]/.test(stripped) || UNIT_NUMBER.test(stripped) || BODY_TALK.test(stripped);
}

const isStr = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && [...v.trim()].length >= min && [...v].length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strList = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 40);
const UNITS: ReadonlySet<string> = new Set(DRAFT_UNITS);

export type DraftCheck = { ok: true; draft: RecipeDraft; dropped: Partial<Record<DraftProblem, number>> } | { ok: false; problems: Partial<Record<DraftProblem, number>> };

export function checkDraft(raw: RawDraft, env: HomeEnv, opts: { servings: number; model: string; makeId?: () => string }): DraftCheck {
  const makeId = opts.makeId ?? newId;
  const problems: Partial<Record<DraftProblem, number>> = {};
  const flag = (p: DraftProblem) => {
    problems[p] = (problems[p] ?? 0) + 1;
  };
  const bad = () => ({ ok: false as const, problems });

  if (!raw || !Array.isArray(raw.ingredients) || !Array.isArray(raw.steps)) {
    flag('format');
    return bad();
  }
  if (raw.ingredients.length < 1 || raw.ingredients.length > MAX_INGREDIENTS || raw.steps.length < 1 || raw.steps.length > MAX_STEPS) flag('format');
  if (raw.tips !== null && raw.tips !== undefined && !isStr(raw.tips, 1, MAX_TIPS_CHARS)) flag('format');
  if (Object.keys(problems).length > 0) return bad();

  const equipmentIds = new Set(env.equipmentEnum);
  const doable = new Set(env.techniqueEnum);
  const hasAllergens = env.limits.allergenIds.length > 0;
  const presets = sousVidePresetsFor(env.ctx.kitchen.region);
  const hardTexts: string[] = [];

  // 食材
  const ingredients: DraftIngredient[] = [];
  const ids: string[] = [];
  for (const r of raw.ingredients) {
    if (!r || !isStr(r.name, 1, 40) || !UNITS.has(r.unit) || typeof r.optional !== 'boolean') { flag('format'); continue; }
    const noAmount = NO_AMOUNT_UNITS.includes(r.unit);
    if (noAmount ? r.amount !== null : !(isNum(r.amount) && r.amount > 0 && r.amount <= 5000)) { flag('unit'); continue; }
    if (r.amount_max !== null && !(isNum(r.amount_max) && r.amount !== null && r.amount_max > r.amount && r.amount_max <= 5000)) { flag('unit'); continue; }
    if (r.group !== null && !isStr(r.group, 1, 10)) { flag('format'); continue; }
    const name = r.name.trim();
    const ingredientId = matchIngredientExact(name, ingredientIndex) ?? null;
    if (ingredientId === null && hasAllergens && !isPlainSafeIngredient(name)) { flag('allergen_unknown_ingredient'); continue; }
    if (ingredientId) ids.push(ingredientId);
    hardTexts.push(name);
    ingredients.push({
      id: makeId(), name, ingredientId,
      ...(r.amount !== null ? { amount: r.amount } : {}),
      ...(r.amount_max !== null ? { amountMax: r.amount_max } : {}),
      unit: r.unit as UnitCode,
      optional: r.optional,
      ...(r.group !== null ? { group: r.group.trim() } : {}),
    });
  }

  // 步驟
  const steps: DraftStep[] = [];
  raw.steps.forEach((s, i) => {
    if (!s || !isStr(s.text, 1, MAX_STEP_CHARS) || !strList(s.techniques, 5) || !strList(s.equipment, 5)) { flag('format'); return; }
    if (s.timer_seconds !== null && !(Number.isInteger(s.timer_seconds) && s.timer_seconds >= 1 && s.timer_seconds <= 43200)) { flag('format'); return; }
    if (s.target_temp_c !== null && !(isNum(s.target_temp_c) && s.target_temp_c >= 30 && s.target_temp_c <= 300)) { flag('format'); return; }
    if (stepWordingProblems(s.text)) flag('wording');
    hardTexts.push(s.text);
    for (const t of s.techniques) {
      if (!isKnownTechnique(t)) flag('technique');
      // 舒肥：水溫與時間只能落在安全表的某一組裡；表是空的就一律擋下
      else if (t === 'sous-vide') {
        const inTable = presets.some((p) =>
          s.target_temp_c === p.tempC && s.timer_seconds !== null && s.timer_seconds >= p.minMinutes * 60 && s.timer_seconds <= p.maxMinutes * 60);
        if (!inTable) flag('safety');
      } else if (!doable.has(t)) flag('technique');
    }
    if (s.equipment.some((e) => !equipmentIds.has(e))) flag('equipment');
    steps.push({
      id: makeId(), order: i + 1, text: s.text.trim(),
      ...(s.timer_seconds !== null ? { timerSeconds: s.timer_seconds } : {}),
      ...(s.techniques.length ? { techniques: [...new Set(s.techniques)] } : {}),
      ...(s.equipment.length ? { equipmentTypeIds: [...new Set(s.equipment)] } : {}),
      ...(s.target_temp_c !== null ? { targetTemp: { value: s.target_temp_c, unit: 'C' as const } } : {}),
    });
  });
  const tips = typeof raw.tips === 'string' ? raw.tips.trim() : '';
  if (tips) {
    hardTexts.push(tips);
    if (stepWordingProblems(tips)) flag('wording');
  }

  // 過敏原、飲食限制、不用料理酒、不吃的食物：食材 ID 查字典，再用關鍵字掃全部文字（字典沒收的說法，例如蝦醬、花生粉）
  if (violatesLimits(ids, {}, env.limits, ideaIngredients)) flag('allergen');
  if (hardTexts.some((t) => includesAny(t, env.hardTerms) || includesAny(t, env.dislikeTerms))) flag('keyword');
  if (Object.keys(problems).length > 0) return bad();

  const tipLines = [...(tips ? [tips] : []), ...donenessTips(ids, env)];
  return {
    ok: true,
    dropped: {},
    draft: {
      schemaVersion: 1,
      servings: opts.servings,
      ingredients,
      steps,
      ...(tipLines.length ? { tips: tipLines.join('\n') } : {}),
      model: opts.model,
    },
  };
}

// 程式補上的安全提醒：用到禽肉、肉類、海鮮、蛋時，把當地標準的中心溫度寫進小提醒（來源是安全表，不靠 AI）
export function donenessTips(ids: readonly string[], env: HomeEnv): string[] {
  const traits = new Set(ids.flatMap((id) => ideaIngredients.get(id)?.traits ?? []));
  const rows: [string, string][] = [];
  if (traits.has('poultry')) rows.push(['poultry', '雞、鴨等禽肉']);
  // 絞肉與整塊肉分不出來時用比較高的那個（ground-meat）
  if (traits.has('pork') || traits.has('beef') || traits.has('lamb')) rows.push(['ground-meat', '豬、牛、羊肉']);
  if (traits.has('seafood')) rows.push(['fish-seafood', '魚與海鮮']);
  if (traits.has('egg')) rows.push(['egg', '蛋料理']);
  const region = env.ctx.kitchen.region;
  return rows.flatMap(([id, label]) => {
    const row = donenessFor(region, id);
    if (!row) return [];
    // 只用該地區官方公布的數值，不由程式換算：有官方華氏值（美國）兩個單位都帶（顯示時依使用者偏好挑），只有攝氏的只帶攝氏（偏好華氏時由顯示端無條件進位換算）
    const mark = row.minTempF !== undefined ? `{{temp:${row.minTempF}:F:min:${row.minTempC}}}` : `{{temp:${row.minTempC}:C:min}}`;
    return [`${label}要煮到中心溫度 ${mark} 以上。`];
  });
}

// 已經存下來的做法（收藏裡的、快取裡的）還能不能給這個人看：只重做會變的部分（過敏原、飲食限制、不吃的食物）
export function storedDraftOk(draft: RecipeDraft, env: HomeEnv): boolean {
  if (draft.schemaVersion !== 1 || !Array.isArray(draft.ingredients) || !Array.isArray(draft.steps)) return false;
  const ids = draft.ingredients.flatMap((i) => (i.ingredientId ? [i.ingredientId] : []));
  if (violatesLimits(ids, {}, env.limits, ideaIngredients)) return false;
  if (env.limits.allergenIds.length > 0 && draft.ingredients.some((i) => i.ingredientId === null)) return false;
  const texts = [...draft.ingredients.map((i) => i.name), ...draft.steps.map((s) => s.text), draft.tips ?? ''];
  return !texts.some((t) => includesAny(t, env.hardTerms) || includesAny(t, env.dislikeTerms));
}
