import { describe, expect, it } from 'vitest';
import type { RevisionSnapshot } from '../../data/recipeRevisions.ts';
import { lineDiff, revisionChanges } from './revisionDiff.ts';

const snap = (over: Partial<RevisionSnapshot> = {}): RevisionSnapshot => ({
  title: '紅燒肉',
  servings: 2,
  ingredients: [],
  steps: [],
  tips: null,
  ...over,
});

describe('lineDiff', () => {
  it('找出新增與拿掉的行', () => {
    expect(lineDiff(['蒜頭', '醬油'], ['醬油', '冰糖'])).toEqual({ added: ['冰糖'], removed: ['蒜頭'] });
  });
  it('重複的行照次數算', () => {
    expect(lineDiff(['鹽'], ['鹽', '鹽'])).toEqual({ added: ['鹽'], removed: [] });
  });
});

describe('revisionChanges', () => {
  it('份量、筆記、步驟的差異', () => {
    const a = snap({ steps: [{ id: 's1', order: 0, text: '先燙過' } as never] });
    const b = snap({ servings: 3, tips: '小火', steps: [{ id: 's1', order: 0, text: '直接炒' } as never] });
    const c = revisionChanges(a, b);
    expect(c.servings).toBe(true);
    expect(c.tips).toBe(true);
    expect(c.title).toBe(false);
    expect(c.steps).toEqual({ added: ['直接炒'], removed: ['先燙過'] });
  });
});
