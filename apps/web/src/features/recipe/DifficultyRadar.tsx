import { DIFFICULTY_FACETS, type DifficultyValues } from '@zhusha/core';

// 五角形雷達圖：`line` 畫格線、`bulb` 畫範圍（17 食譜頁）
const CX = 29;
const CY = 28;
const R = 24;
const point = (i: number, ratio: number) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return `${(CX + Math.cos(angle) * R * ratio).toFixed(1)},${(CY + Math.sin(angle) * R * ratio).toFixed(1)}`;
};
const ring = (ratio: number) => DIFFICULTY_FACETS.map((_, i) => point(i, ratio)).join(' ');

export function DifficultyRadar({ values }: { values: DifficultyValues }) {
  return (
    <svg width="54" height="52" viewBox="0 0 58 56" aria-hidden="true" className="shrink-0">
      <polygon points={ring(1)} fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
      <polygon points={ring(0.5)} fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
      <polygon
        points={DIFFICULTY_FACETS.map((f, i) => point(i, values[f] / 5)).join(' ')}
        fill="var(--color-bulb-soft)"
        stroke="var(--color-bulb)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
