import { describe, expect, it } from 'vitest';
import { decideTransition, systemBackAnimates, type TransitionInput } from './pageTransition.ts';

const base: TransitionInput = {
  action: 'PUSH',
  prevIdx: 1,
  nextIdx: 2,
  prevInner: false,
  nextInner: true,
  marked: false,
  systemBackAnimates: false,
};
const t = (o: Partial<TransitionInput>) => decideTransition({ ...base, ...o });

describe('decideTransition', () => {
  it('進入下層頁往右滑入，下層再進下層也是', () => {
    expect(t({})).toBe('forward');
    expect(t({ prevInner: true })).toBe('forward');
  });
  it('主要畫面之間與 replace 不播', () => {
    expect(t({ nextInner: false })).toBeNull();
    expect(t({ action: 'REPLACE' })).toBeNull();
  });
  it('離開下層頁往右滑出', () => {
    expect(t({ action: 'POP', prevIdx: 2, nextIdx: 1, prevInner: true, nextInner: false, marked: true })).toBe('back');
    expect(t({ action: 'POP', prevIdx: 2, nextIdx: 1, prevInner: true, nextInner: true })).toBe('back');
  });
  it('主要畫面之間的上一頁不播', () => {
    expect(t({ action: 'POP', prevIdx: 2, nextIdx: 1, prevInner: false, nextInner: false })).toBeNull();
  });
  it('Safari 瀏覽器裡沒記號的 POP 不播，有記號的才播', () => {
    const pop = { action: 'POP' as const, prevIdx: 2, nextIdx: 1, prevInner: true, nextInner: false, systemBackAnimates: true };
    expect(t(pop)).toBeNull();
    expect(t({ ...pop, marked: true })).toBe('back');
  });
  it('瀏覽器的下一頁進下層頁是進入', () => {
    expect(t({ action: 'POP', prevIdx: 1, nextIdx: 2 })).toBe('forward');
  });
});

describe('systemBackAnimates', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
  it('iOS 與 Safari 有，standalone 與 Chrome 沒有', () => {
    expect(systemBackAnimates(iphone, false)).toBe(true);
    expect(systemBackAnimates(safari, false)).toBe(true);
    expect(systemBackAnimates(iphone, true)).toBe(false);
    expect(systemBackAnimates(chrome, false)).toBe(false);
  });
});
