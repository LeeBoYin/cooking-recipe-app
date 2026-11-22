import { describe, expect, it } from 'vitest';
import type { IdeaIngredient } from '../ideas/types.ts';
import { CHAT_SIGNAL_WEIGHT, COOKED_WEIGHT, SAVED_WEIGHT, computeTasteProfile, fromSnapshotData, toSnapshotData, type ChatSignal, type SavedIdeaSignal, type TasteInputs } from './learn.ts';
import { emptyProfile, type DimensionState, type TasteProfile } from './types.ts';

const NOW = '2026-11-22T00:00:00.000Z';
const ing = (id: string, over: Partial<IdeaIngredient> = {}): IdeaIngredient => ({ id, category: 'vegetable', traits: [], allergenIds: [], ...over });
const ingredients = new Map<string, IdeaIngredient>(
  [
    ing('pork', { category: 'meat', traits: ['animal', 'meat', 'pork'] }),
    ing('tofu', { category: 'tofu-bean' }),
    ing('chili', { flavorTags: ['spicy'] }),
  ].map((i) => [i.id, i]),
);
const dimensionKeys = new Set(['cuisine.taiwan', 'cuisine.taiwan.home', 'protein.pork', 'protein.tofu_soy', 'taste.spicy', 'ingredient.chili', 'ingredient.pork', 'ingredient.tofu', 'form.stir_fry']);

const dim = (affinity: number, confidence: number, source: DimensionState['source'] = 'explored', updatedAt = '2026-01-01T00:00:00Z'): DimensionState => ({ affinity, confidence, source, updatedAt });
const profile = (dims: Record<string, DimensionState>): TasteProfile => ({ ...emptyProfile(), dims });
const porkDish = (at: string, cooked = false): SavedIdeaSignal => ({
  dish: { cuisineKeys: ['cuisine.taiwan.home'], ingredientIds: ['pork'], techniques: ['stir-fry'] }, at, cooked,
});
const run = (over: Partial<TasteInputs> = {}) =>
  computeTasteProfile({ base: emptyProfile(), saved: [], chatSignals: [], pantryIngredientIds: [], ingredients, dimensionKeys, now: NOW, ...over });
const sig = (over: Partial<ChatSignal> = {}): ChatSignal => ({ conversation: 'c1', dimensionKey: 'taste.spicy', affinity: -0.6, scope: 'long_term', at: NOW, ...over });

