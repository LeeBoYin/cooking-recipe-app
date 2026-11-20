// 難易度：五個面向各 1–5，總分 1–10（05 衍生欄位）。資料庫的 private.difficulty_overall 用同一個算法，
// 這裡讓編輯頁在存檔前就能顯示「算出來 N / 10」；以資料庫算出來的為準。
export const DIFFICULTY_FACETS = ['ingredients', 'equipment', 'time', 'technique', 'failure_risk'] as const;
export type DifficultyFacet = (typeof DIFFICULTY_FACETS)[number];
export type DifficultyValues = Record<DifficultyFacet, number>;

export function difficultyOverall(values: DifficultyValues): number {
  const average = DIFFICULTY_FACETS.reduce((sum, f) => sum + values[f], 0) / DIFFICULTY_FACETS.length;
  return Math.round(1 + (9 * (average - 1)) / 4);
}
