import { describe, expect, it } from 'vitest';
import { clampState, cropRect, initialState, pan, zoomAt } from './avatarCrop.ts';

describe('avatarCrop', () => {
  it('縮放 1 倍：短邊填滿、置中', () => {
    expect(cropRect(4000, 3000, initialState(4000, 3000))).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
    expect(cropRect(3000, 4000, initialState(3000, 4000))).toEqual({ x: 0, y: 500, width: 3000, height: 3000 });
  });

  it('縮放 2 倍：範圍剩一半', () => {
    const s = zoomAt(3000, 3000, initialState(3000, 3000), 300, 2);
    expect(cropRect(3000, 3000, s)).toEqual({ x: 750, y: 750, width: 1500, height: 1500 });
  });

  it('縮放不超出上下限', () => {
    expect(clampState(3000, 3000, { cx: 0, cy: 0, zoom: 99 }).zoom).toBe(5);
    expect(clampState(3000, 3000, { cx: 0, cy: 0, zoom: 0.2 }).zoom).toBe(1);
  });

  it('拖曳不會超出照片邊界', () => {
    const s = pan(4000, 3000, initialState(4000, 3000), 300, 100000, 100000);
    expect(cropRect(4000, 3000, s)).toEqual({ x: 0, y: 0, width: 3000, height: 3000 });
    const t = pan(4000, 3000, initialState(4000, 3000), 300, -100000, -100000);
    expect(cropRect(4000, 3000, t)).toEqual({ x: 1000, y: 0, width: 3000, height: 3000 });
  });

  it('往右拖，圓框對到照片的左側（照片跟著手指走）', () => {
    const z = zoomAt(3000, 3000, initialState(3000, 3000), 300, 2);
    const moved = pan(3000, 3000, z, 300, 30, 0);
    expect(moved.cx).toBeLessThan(z.cx);
  });

  it('以圓框邊緣為不動點縮放：該點對到的照片位置不變', () => {
    const s0 = initialState(3000, 3000);
    const frame = 300;
    const anchor = 100;
    const photoX = (s: typeof s0) => s.cx + (anchor * Math.min(3000, 3000)) / s.zoom / frame;
    const s1 = zoomAt(3000, 3000, s0, frame, 2, anchor, 0);
    expect(photoX(s1)).toBeCloseTo(photoX(s0), 5);
  });

  it('小圖也不會產生超出照片的範圍', () => {
    const r = cropRect(200, 120, { cx: 9999, cy: 9999, zoom: 1 });
    expect(r).toEqual({ x: 80, y: 0, width: 120, height: 120 });
  });
});
