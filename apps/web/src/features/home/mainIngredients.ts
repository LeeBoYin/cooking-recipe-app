// 點子卡片的主要食材標籤：最多顯示 max 個，剩下的併成「+N」（首頁、對話、收藏共用的規則）。
export function mainIngredientTags(names: readonly string[], max = 3): { shown: string[]; more: number } {
  const unique = [...new Set(names)];
  return { shown: unique.slice(0, max), more: Math.max(0, unique.length - max) };
}
