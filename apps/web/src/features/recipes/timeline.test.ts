import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../data/recipes.ts';
import type { RecipePhotoLite } from '../../data/photos.ts';
import { buildTimeline, daysLeft, groupByMonth, localDate } from './timeline.ts';

const recipe = (over: Partial<Recipe>): Recipe =>
  ({
    id: 'r',
    title: '紅燒肉',
    story: '好吃',
    highlights: [],
    cook_notes: [],
    cooked_on: null,
    published_at: '2026-11-18T10:00:00Z',
    created_at: '2026-11-18T09:00:00Z',
    ...over,
  }) as Recipe;
const photo = (id: string, owner: string, note: string | null = null, order = 0): RecipePhotoLite => ({
  id,
  owner_id: owner,
  cook_note_id: note,
  thumb_path: `t/${id}`,
  sort_order: order,
});

describe('localDate', () => {
  it('依時區算日期', () => {
    expect(localDate('2026-11-18T18:00:00Z', 'Asia/Taipei')).toBe('2026-11-19');
    expect(localDate('2026-11-18T18:00:00Z', 'UTC')).toBe('2026-11-18');
  });
});

describe('buildTimeline', () => {
  it('依記錄日期由新到舊；沒有料理時間就用發佈的日子', () => {
    const list = buildTimeline(
      [recipe({ id: 'a', cooked_on: '2026-10-29' }), recipe({ id: 'b' }), recipe({ id: 'c', cooked_on: '2026-11-20' })],
      [],
      'UTC',
    );
    expect(list.map((e) => [e.recipeId, e.date])).toEqual([
      ['c', '2026-11-20'],
      ['b', '2026-11-18'],
      ['a', '2026-10-29'],
    ]);
  });
  it('封面是第一張、張數不含又做了一次', () => {
    const [e] = buildTimeline(
      [recipe({ id: 'a' })],
      [photo('p2', 'a', null, 1), photo('p1', 'a', null, 0), photo('n1', 'a', 'note')],
      'UTC',
    );
    expect(e?.photoCount).toBe(2);
    expect(e?.thumbPath).toBe('t/p1');
  });
  it('「又做了一次」的日子各出一張卡，用那次的照片與一句話', () => {
    const list = buildTimeline(
      [recipe({ id: 'a', cooked_on: '2026-10-01', cook_notes: [{ id: 'n1', cooked_on: '2026-11-15', text: '少放糖' }] as never })],
      [photo('p1', 'a'), photo('n1p', 'a', 'n1')],
      'UTC',
    );
    expect(list.map((e) => [e.kind, e.date, e.text, e.thumbPath])).toEqual([
      ['cook_note', '2026-11-15', '少放糖', 't/n1p'],
      ['recipe', '2026-10-01', '好吃', 't/p1'],
    ]);
  });
  it('貼紙最多兩個，不認得的代碼略過', () => {
    const [e] = buildTimeline([recipe({ highlights: ['improved', 'new_thing', 'festive', 'make_again'] })], [], 'UTC');
    expect(e?.highlights).toEqual(['improved', 'festive']);
  });
});

describe('groupByMonth', () => {
  const entries = buildTimeline(
    [
      recipe({ id: 'a', cooked_on: '2026-11-18' }),
      recipe({ id: 'b', cooked_on: '2026-11-02' }),
      recipe({ id: 'c', cooked_on: '2026-10-29' }),
      recipe({ id: 'd', cooked_on: '2025-12-24' }),
    ],
    [],
    'UTC',
  );
  it('同一個月放在一起、依月分組', () => {
    const groups = groupByMonth(entries, '2026-11-20');
    expect(groups.map((g) => [g.key, g.entries.length])).toEqual([
      ['2026-11', 2],
      ['2026-10', 1],
      ['2025-12', 1],
    ]);
  });
  it('不是今年的才寫年', () => {
    expect(groupByMonth(entries, '2026-11-20').map((g) => g.showYear)).toEqual([false, false, true]);
  });
  it('沒有資料就沒有分組', () => {
    expect(groupByMonth([], '2026-11-20')).toEqual([]);
  });
});

describe('daysLeft', () => {
  it('依刪除時間與保留天數算還剩幾天', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    expect(daysLeft('2026-11-17T00:00:00Z', 30, now)).toBe(27);
    expect(daysLeft('2026-10-01T00:00:00Z', 30, now)).toBe(0);
  });
});
