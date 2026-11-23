// 用說的改食譜（M1b-04a，03〈用說的：口述整理成食譜〉最後一段）：`ai` 函式 edit_by_voice 任務的輸入、回傳，
// 以及「模型只回要改的地方 → 程式驗證成變更清單」的規則。前端（列出「會改這些」、套進表單）與 Edge Functions 共用。
import { DICTATION_LIMITS, DICTATION_MAX_CHARS } from './dictation.ts';

export const REFINE_MAX_CHARS = DICTATION_MAX_CHARS; // 修改指令的字數上限（和口述一樣）
export const REFINE_MAX_OPS = 30; // 一次最多改幾處
export const REFINE_FIELDS = ['title', 'story', 'tips'] as const;
export type RefineField = (typeof REFINE_FIELDS)[number];
export const REFINE_LIST_OPS = ['replace', 'remove', 'add'] as const;
export type RefineListOp = (typeof REFINE_LIST_OPS)[number];

// 目前的食譜（含編輯頁還沒儲存的欄位）；食材與步驟已去掉空白、略過空的，編號是在這份清單裡的位置（從 1 開始給模型看）
export interface RefineCurrent {
  title: string;
  story: string;
  tips: string;
  ingredients: string[];
  steps: string[];
}

export interface RefineInput {
  text: string;
  lang: string;
  current: RefineCurrent;
}

// 模型回傳的原始修改（還沒驗證）。index 是 1 起算的編號：replace、remove 指那一項；add 是「加在第 index 項後面」（0 ＝ 最前面）
export interface RawRefine {
  fields: { field: string; value: string }[];
  ingredients: { op: string; index: number; text: string }[];
  steps: { op: string; index: number; text: string }[];
}

// 驗證過的變更。index 是 0 起算、對應送出去的清單：replace、remove 指那一項；add 的 after 是「加在第 after 項後面」（-1 ＝ 最前面）
export type RefineChange =
  | { kind: 'field'; field: RefineField; from: string; to: string }
  | { kind: 'ingredient' | 'step'; op: 'replace'; index: number; from: string; to: string }
  | { kind: 'ingredient' | 'step'; op: 'remove'; index: number; from: string }
  | { kind: 'ingredient' | 'step'; op: 'add'; after: number; to: string };

export type RefineListChange = Exclude<RefineChange, { kind: 'field' }>;

export type RefineResponse = { status: 'ok'; changes: RefineChange[] };

const len = (s: string): number => [...s].length;
const FIELD_MAX: Record<RefineField, number> = { title: DICTATION_LIMITS.title, story: DICTATION_LIMITS.story, tips: DICTATION_LIMITS.tips };
const LIST_MAX = {
  ingredient: { items: DICTATION_LIMITS.ingredients, chars: DICTATION_LIMITS.ingredient },
  step: { items: DICTATION_LIMITS.steps, chars: DICTATION_LIMITS.step },
} as const;

function listChanges(
  kind: 'ingredient' | 'step',
  current: readonly string[],
  ops: RawRefine['ingredients'],
): RefineChange[] {
  const { items: maxItems, chars } = LIST_MAX[kind];
  const out: RefineChange[] = [];
  const touched = new Set<number>(); // 同一項只採用第一個 replace／remove
  let remaining = current.length;
  for (const o of ops) {
    const text = o.text.trim();
    if (o.op === 'add') {
      if (!Number.isInteger(o.index) || o.index < 0 || o.index > current.length || text === '' || len(text) > chars) continue;
      if (remaining + 1 > maxItems) continue;
      if (out.some((c) => c.kind === kind && c.op === 'add' && c.to === text)) continue;
      out.push({ kind, op: 'add', after: o.index - 1, to: text });
      remaining++;
    } else if (o.op === 'replace' || o.op === 'remove') {
      const i = o.index - 1;
      const from = current[i];
      if (!Number.isInteger(o.index) || from === undefined || touched.has(i)) continue;
      if (o.op === 'remove') {
        touched.add(i);
        out.push({ kind, op: 'remove', index: i, from });
        remaining--;
      } else if (text !== '' && len(text) <= chars && text !== from.trim()) {
        touched.add(i);
        out.push({ kind, op: 'replace', index: i, from, to: text });
      }
    }
  }
  return out;
}

// 模型的輸出 → 驗證過的變更清單。編號對不上、改成一樣的字、超過長度或數量上限的通通丟掉；
// 欄位只能是標題、心得、料理筆記（心得與料理筆記改成空字串＝清掉；標題不能清空）。
export function refineChanges(current: RefineCurrent, raw: RawRefine): RefineChange[] {
  const changes: RefineChange[] = [];
  const seen = new Set<string>();
  for (const f of raw.fields) {
    if (!(REFINE_FIELDS as readonly string[]).includes(f.field)) continue;
    const field = f.field as RefineField;
    const to = f.value.trim();
    if (seen.has(field) || len(to) > FIELD_MAX[field] || (field === 'title' && to === '') || to === current[field].trim()) continue;
    seen.add(field);
    changes.push({ kind: 'field', field, from: current[field], to });
  }
  changes.push(...listChanges('ingredient', current.ingredients, raw.ingredients), ...listChanges('step', current.steps, raw.steps));
  return changes.slice(0, REFINE_MAX_OPS);
}
