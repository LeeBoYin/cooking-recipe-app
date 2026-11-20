// 新手引導的步驟（12 第三節）。M0 版：① 願景卡、② 安裝、④ 飲食限制、⑤ 口味探索；
// ⑥ 建立我的廚房、⑦ 廚房裡有什麼、⑧ 收尾由 M0-18 接在 taste 後面。最後一步做完才算走完引導。
export const STEPS = [
  { id: 'vision', bar: false },
  { id: 'install', bar: false },
  { id: 'diet', bar: true },
  { id: 'taste', bar: true },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

const ids: readonly string[] = STEPS.map((s) => s.id);

// 從 `after` 的下一步開始，找第一個還沒做完的步驟；重跑時不跳過。沒有了回傳 null（走完了）
export function nextStepId(after: StepId | null, completed: readonly string[], redo: boolean): StepId | null {
  const start = after === null ? 0 : ids.indexOf(after) + 1;
  for (const step of STEPS.slice(start)) {
    if (redo || !completed.includes(step.id)) return step.id;
  }
  return null;
}

export const isLastStep = (id: StepId) => id === STEPS[STEPS.length - 1]?.id;

// 上方進度條：只算有進度條的步驟。回傳 [目前是第幾段, 共幾段]；沒有進度條的步驟回傳 null
export function barPosition(id: StepId): [number, number] | null {
  const barred = STEPS.filter((s) => s.bar);
  const idx = barred.findIndex((s) => s.id === id);
  return idx < 0 ? null : [idx + 1, barred.length];
}
