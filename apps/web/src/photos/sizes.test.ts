import { describe, expect, it } from 'vitest';
import { ASPECT, centerCrop, fitLongEdge } from './sizes.ts';

describe('centerCrop', () => {
  it('直式照片裁成正方形：取中間', () => {
    expect(centerCrop(3000, 4000, ASPECT.square)).toEqual({ x: 0, y: 500, width: 3000, height: 3000 });
  });
  it('橫式照片裁成正方形：取中間', () => {
    expect(centerCrop(4000, 3000, ASPECT.square)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
  });
  it('已經是目標比例就不裁', () => {
    expect(centerCrop(800, 1000, ASPECT.portrait)).toEqual({ x: 0, y: 0, width: 800, height: 1000 });
  });
  it('橫式 5:4 取最大範圍', () => {
    const c = centerCrop(1000, 1000, ASPECT.landscape);
    expect(c).toEqual({ x: 0, y: 100, width: 1000, height: 800 });
  });
});

describe('fitLongEdge', () => {
  it('長邊縮到上限，維持比例', () => {
    expect(fitLongEdge(3000, 2000, 1500)).toEqual({ width: 1500, height: 1000 });
  });
  it('不夠大就不放大', () => {
    expect(fitLongEdge(300, 200, 1600)).toEqual({ width: 300, height: 200 });
  });
});
