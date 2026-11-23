import { describe, expect, it } from 'vitest';
import { refineChanges, type RawRefine } from '@zhusha/core';
import { applyChanges, describeChange, refineCurrentOf } from './refine.ts';
import { emptyForm, type EditorForm } from './model.ts';

const photo = { id: 'p1', width: 1, height: 1 };
const form = (over: Partial<EditorForm> = {}): EditorForm => ({ ...emptyForm(), ...over });
const NONE: RawRefine = { fields: [], ingredients: [], steps: [] };
const base = form({
  title: '炒飯',
  tips: '先放涼',
  ingredients: [{ id: 'i1', text: '蛋 2 顆' }, { id: 'i0', text: ' ' }, { id: 'i2', text: '蒜頭 3 瓣' }, { id: 'i3', text: '蔥花' }],
  steps: [{ id: 's1', text: '炒蛋' }, { id: 's2', text: '', photo }, { id: 's3', text: '加蒜頭' }, { id: 's4', text: '起鍋' }],
});

describe('refineCurrentOf', () => {
  it('空白列略過、文字去頭尾空白（編號就是略過之後的位置）', () => {
    expect(refineCurrentOf(base)).toEqual({ title: '炒飯', story: '', tips: '先放涼', ingredients: ['蛋 2 顆', '蒜頭 3 瓣', '蔥花'], steps: ['炒蛋', '加蒜頭', '起鍋'] });
  });
});

describe('applyChanges', () => {
  const run = (raw: RawRefine) => applyChanges(base, refineChanges(refineCurrentOf(base), raw));

  it('改欄位；食材拿掉、改字（標「新的」）、新增（標「新的」），沒說到的列原樣', () => {
    const r = run({
      fields: [{ field: 'title', value: '蒜香炒飯' }, { field: 'tips', value: '' }],
      ingredients: [{ op: 'remove', index: 2, text: '' }, { op: 'replace', index: 1, text: '蛋 3 顆' }, { op: 'add', index: 3, text: '白胡椒 適量' }],
      steps: [],
    });
    expect(r.count).toBe(5);
    expect(r.form.title).toBe('蒜香炒飯');
    expect(r.form.tips).toBe('');
    expect(r.form.ingredients.map((i) => [i.id, i.text, i.isNew ?? false])).toEqual([
      ['i1', '蛋 3 顆', true],
      ['i3', '蔥花', false],
      [expect.any(String), '白胡椒 適量', true],
    ]);
    expect(r.form.steps).toBe(base.steps);
  });

  it('步驟：只有照片的步驟留在原位；新增放在指定那一步後面、最前面也可以', () => {
    const r = run({
      ...NONE,
      steps: [{ op: 'replace', index: 2, text: '加蒜頭，炒香' }, { op: 'add', index: 0, text: '先備料' }, { op: 'add', index: 1, text: '盛起' }],
    });
    expect(r.form.steps.map((s) => s.text)).toEqual(['先備料', '炒蛋', '盛起', '', '加蒜頭，炒香', '起鍋']);
    expect(r.form.steps.find((s) => s.id === 's2')?.photo).toEqual(photo);
    expect(r.form.steps.filter((s) => s.isNew).map((s) => s.text)).toEqual(['先備料', '盛起', '加蒜頭，炒香']);
  });

  it('拿掉有照片的步驟：照片留成只有照片的步驟', () => {
    const f = form({ steps: [{ id: 's1', text: '炒蛋', photo }, { id: 's2', text: '起鍋' }] });
    const r = applyChanges(f, refineChanges(refineCurrentOf(f), { ...NONE, steps: [{ op: 'remove', index: 1, text: '' }] }));
    expect(r.form.steps.map((s) => [s.text, !!s.photo])).toEqual([['', true], ['起鍋', false]]);
  });

  it('沒有變更：表單原樣', () => {
    expect(applyChanges(base, []).form).toEqual(base);
  });
});

describe('describeChange', () => {
  it('依種類整理成畫面用的內容', () => {
    expect(describeChange({ kind: 'ingredient', op: 'remove', index: 0, from: '蒜頭' })).toEqual({ kind: 'ingredient', op: 'remove', from: '蒜頭' });
    expect(describeChange({ kind: 'field', field: 'title', from: 'a', to: 'b' })).toEqual({ kind: 'field', op: 'field', field: 'title', from: 'a', to: 'b' });
  });
});
