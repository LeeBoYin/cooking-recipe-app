import { describe, expect, it } from 'vitest';
import { barPosition, isLastStep, nextStepId } from './steps.ts';

describe('nextStepId', () => {
  it('從頭開始時跳過已完成的步驟', () => {
    expect(nextStepId(null, [], false)).toBe('vision');
    expect(nextStepId(null, ['vision', 'install'], false)).toBe('diet');
    expect(nextStepId(null, ['vision', 'install', 'diet'], false)).toBe('taste');
    expect(nextStepId(null, ['vision', 'install', 'diet', 'taste', 'kitchen'], false)).toBe('stock');
  });
  it('做完一步後接著下一個還沒做的', () => {
    expect(nextStepId('vision', ['vision', 'diet'], false)).toBe('install');
    expect(nextStepId('install', ['vision', 'install', 'diet'], false)).toBe('taste');
    expect(nextStepId('taste', ['vision', 'install', 'diet', 'taste'], false)).toBe('kitchen');
    expect(nextStepId('stock', ['stock'], false)).toBe('done');
  });
  it('全部走完回傳 null', () => {
    const all = ['vision', 'install', 'diet', 'taste', 'kitchen', 'stock', 'done'];
    expect(nextStepId('done', all, false)).toBeNull();
    expect(nextStepId(null, all, false)).toBeNull();
  });
  it('重跑一次不跳過任何步驟', () => {
    const all = ['vision', 'install', 'diet', 'taste', 'kitchen', 'stock', 'done'];
    expect(nextStepId(null, all, true)).toBe('vision');
    expect(nextStepId('install', all, true)).toBe('diet');
  });
});

describe('進度條與最後一步', () => {
  it('願景卡與安裝沒有進度條', () => {
    expect(barPosition('vision')).toBeNull();
    expect(barPosition('diet')).toEqual([1, 4]);
    expect(barPosition('taste')).toEqual([2, 4]);
    expect(barPosition('kitchen')).toEqual([3, 4]);
    expect(barPosition('stock')).toEqual([4, 4]);
    expect(barPosition('done')).toBeNull();
  });
  it('最後一步是收尾', () => {
    expect(isLastStep('done')).toBe(true);
    expect(isLastStep('stock')).toBe(false);
  });
});
