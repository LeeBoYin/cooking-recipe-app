import { describe, expect, it } from 'vitest';
import { barPosition, isLastStep, nextStepId } from './steps.ts';

describe('nextStepId', () => {
  it('從頭開始時跳過已完成的步驟', () => {
    expect(nextStepId(null, [], false)).toBe('vision');
    expect(nextStepId(null, ['vision', 'install'], false)).toBe('diet');
    expect(nextStepId(null, ['vision', 'install', 'diet'], false)).toBe('taste');
  });
  it('做完一步後接著下一個還沒做的', () => {
    expect(nextStepId('vision', ['vision', 'diet'], false)).toBe('install');
    expect(nextStepId('install', ['vision', 'install', 'diet'], false)).toBe('taste');
  });
  it('全部走完回傳 null', () => {
    expect(nextStepId('taste', ['vision', 'install', 'diet', 'taste'], false)).toBeNull();
    expect(nextStepId(null, ['vision', 'install', 'diet', 'taste'], false)).toBeNull();
  });
  it('重跑一次不跳過任何步驟', () => {
    expect(nextStepId(null, ['vision', 'install', 'diet', 'taste'], true)).toBe('vision');
    expect(nextStepId('install', ['vision', 'install', 'diet', 'taste'], true)).toBe('diet');
  });
});

describe('進度條與最後一步', () => {
  it('願景卡與安裝沒有進度條', () => {
    expect(barPosition('vision')).toBeNull();
    expect(barPosition('diet')).toEqual([1, 2]);
    expect(barPosition('taste')).toEqual([2, 2]);
  });
  it('最後一步是口味探索', () => {
    expect(isLastStep('taste')).toBe(true);
    expect(isLastStep('diet')).toBe(false);
  });
});
