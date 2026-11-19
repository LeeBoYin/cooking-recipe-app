// 純 TypeScript：不用 Node 或瀏覽器專屬的 API，前端與 Deno 都能用
export type Temperature = { value: number; unit: 'C' | 'F' };

export function toCelsius(t: Temperature): number {
  return t.unit === 'C' ? t.value : Math.round(((t.value - 32) * 5) / 9);
}

export function difficultyOverall(dims: number[]): number {
  const avg = dims.reduce((a, b) => a + b, 0) / dims.length;
  return Math.round(1 + (9 * (avg - 1)) / 4);
}
