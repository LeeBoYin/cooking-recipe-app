// 常買清單的切換：沒選就加一張卡，已經選了就把那種食材的卡全部拿掉（含從搜尋加進來的）。
// 卡片上填過的內容直接丟掉，不確認（02 快速新增）。
export function toggleIngredientDraft<T extends { ingredient_id: string | null }>(
  drafts: readonly T[],
  ingredientId: string,
  create: () => T,
): T[] {
  if (drafts.some((d) => d.ingredient_id === ingredientId)) {
    return drafts.filter((d) => d.ingredient_id !== ingredientId);
  }
  return [...drafts, create()];
}
