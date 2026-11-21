// 展開好的做法（RecipeDraft）在畫面上的文字：單位與溫度依使用者的偏好顯示。純函式。
import {
  draftIngredientText, draftStepText, newId, parseMeasurePref, parseTemperaturePref, replaceTempMarks, formatTemperature, UNIT_CODES,
  type MeasurePref, type RecipeDraft, type TemperaturePref, type UnitLabels,
} from '@zhusha/core';
import type { IntlShape } from 'react-intl';
import type { EditorDraft } from '../recipe/model.ts';

export interface UnitPrefs {
  measure: MeasurePref;
  temperature: TemperaturePref;
  labels: UnitLabels;
}

export function unitPrefs(settings: { measure_unit?: string | null; temperature_unit?: string | null } | undefined, intl: IntlShape): UnitPrefs {
  return {
    measure: parseMeasurePref(settings?.measure_unit),
    temperature: parseTemperaturePref(settings?.temperature_unit),
    labels: Object.fromEntries(UNIT_CODES.map((u) => [u, intl.formatMessage({ id: `unit.${u}` })])) as UnitLabels,
  };
}

// 抽屜裡顯示的食材一列：「醬油 1 大匙」
export function ingredientLines(draft: RecipeDraft, prefs: UnitPrefs): { id: string; text: string; group?: string; optional: boolean }[] {
  return draft.ingredients.map((i) => ({
    id: i.id,
    text: draftIngredientText(i, prefs.measure, prefs.labels),
    optional: i.optional,
    ...(i.group ? { group: i.group } : {}),
  }));
}

export function stepLines(draft: RecipeDraft, prefs: UnitPrefs): { id: string; text: string; timerMinutes?: number; temp?: string }[] {
  return draft.steps.map((s) => ({
    id: s.id,
    text: replaceTempMarks(s.text, (value, unit) => formatTemperature({ value, unit }, prefs.temperature)),
    ...(s.timerSeconds ? { timerMinutes: Math.max(1, Math.round(s.timerSeconds / 60)) } : {}),
    ...(s.targetTemp ? { temp: formatTemperature(s.targetTemp, prefs.temperature) } : {}),
  }));
}

export function tipsText(draft: RecipeDraft, prefs: UnitPrefs): string | undefined {
  return draft.tips ? replaceTempMarks(draft.tips, (value, unit) => formatTemperature({ value, unit }, prefs.temperature)) : undefined;
}

// 「做了，記錄一篇」帶進編輯頁的內容：食材轉成編輯頁的一列文字（存檔時由 save_recipe 的解析器拆成食材 ID、數量、單位）；
// 步驟文字把計時與目標溫度接在後面（編輯頁只有文字欄位，免得資訊掉了）；ID 重新產生，不同食譜不共用
export function editorDraftOf(draft: RecipeDraft, prefs: UnitPrefs, timerLabel: (minutes: number) => string): EditorDraft {
  return {
    servings: draft.servings,
    ingredients: draft.ingredients.map((i) => ({ id: newId(), text: draftIngredientText(i, prefs.measure, prefs.labels) })),
    steps: draft.steps.map((s) => ({ id: newId(), text: draftStepText(s, prefs.temperature, timerLabel) })),
    tips: draft.tips ? replaceTempMarks(draft.tips, (value, unit) => formatTemperature({ value, unit }, prefs.temperature)) : '',
  };
}
