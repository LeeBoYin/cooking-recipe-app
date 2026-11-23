// 展開好的做法 → 編輯頁的欄位文字（「做了，記錄一篇」帶入）。純函式，單位與溫度依使用者偏好顯示。
import { formatQuantity, formatTemperature, type MeasurePref, type TemperaturePref, type UnitLabels } from '../units/units.ts';
import { renderTempMarks, type DraftIngredient, type DraftStep } from './ai-types.ts';

// 「醬油 15 毫升」這種一列文字：編輯頁的食材原文格式，存檔時由 save_recipe 的解析器拆成食材 ID、數量、單位
export function draftIngredientText(ing: DraftIngredient, pref: MeasurePref, labels: UnitLabels): string {
  if (ing.amount === undefined || !ing.unit) {
    return ing.unit === 'to_taste' || ing.unit === 'pinch' ? `${ing.name} ${labels[ing.unit]}` : ing.name;
  }
  const range = ing.amountMax === undefined ? `${ing.amount}` : `${ing.amount}–${ing.amountMax}`;
  const raw = `${range} ${labels[ing.unit]}`;
  const quantity = formatQuantity({ amount: ing.amount, ...(ing.amountMax === undefined ? {} : { amountMax: ing.amountMax }), unit: ing.unit, unitText: '', raw }, 1, pref, labels);
  return `${ing.name} ${quantity}`;
}

// 步驟文字：溫度標記換成偏好的單位；有目標溫度、計時的步驟把它們接在後面，編輯頁只有文字欄位，免得資訊掉了
export function draftStepText(step: DraftStep, pref: TemperaturePref, timerLabel?: (minutes: number) => string): string {
  const base = renderTempMarks(step.text, pref);
  const extra: string[] = [];
  if (step.targetTemp) extra.push(formatTemperature(step.targetTemp, pref));
  if (step.timerSeconds && timerLabel) extra.push(timerLabel(Math.max(1, Math.round(step.timerSeconds / 60))));
  return extra.length > 0 ? `${base}（${extra.join('，')}）` : base;
}
