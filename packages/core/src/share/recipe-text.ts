// 純文字分享（02 G）：把一篇食譜排成可以直接貼到 LINE 的純文字。
// 不產生連結（分享連結是 M2）。標題文字由呼叫端傳入（語系檔），這裡只管排版。
export type RecipeTextInput = {
  title: string;
  servings?: string | undefined; // 已經套好人數的文字，例：「2 人份」
  ingredients: readonly string[]; // 已依人數與單位換算好的一列一樣
  steps: readonly string[]; // 每步一段，目標溫度之類已併進文字
  tips?: string | null | undefined;
};

export type RecipeTextLabels = {
  servings: string; // 「份量」
  ingredients: string; // 「食材」
  steps: string; // 「做法」
  tips: string; // 「料理筆記」
};

const clean = (s: string) => s.replace(/\r\n?/g, '\n').trim();

// 每個區塊之間空一行；沒內容的區塊整段省略
export function formatRecipeText(input: RecipeTextInput, labels: RecipeTextLabels): string {
  const blocks: string[] = [`【${clean(input.title)}】`];
  const servings = input.servings ? clean(input.servings) : '';
  if (servings) blocks.push(`${labels.servings}：${servings}`);
  const ingredients = input.ingredients.map(clean).filter(Boolean);
  if (ingredients.length > 0) blocks.push([labels.ingredients, ...ingredients.map((l) => `・${l}`)].join('\n'));
  const steps = input.steps.map(clean).filter(Boolean);
  if (steps.length > 0) {
    // 多行的步驟，後面的行縮排對齊，貼到 LINE 比較好讀
    blocks.push([labels.steps, ...steps.map((s, i) => `${i + 1}. ${s.replace(/\n/g, '\n   ')}`)].join('\n'));
  }
  const tips = input.tips ? clean(input.tips) : '';
  if (tips) blocks.push(`${labels.tips}\n${tips}`);
  return blocks.join('\n\n');
}
