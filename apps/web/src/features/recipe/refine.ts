// 用說的改食譜（M1b-04a）：編輯頁的表單 ⇄ edit_by_voice 任務的輸入，以及把確認過的變更套進表單（純函式，方便測試）。
import { newId, type RefineChange, type RefineCurrent, type RefineListChange } from '@zhusha/core';
import type { EditorForm, EditorIngredient, EditorStep } from './model.ts';

const filled = (s: string) => s.trim() !== '';

// 送給大廚的「目前的食譜」：含還沒儲存的欄位；空白的食材與步驟略過（編號就是略過之後的位置）
export function refineCurrentOf(form: EditorForm): RefineCurrent {
  return {
    title: form.title.trim(),
    story: form.story.trim(),
    tips: form.tips.trim(),
    ingredients: form.ingredients.filter((i) => filled(i.text)).map((i) => i.text.trim()),
    steps: form.steps.filter((s) => filled(s.text)).map((s) => s.text.trim()),
  };
}

// 「會改這些」清單裡每一列的內容（畫面再依 kind 與 op 配上文案）
export function describeChange(c: RefineChange): { kind: RefineChange['kind']; op: 'field' | 'replace' | 'remove' | 'add'; field?: string; from?: string; to?: string } {
  if (c.kind === 'field') return { kind: 'field', op: 'field', field: c.field, from: c.from, to: c.to };
  if (c.op === 'add') return { kind: c.kind, op: 'add', to: c.to };
  if (c.op === 'remove') return { kind: c.kind, op: 'remove', from: c.from };
  return { kind: c.kind, op: 'replace', from: c.from, to: c.to };
}

// 變更清單的編號對的是「送出去的清單」（略過空白列）。這裡把它對回表單上的列：
// 改到的與新加的列標「新的」；沒說到的列（含只有照片的步驟）原樣留著。
function applyList<T extends { id: string; text: string; isNew?: boolean }>(
  rows: T[],
  kind: 'ingredient' | 'step',
  changes: RefineChange[],
  make: (text: string) => T,
  keepEmpty: (row: T) => boolean,
): T[] {
  const mine = changes.filter((c): c is RefineListChange => c.kind === kind);
  if (mine.length === 0) return rows;
  const sentIndexOf = (rowIndex: number): number => rows.slice(0, rowIndex + 1).filter((r) => filled(r.text)).length - 1;
  const out: T[] = [];
  const addAfter = new Map<number, string[]>(); // 送出去的第 n 項後面要加的（-1 ＝ 最前面）
  for (const c of mine) if (c.op === 'add') addAfter.set(c.after, [...(addAfter.get(c.after) ?? []), c.to]);
  out.push(...(addAfter.get(-1) ?? []).map(make));
  rows.forEach((row, i) => {
    if (!filled(row.text)) {
      if (keepEmpty(row)) out.push(row); // 只有照片的步驟：跟在前一個有文字的步驟後面（前面的 add 已經放過了）
      return;
    }
    const sent = sentIndexOf(i);
    const change = mine.find((c) => c.op !== 'add' && c.index === sent);
    if (change?.op === 'remove') {
      // 步驟拿掉時，步驟上的照片一起留不住：只拿掉文字，有照片的步驟留成只有照片的步驟
      if (kind === 'step' && (row as unknown as EditorStep).photo) out.push({ ...row, text: '' });
    } else if (change?.op === 'replace') out.push({ ...row, text: change.to, isNew: true });
    else out.push(row);
    out.push(...(addAfter.get(sent) ?? []).map(make));
  });
  return out;
}

export function applyChanges(form: EditorForm, changes: RefineChange[]): { form: EditorForm; count: number } {
  const next: EditorForm = { ...form };
  for (const c of changes) if (c.kind === 'field') next[c.field] = c.to;
  next.ingredients = applyList<EditorIngredient>(form.ingredients, 'ingredient', changes, (text) => ({ id: newId(), text, isNew: true }), () => false);
  next.steps = applyList<EditorStep>(form.steps, 'step', changes, (text) => ({ id: newId(), text, isNew: true }), (s) => !!s.photo);
  return { form: next, count: changes.length };
}
