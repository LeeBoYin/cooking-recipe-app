// 用說的（M1b-03）：編輯頁的表單 ⇄ dictation 任務的輸入與回傳（純函式，方便測試）。
import { DICTATION_LIMITS, newId, storyWithDictation, storyWithoutDictation, type DictationCurrent, type DictationItem, type DictationResult } from '@zhusha/core';
import { recipeLimits } from '../../data/recipes.ts';
import type { EditorForm, EditorIngredient, EditorStep } from './model.ts';

const filled = (s: string) => s.trim() !== '';

// 心得裡還留著原話嗎？（AI 不能用時原話放進心得；之後按「讓大廚整理」再跑一次。心得還是原話時當成空的）
export function hasRawDictation(form: EditorForm, dictation: string | null | undefined): boolean {
  return !!dictation && storyWithoutDictation(form.story, dictation) !== null;
}

// 送給大廚的「目前的欄位」：空白的項目略過；心得裡留著的原話先拿掉（那不是作者自己寫的）
export function currentOf(form: EditorForm, dictation: string | null | undefined): DictationCurrent {
  const own = dictation ? storyWithoutDictation(form.story, dictation) : null;
  return {
    title: form.title.trim(),
    story: (own ?? form.story).trim(),
    tips: form.tips.trim(),
    ingredients: form.ingredients.filter((i) => filled(i.text)).map((i) => i.text.trim()),
    steps: form.steps.filter((s) => filled(s.text)).map((s) => s.text.trim()),
    highlights: form.highlights,
    difficultySource: form.difficulty?.source ?? null,
  };
}

// AI 不能用時：原話放進心得（接在作者自己寫的後面）
export function withRawDictation(form: EditorForm, text: string, previous: string | null | undefined): EditorForm {
  const own = previous ? (storyWithoutDictation(form.story, previous) ?? form.story) : form.story;
  return { ...form, story: storyWithDictation(own, text) };
}

// 把大廚整理好的結果填進表單。作者原本的食材與步驟（from 對應送出去的清單）原樣保留，新的標「新的」。
// 沒有文字、也沒有照片的空白列直接拿掉；沒有文字但有照片的步驟留在原本的位置。
// 回傳填了或補了幾個欄位（產品事件用，只有數量）。
export function applyResult(form: EditorForm, result: DictationResult, dictation: string | null | undefined): { form: EditorForm; fieldCount: number } {
  let fieldCount = 0;
  const next: EditorForm = { ...form };

  if (form.title.trim() === '' && result.title !== '') {
    next.title = result.title;
    fieldCount++;
  }
  // 心得裡留著原話：換成整理好的心得（作者自己寫的部分原樣在 result.story 裡）；整理出來是空的就清成空的
  const hadRaw = hasRawDictation(form, dictation);
  if (hadRaw || (form.story.trim() === '' && result.story !== '')) {
    next.story = result.story;
    if (result.story !== '' && result.story !== form.story.trim()) fieldCount++;
  }
  if (result.tips !== '' && form.tips.trim() === '') {
    next.tips = result.tips;
    fieldCount++;
  }

  const sentIngredients = form.ingredients.filter((i) => filled(i.text));
  next.ingredients = result.ingredients.map((item): EditorIngredient => {
    const own = item.from === null ? undefined : sentIngredients[item.from];
    return own ? { ...own } : { id: newId(), text: item.text, isNew: true };
  });
  if (result.ingredients.some((i) => i.from === null)) fieldCount++;

  next.steps = mergeSteps(form.steps, result.steps);
  if (result.steps.some((s) => s.from === null)) fieldCount++;

  if (form.highlights.length === 0 && result.highlights.length > 0) {
    next.highlights = result.highlights as EditorForm['highlights'];
    fieldCount++;
  }
  if (result.difficulty && form.difficulty?.source !== 'author') {
    const hasMethod = next.ingredients.length > 0 || next.steps.length > 0;
    next.difficulty = { values: result.difficulty, source: 'ai', estimatedFrom: hasMethod ? 'recipe' : 'text' };
    fieldCount++;
  }
  return { form: next, fieldCount };
}

function mergeSteps(current: EditorStep[], items: DictationItem[]): EditorStep[] {
  // 有文字的步驟依序對應送出去的清單；沒文字的步驟只有帶照片的才留，跟在前一個有文字的步驟後面
  const own: EditorStep[] = [];
  const trailing = new Map<number, EditorStep[]>(); // 有文字的第 n 個步驟後面跟著的「只有照片」的步驟（-1 是最前面）
  for (const s of current) {
    if (filled(s.text)) own.push(s);
    else if (s.photo) trailing.set(own.length - 1, [...(trailing.get(own.length - 1) ?? []), s]);
  }
  const out: EditorStep[] = [...(trailing.get(-1) ?? [])];
  for (const item of items) {
    const mine = item.from === null ? undefined : own[item.from];
    out.push(mine ? { ...mine } : { id: newId(), text: item.text, isNew: true });
    if (item.from !== null) out.push(...(trailing.get(item.from) ?? []));
  }
  // 只有照片的步驟讓總數超過上限時，從後面的新步驟開始拿掉
  while (out.length > recipeLimits.steps) {
    const i = out.map((s) => s.isNew === true).lastIndexOf(true);
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out;
}

export { DICTATION_LIMITS };
