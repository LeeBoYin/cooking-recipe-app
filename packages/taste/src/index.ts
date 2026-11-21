// 口味地圖的字典：偏好維度、題庫、基礎菜色庫。前端與 Edge Functions 共用，部署時也匯入資料庫的 dict_* 表。
// 題庫目前是 83 題（菜卡 35、快問快答 14、二選一 11、光譜 8、情境 3），其餘隨 M0-17b 補；
// 基礎菜色是約 40 道台灣家常菜，完整的 300–500 道在 M1 補。
import baseDishesData from '../data/base-dishes.json' with { type: 'json' };
import dimensionsData from '../data/preference-dimensions.json' with { type: 'json' };
import quizItemsData from '../data/quiz-items.json' with { type: 'json' };
import type { BaseDish, PreferenceDimension, QuizItem } from './types.ts';

export * from './types.ts';

export const preferenceDimensions = dimensionsData as PreferenceDimension[];
export const quizItems = quizItemsData as unknown as QuizItem[];
export const baseDishes = baseDishesData as BaseDish[];

const dimensionByKey = new Map(preferenceDimensions.map((d) => [d.key, d]));

export function getDimension(key: string): PreferenceDimension | undefined {
  return dimensionByKey.get(key);
}

// 維度和它所有的上層（例：cuisine.southeast_asia.thai → cuisine.southeast_asia）
export function dimensionWithAncestors(key: string): string[] {
  const out: string[] = [];
  let current = dimensionByKey.get(key);
  while (current && !out.includes(current.key)) {
    out.push(current.key);
    current = current.parentKey ? dimensionByKey.get(current.parentKey) : undefined;
  }
  return out;
}