describe('computeTasteProfile', () => {
  it('沒有任何來源：維持口味地圖原樣，來源計數為 0', () => {
    const base = profile({ 'taste.spicy': dim(0.7, 0.6) });
    const out = run({ base });
    expect(out.dims).toEqual(base.dims);
    expect(out.context).toEqual(base.context);
    expect(out.sources).toEqual({ quiz: true, saved: 0, cooked: 0, signals: 0, pantry: 0 });
  });

  it('沒有探索過：quiz 是 false', () => {
    expect(run().sources.quiz).toBe(false);
  });

  it('收藏的點子：菜系、蛋白質、手法的維度加分，來源是 learned', () => {
    const out = run({ saved: [porkDish(NOW)] });
    for (const key of ['cuisine.taiwan.home', 'cuisine.taiwan', 'protein.pork', 'form.stir_fry']) {
      expect(out.dims[key]?.affinity).toBeGreaterThan(0);
      expect(out.dims[key]?.source).toBe('learned');
    }
    expect(out.sources.saved).toBe(1);
  });

  it('一次收藏的把握程度不夠（還沒到 0.5），要多筆才會累積', () => {
    const one = run({ saved: [porkDish(NOW)] });
    expect(one.dims['protein.pork']!.confidence).toBeCloseTo(0.5 * SAVED_WEIGHT, 5);
    expect(one.dims['protein.pork']!.confidence).toBeLessThan(0.5);
    const five = run({ saved: Array.from({ length: 5 }, () => porkDish(NOW)) });
    expect(five.dims['protein.pork']!.confidence).toBeGreaterThan(0.5);
  });

  it('「做了」比收藏的權重高', () => {
    const saved = run({ saved: [porkDish(NOW)] });
    const cooked = run({ saved: [porkDish(NOW, true)] });
    expect(COOKED_WEIGHT).toBeGreaterThan(SAVED_WEIGHT);
    expect(cooked.dims['protein.pork']!.confidence).toBeGreaterThan(saved.dims['protein.pork']!.confidence);
  });

  it('同一個點子只算一次：做了的不會再當收藏算一次', () => {
    const once = run({ saved: [porkDish(NOW, true)] });
    expect(once.sources).toMatchObject({ saved: 0, cooked: 1 });
    expect(once.dims['protein.pork']!.confidence).toBeCloseTo(0.5 * COOKED_WEIGHT, 5);
  });

  it('你設定的（user_set）維度不會被隱含訊號覆蓋', () => {
    const base = profile({ 'taste.spicy': dim(-0.9, 0.9, 'user_set'), 'protein.pork': dim(-0.8, 0.8, 'user_set') });
    const out = run({
      base,
      saved: Array.from({ length: 10 }, () => porkDish(NOW, true)),
      chatSignals: [sig({ affinity: 1 })],
      pantryIngredientIds: ['chili'],
    });
    expect(out.dims['taste.spicy']).toEqual(base.dims['taste.spicy']);
    expect(out.dims['protein.pork']).toEqual(base.dims['protein.pork']);
  });

  it('探索來的維度可以被隱含訊號微調，來源仍是 explored', () => {
    const base = profile({ 'protein.pork': dim(0.2, 0.5, 'explored') });
    const out = run({ base, saved: [porkDish(NOW, true)] });
    expect(out.dims['protein.pork']!.source).toBe('explored');
    expect(out.dims['protein.pork']!.affinity).toBeGreaterThan(0.2);
    expect(out.dims['protein.pork']!.confidence).toBeGreaterThan(0.5);
  });

  it('探索來的維度：隱含訊號不能讓正負號翻轉，只能停在 0', () => {
    const base = profile({ 'protein.pork': dim(0.1, 0.2, 'explored'), 'taste.spicy': dim(-0.1, 0.2, 'explored') });
    const out = run({
      base,
      saved: Array.from({ length: 20 }, () => porkDish(NOW, true)).map((s) => s),
      chatSignals: [sig({ dimensionKey: 'taste.spicy', affinity: 1 })],
      pantryIngredientIds: [],
    });
    expect(out.dims['taste.spicy']!.affinity).toBeLessThanOrEqual(0);
    const down = run({ base, chatSignals: [sig({ dimensionKey: 'protein.pork', affinity: -1 })] });
    expect(down.dims['protein.pork']!.affinity).toBeGreaterThanOrEqual(0);
    expect(down.dims['protein.pork']!.confidence).toBeGreaterThan(0.2); // 把握仍會變
  });

  it('隱含訊號隨時間變輕：一年前的力道剩一半', () => {
    const recent = run({ saved: [porkDish(NOW, true)] });
    const old = run({ saved: [porkDish('2025-11-22T00:00:00.000Z', true)] });
    expect(old.dims['protein.pork']!.confidence).toBeLessThan(recent.dims['protein.pork']!.confidence);
    // 力道 0.5 → 0.25；confidence = 0.5 × 力道
    expect(old.dims['protein.pork']!.confidence).toBeCloseTo(0.5 * COOKED_WEIGHT * 0.5, 3);
  });

  it('對話：長期的偏好算進口味，只針對今天的不算', () => {
    const out = run({ chatSignals: [sig({ affinity: -0.6 }), sig({ conversation: 'c2', dimensionKey: 'protein.pork', scope: 'today', affinity: 0.8 })] });
    expect(out.dims['taste.spicy']!.affinity).toBe(-1);
    expect(out.dims['taste.spicy']!.confidence).toBeCloseTo(0.5 * CHAT_SIGNAL_WEIGHT * 0.6, 5);
    expect(out.dims['protein.pork']).toBeUndefined();
    expect(out.sources.signals).toBe(1);
  });

  it('同一段對話裡同一個維度只算最新的一次；不在字典裡的維度略過', () => {
    const out = run({
      chatSignals: [
        sig({ affinity: 0.5, at: '2026-11-20T00:00:00Z' }),
        sig({ affinity: -0.5, at: '2026-11-21T00:00:00Z' }),
        sig({ dimensionKey: 'taste.nope', affinity: 1 }),
      ],
    });
    expect(out.dims['taste.spicy']!.affinity).toBe(-1);
    expect(out.dims['taste.nope']).toBeUndefined();
    expect(out.sources.signals).toBe(1);
  });

  it('不同段對話各算各的', () => {
    const out = run({ chatSignals: [sig({ conversation: 'a' }), sig({ conversation: 'b' })] });
    expect(out.sources.signals).toBe(2);
    expect(out.dims['taste.spicy']!.confidence).toBeGreaterThan(0.5 * CHAT_SIGNAL_WEIGHT * 0.6);
  });

  it('手邊的食材：權重很小，同一種不重複算', () => {
    const out = run({ pantryIngredientIds: ['chili', 'chili', 'pork'] });
    expect(out.sources.pantry).toBe(2);
    expect(out.dims['taste.spicy']!.confidence).toBeLessThan(0.05);
    expect(out.dims['ingredient.chili']!.affinity).toBeGreaterThan(0);
  });

  it('把握程度不夠的維度仍然被記下來，但很低（下游不用它加分）', () => {
    const out = run({ saved: [porkDish(NOW)], pantryIngredientIds: ['tofu'] });
    expect(Object.values(out.dims).every((d) => d.confidence < 0.5)).toBe(true);
  });

  it('不改傳進來的物件，結果和順序無關', () => {
    const base = profile({ 'protein.pork': dim(0.2, 0.5) });
    const frozen = JSON.stringify(base);
    const a = run({ base, saved: [porkDish('2026-11-01T00:00:00Z'), porkDish('2026-11-10T00:00:00Z')] });
    const b = run({ base, saved: [porkDish('2026-11-10T00:00:00Z'), porkDish('2026-11-01T00:00:00Z')] });
    expect(JSON.stringify(base)).toBe(frozen);
    expect(a.dims).toEqual(b.dims);
  });

  it('快照資料來回轉換', () => {
    const out = run({ saved: [porkDish(NOW)], base: { ...profile({ 'taste.spicy': dim(0.5, 0.6) }), lastExploredAt: '2026-11-01T00:00:00Z' } });
    const data = toSnapshotData(out);
    expect(data.schemaVersion).toBe(1);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    const back = fromSnapshotData(data);
    expect(back.dims).toEqual(out.dims);
    expect(back.sources).toEqual(out.sources);
  });
});
