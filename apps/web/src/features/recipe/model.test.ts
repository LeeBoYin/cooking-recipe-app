import { describe, expect, it } from 'vitest';
import {
  buildPatch,
  emptyForm,
  hasContent,
  isBlank,
  knownHighlights,
  overBy,
  overLimit,
  photosChanged,
  toPhotoInputs,
  type EditorForm,
  type EditorPhoto,
} from './model.ts';

const photo = (id: string): EditorPhoto => ({ id, width: 1200, height: 900 });
const base = (): EditorForm => ({ ...emptyForm(), title: '紅燒肉' });

describe('knownHighlights', () => {
  it('不認得的代碼略過、不報錯', () => {
    expect(knownHighlights(['improved', 'something_new', 'festive'])).toEqual(['improved', 'festive']);
    expect(knownHighlights(null)).toEqual([]);
  });
});

describe('overBy', () => {
  it('用字元數算，中文與表情符號都算一個字', () => {
    expect(overBy('一二三四五', 3)).toBe(2);
    expect(overBy('😋😋', 2)).toBe(0);
    expect(overBy('', 80)).toBe(0);
  });
});

describe('buildPatch', () => {
  it('沒改就是空的', () => {
    expect(buildPatch(base(), base())).toEqual({});
  });
  it('只送有改的欄位', () => {
    const current = { ...base(), story: '阿嬤的味道', highlights: ['improved' as const] };
    expect(buildPatch(base(), current)).toEqual({ story: '阿嬤的味道', highlights: ['improved'] });
  });
  it('清空的文字送 null', () => {
    expect(buildPatch(base(), { ...base(), title: '  ' })).toEqual({ title: null });
  });
  it('步驟依順序編號，空白的食材不送', () => {
    const current = {
      ...base(),
      steps: [
        { id: 's1', text: '燙過' },
        { id: 's2', text: '' },
      ],
      ingredients: [
        { id: 'i1', text: ' 五花肉 600 克 ' },
        { id: 'i2', text: '' },
      ],
    };
    const patch = buildPatch(base(), current);
    expect(patch.steps).toEqual([
      { id: 's1', order: 0, text: '燙過' },
      { id: 's2', order: 1, text: '' },
    ]);
    expect(patch.ingredients).toEqual([{ id: 'i1', raw_text: '五花肉 600 克', optional: false }]);
  });
  it('難易度由作者設定', () => {
    const d = { ingredients: 2, equipment: 1, time: 4, technique: 2, failure_risk: 3 };
    expect(buildPatch(base(), { ...base(), difficulty: d }).difficulty).toEqual({ ...d, source: 'author' });
  });
});

describe('照片清單', () => {
  const form = (): EditorForm => ({
    ...base(),
    photos: [photo('a'), photo('b')],
    steps: [{ id: 's1', text: '', photo: photo('c') }, { id: 's2', text: '' }],
  });
  const all = () => true;

  it('上方照片依序，接著是步驟照片', () => {
    expect(toPhotoInputs(form(), all).map((p) => [p.id, p.owner_type, p.owner_id])).toEqual([
      ['a', 'recipe', undefined],
      ['b', 'recipe', undefined],
      ['c', 'recipe_step', 's1'],
    ]);
  });
  it('還沒傳完的先不放', () => {
    expect(toPhotoInputs(form(), (id) => id !== 'b').map((p) => p.id)).toEqual(['a', 'c']);
  });
  it('調換順序、移除都算有改', () => {
    const saved = form();
    expect(photosChanged(saved, form(), all)).toBe(false);
    expect(photosChanged(saved, { ...form(), photos: [photo('b'), photo('a')] }, all)).toBe(true);
    expect(photosChanged(saved, { ...form(), photos: [photo('a')] }, all)).toBe(true);
  });
  it('剛選、還沒傳完的照片不算有改', () => {
    const current = { ...form(), photos: [...form().photos, photo('new')] };
    expect(photosChanged(form(), current, (id) => id !== 'new')).toBe(false);
    expect(photosChanged(form(), current, all)).toBe(true);
  });
});

describe('發佈與空白判斷', () => {
  it('有標題或有照片就能發佈', () => {
    expect(hasContent(emptyForm())).toBe(false);
    expect(hasContent({ ...emptyForm(), title: '番茄炒蛋' })).toBe(true);
    expect(hasContent({ ...emptyForm(), photos: [photo('a')] })).toBe(true);
    expect(hasContent({ ...emptyForm(), steps: [{ id: 's', text: '', photo: photo('a') }] })).toBe(true);
  });
  it('什麼都沒寫不留空草稿', () => {
    expect(isBlank(emptyForm())).toBe(true);
    expect(isBlank({ ...emptyForm(), steps: [{ id: 's', text: '' }] })).toBe(true);
    expect(isBlank({ ...emptyForm(), tips: '小心燙' })).toBe(false);
  });
  it('字太多', () => {
    expect(overLimit(base())).toBeNull();
    expect(overLimit({ ...base(), title: 'a'.repeat(86) })).toEqual({ field: 'title', over: 6 });
  });
});
