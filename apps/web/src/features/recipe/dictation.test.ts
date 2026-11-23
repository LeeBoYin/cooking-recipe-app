import { describe, expect, it } from 'vitest';
import type { DictationResult } from '@zhusha/core';
import { applyResult, currentOf, hasRawDictation, withRawDictation } from './dictation.ts';
import { edited, emptyForm, type EditorForm } from './model.ts';

const photo = { id: 'p1', width: 1, height: 1 };
const form = (over: Partial<EditorForm> = {}): EditorForm => ({ ...emptyForm(), ...over });
const result = (over: Partial<DictationResult> = {}): DictationResult => ({
  title: '', story: '', tips: '', ingredients: [], steps: [], highlights: [], difficulty: null, ...over,
});

describe('currentOf', () => {
  it('空白列略過、文字去頭尾空白、難易度來源帶出去', () => {
    const f = form({
      title: ' 炒蛋 ',
      ingredients: [{ id: 'i1', text: '蛋 2 顆 ' }, { id: 'i2', text: ' ' }],
      steps: [{ id: 's1', text: '炒' }, { id: 's2', text: '', photo }],
      difficulty: { values: { ingredients: 1, equipment: 1, time: 1, technique: 1, failure_risk: 1 }, source: 'author' },
    });
    expect(currentOf(f, null)).toEqual({ title: '炒蛋', story: '', tips: '', ingredients: ['蛋 2 顆'], steps: ['炒'], highlights: [], difficultySource: 'author' });
  });
  it('心得裡留著的原話不算作者寫的', () => {
    const f = withRawDictation(form({ story: '很累。' }), '培根先煎', null);
    expect(currentOf(f, '培根先煎').story).toBe('很累。');
    expect(hasRawDictation(f, '培根先煎')).toBe(true);
    expect(hasRawDictation(form({ story: '自己寫的' }), '培根先煎')).toBe(false);
  });
});

describe('applyResult', () => {
  it('空白欄位直接填；新的食材與步驟標「新的」', () => {
    const { form: next, fieldCount } = applyResult(
      form(),
      result({ title: '培根高麗菜', story: '很下飯。', tips: '很鹹', ingredients: [{ text: '培根 4 片', from: null }], steps: [{ text: '煎', from: null }], highlights: ['make_again'], difficulty: { ingredients: 1, equipment: 1, time: 1, technique: 2, failure_risk: 1 } }),
      null,
    );
    expect([next.title, next.story, next.tips]).toEqual(['培根高麗菜', '很下飯。', '很鹹']);
    expect(next.ingredients.map((i) => [i.text, i.isNew])).toEqual([['培根 4 片', true]]);
    expect(next.steps.map((s) => [s.text, s.isNew])).toEqual([['煎', true]]);
    expect(next.highlights).toEqual(['make_again']);
    expect(next.difficulty).toEqual({ values: { ingredients: 1, equipment: 1, time: 1, technique: 2, failure_risk: 1 }, source: 'ai', estimatedFrom: 'recipe' });
    expect(fieldCount).toBe(7);
  });
  it('作者填的項目保留原本的 id 與照片，新的插在對的位置', () => {
    const f = form({
      title: '我的菜',
      ingredients: [{ id: 'i1', text: '蛋' }, { id: 'i2', text: '' }],
      steps: [{ id: 's1', text: '洗', photo }, { id: 's2', text: '炒' }],
    });
    const { form: next } = applyResult(
      f,
      result({ title: '我的菜', ingredients: [{ text: '蛋', from: 0 }, { text: '蒜', from: null }], steps: [{ text: '洗', from: 0 }, { text: '爆香', from: null }, { text: '炒', from: 1 }] }),
      null,
    );
    expect(next.title).toBe('我的菜');
    expect(next.ingredients.map((i) => [i.id, i.text, i.isNew ?? false])).toEqual([['i1', '蛋', false], [expect.any(String), '蒜', true]]);
    expect(next.steps.map((s) => [s.text, s.isNew ?? false, s.photo?.id])).toEqual([['洗', false, 'p1'], ['爆香', true, undefined], ['炒', false, undefined]]);
  });
  it('沒有文字但有照片的步驟留在原本的位置，空白的拿掉', () => {
    const f = form({ steps: [{ id: 's0', text: '', photo }, { id: 's1', text: '炒' }, { id: 's2', text: '' }] });
    const { form: next } = applyResult(f, result({ steps: [{ text: '炒', from: 0 }, { text: '盛盤', from: null }] }), null);
    expect(next.steps.map((s) => s.text)).toEqual(['', '炒', '盛盤']);
    expect(next.steps[0]?.photo?.id).toBe('p1');
  });
  it('作者動過難易度就不蓋掉；已經有的值得記住也不動', () => {
    const f = form({
      highlights: ['festive'],
      difficulty: { values: { ingredients: 5, equipment: 5, time: 5, technique: 5, failure_risk: 5 }, source: 'author' },
    });
    const { form: next, fieldCount } = applyResult(f, result({ highlights: ['make_again'], difficulty: { ingredients: 1, equipment: 1, time: 1, technique: 1, failure_risk: 1 } }), null);
    expect(next.difficulty?.source).toBe('author');
    expect(next.difficulty?.values.time).toBe(5);
    expect(next.highlights).toEqual(['festive']);
    expect(fieldCount).toBe(0);
  });
  it('只有標題與心得時，AI 估的難易度標「從文字估的」', () => {
    const { form: next } = applyResult(form(), result({ story: '很開心', difficulty: { ingredients: 2, equipment: 2, time: 2, technique: 2, failure_risk: 2 } }), null);
    expect(next.difficulty?.estimatedFrom).toBe('text');
  });
  it('「讓大廚整理」：心得裡的原話換成整理好的心得，作者自己寫的部分留著', () => {
    const raw = withRawDictation(form({ story: '下班很累。' }), '培根先煎', null);
    const { form: next } = applyResult(raw, result({ story: '下班很累。' }), '培根先煎');
    expect(next.story).toBe('下班很累。');
    const rawOnly = withRawDictation(form(), '培根先煎', null);
    expect(applyResult(rawOnly, result({ story: '培根先煎。' }), '培根先煎').form.story).toBe('培根先煎。');
    expect(applyResult(rawOnly, result(), '培根先煎').form.story).toBe('');
  });
});

describe('withRawDictation', () => {
  it('再說一次：先拿掉上一段還沒整理的原話，再放新的', () => {
    const once = withRawDictation(form({ story: '心得' }), '第一段', null);
    const twice = withRawDictation(once, '第二段', '第一段');
    expect(twice.story).toBe('心得\n\n第二段');
  });
});

describe('edited', () => {
  it('編輯過「新的」標記就消失', () => {
    expect(edited({ id: 'a', text: 'x', isNew: true }, { text: 'y' })).toEqual({ id: 'a', text: 'y' });
  });
});
