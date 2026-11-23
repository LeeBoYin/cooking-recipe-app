import { describe, expect, it } from 'vitest';
import { refineChanges, type RawRefine, type RefineCurrent } from './refine.ts';

const CUR: RefineCurrent = {
  title: 'XO 醬炒飯',
  story: '很香',
  tips: '',
  ingredients: ['飯 2 碗', '蒜頭 3 瓣', 'XO 醬 1 大匙'],
  steps: ['蒜頭爆香。', '加飯炒散。', '加 XO 醬拌炒。'],
};
const NONE: RawRefine = { fields: [], ingredients: [], steps: [] };

describe('refineChanges', () => {
  it('沒有要改的就是空清單', () => {
    expect(refineChanges(CUR, NONE)).toEqual([]);
  });

  it('食材：拿掉、改字、新增；編號從 1 起算、回傳 0 起算', () => {
    const r = refineChanges(CUR, {
      ...NONE,
      ingredients: [
        { op: 'remove', index: 2, text: '' },
        { op: 'replace', index: 3, text: 'XO 醬 2 大匙' },
        { op: 'add', index: 0, text: '蔥花 適量' },
      ],
    });
    expect(r).toEqual([
      { kind: 'ingredient', op: 'remove', index: 1, from: '蒜頭 3 瓣' },
      { kind: 'ingredient', op: 'replace', index: 2, from: 'XO 醬 1 大匙', to: 'XO 醬 2 大匙' },
      { kind: 'ingredient', op: 'add', after: -1, to: '蔥花 適量' },
    ]);
  });

  it('欄位：標題、心得、料理筆記；改成一樣的、標題清空都丟掉；心得可以清空', () => {
    const r = refineChanges(CUR, {
      ...NONE,
      fields: [
        { field: 'title', value: ' 蒜香 XO 炒飯 ' },
        { field: 'story', value: '' },
        { field: 'tips', value: '' },
        { field: 'title', value: '第二個標題' },
        { field: 'bogus', value: 'x' },
      ],
    });
    expect(r).toEqual([
      { kind: 'field', field: 'title', from: 'XO 醬炒飯', to: '蒜香 XO 炒飯' },
      { kind: 'field', field: 'story', from: '很香', to: '' },
    ]);
    expect(refineChanges(CUR, { ...NONE, fields: [{ field: 'title', value: '' }] })).toEqual([]);
  });

  it('編號對不上、同一項重複改、改成一樣的字、空的新增都丟掉', () => {
    const r = refineChanges(CUR, {
      ...NONE,
      steps: [
        { op: 'replace', index: 9, text: '亂寫' },
        { op: 'remove', index: 0, text: '' },
        { op: 'add', index: 9, text: '亂寫' },
        { op: 'replace', index: 1, text: '蒜頭爆香。' },
        { op: 'add', index: 1, text: '  ' },
        { op: 'replace', index: 2, text: '先把飯炒到乾。' },
        { op: 'remove', index: 2, text: '' },
        { op: 'nope', index: 1, text: 'x' },
      ],
    });
    expect(r).toEqual([{ kind: 'step', op: 'replace', index: 1, from: '加飯炒散。', to: '先把飯炒到乾。' }]);
  });

  it('上限：步驟最多 10 步、單項不超過長度、一次最多 30 處', () => {
    const ten: RefineCurrent = { ...CUR, steps: Array.from({ length: 10 }, (_, i) => `步驟${i}`) };
    expect(refineChanges(ten, { ...NONE, steps: [{ op: 'add', index: 10, text: '第十一步' }] })).toEqual([]);
    expect(refineChanges(ten, { ...NONE, steps: [{ op: 'remove', index: 1, text: '' }, { op: 'add', index: 10, text: '補上' }] })).toHaveLength(2);
    expect(refineChanges(CUR, { ...NONE, steps: [{ op: 'replace', index: 1, text: '長'.repeat(501) }] })).toEqual([]);
    const many: RefineCurrent = { ...CUR, ingredients: Array.from({ length: 40 }, (_, i) => `食材${i}`) };
    const ops = Array.from({ length: 40 }, (_, i) => ({ op: 'replace', index: i + 1, text: `新${i}` }));
    expect(refineChanges(many, { ...NONE, ingredients: ops })).toHaveLength(30);
  });
});
