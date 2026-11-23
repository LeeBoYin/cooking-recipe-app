import type { RevisionSnapshot } from '../../data/recipeRevisions.ts';

// 兩份文字清單的差異：新增的、拿掉的（同一行出現幾次也算，順序不比）
export function lineDiff(from: string[], to: string[]): { added: string[]; removed: string[] } {
  const left = new Map<string, number>();
  for (const l of from) left.set(l, (left.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of to) {
    const n = left.get(l) ?? 0;
    if (n > 0) left.set(l, n - 1);
    else added.push(l);
  }
  const removed: string[] = [];
  for (const [l, n] of left) for (let i = 0; i < n; i++) removed.push(l);
  return { added, removed };
}

export type RevisionChanges = {
  title: boolean;
  servings: boolean;
  tips: boolean;
  ingredients: ReturnType<typeof lineDiff>;
  steps: ReturnType<typeof lineDiff>;
};

const ingredientLines = (s: RevisionSnapshot) => (s.ingredients ?? []).map((i) => i.raw_text);
const stepLines = (s: RevisionSnapshot) =>
  (s.steps ?? []).slice().sort((a, b) => a.order - b.order).map((x) => x.text);

// 這一版和上一版比，做法哪裡不一樣
export function revisionChanges(prev: RevisionSnapshot, next: RevisionSnapshot): RevisionChanges {
  return {
    title: (prev.title ?? '') !== (next.title ?? ''),
    servings: (prev.servings ?? null) !== (next.servings ?? null),
    tips: (prev.tips ?? '') !== (next.tips ?? ''),
    ingredients: lineDiff(ingredientLines(prev), ingredientLines(next)),
    steps: lineDiff(stepLines(prev), stepLines(next)),
  };
}
