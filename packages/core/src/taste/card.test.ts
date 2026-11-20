import { preferenceDimensions } from '@zhusha/taste';
import { describe, expect, it } from 'vitest';
import { buildCard } from './card.ts';
import { emptyProfile, type DimensionState, type TasteProfile } from './types.ts';

const d = (affinity: number, confidence: number): DimensionState => ({ affinity, confidence, source: 'explored', updatedAt: 'x' });
const make = (dims: Record<string, DimensionState>, adventure = 0.2, goals: string[] = []): TasteProfile => {
  const p = emptyProfile();
  p.dims = dims;
  p.context.adventure = adventure;
  p.context.goals = goals;
  return p;
};

describe('buildCard', () => {
  it('味道前綴 × 菜系後綴組成名稱代碼；愛、口感、想學、不吃各自列出', () => {
    const card = buildCard(
      make({
        'taste.spicy': d(0.9, 0.7), 'cuisine.taiwan': d(0.8, 0.6), 'seasoning.soy_sauce': d(0.7, 0.6), 'form.stir_fry': d(0.6, 0.6),
        'texture.tender': d(0.5, 0.6), 'ingredient.cilantro': d(-1, 0.8), 'ingredient.ginger': d(-0.2, 0.9),
      }, 0.3, ['form.dessert_baking']),
      preferenceDimensions,
    );
    expect(card.titleCode).toBe('taste.spicy|cuisine.taiwan');
    expect(card.loves).toEqual(['seasoning.soy_sauce', 'form.stir_fry']);
    expect(card.textures).toEqual(['texture.tender']);
    expect(card.goals).toEqual(['form.dessert_baking']);
    expect(card.avoids).toEqual(['ingredient.cilantro']);
  });

  it('把握不到 0.5 的項目都不顯示', () => {
    const card = buildCard(make({ 'taste.spicy': d(1, 0.49), 'seasoning.soy_sauce': d(1, 0.49), 'ingredient.cilantro': d(-1, 0.49) }), preferenceDimensions);
    expect(card).toEqual({ titleCode: undefined, loves: [], textures: [], goals: [], avoids: [] });
  });

  it('清爽、濃郁也能當前綴', () => {
    expect(buildCard(make({ 'richness.rich': d(-0.8, 0.8), 'cuisine.japan': d(0.7, 0.6) }), preferenceDimensions).titleCode).toBe('richness.light|cuisine.japan');
    expect(buildCard(make({ 'richness.rich': d(0.8, 0.8), 'cuisine.southeast_asia': d(0.7, 0.6) }), preferenceDimensions).titleCode).toBe('richness.rich|cuisine.southeast_asia');
  });

  it('只有一邊夠格時，名稱只有那一段', () => {
    expect(buildCard(make({ 'taste.sour': d(0.8, 0.6) }), preferenceDimensions).titleCode).toBe('taste.sour');
    expect(buildCard(make({ 'cuisine.korea': d(0.8, 0.6) }), preferenceDimensions).titleCode).toBe('cuisine.korea');
  });

  it('挑戰意願很高、沒有明顯偏好的菜系：探險家', () => {
    expect(buildCard(make({ 'taste.sour': d(0.8, 0.6), 'cuisine.korea': d(0.8, 0.6) }, 0.8), preferenceDimensions).titleCode).toBe('taste.sour|cuisine.korea');
    expect(buildCard(make({ 'taste.sour': d(0.8, 0.6) }, 0.8), preferenceDimensions).titleCode).toBe('explorer');
    expect(buildCard(make({}, 0.8), preferenceDimensions).titleCode).toBe('explorer');
    expect(buildCard(make({}, 0.3), preferenceDimensions).titleCode).toBeUndefined();
  });

  it('名稱用到的項目不在「愛」裡重複', () => {
    const card = buildCard(make({ 'taste.spicy': d(0.9, 0.7), 'spice_type.numbing_spicy': d(0.9, 0.7) }), preferenceDimensions);
    expect(card.loves).toEqual(['spice_type.numbing_spicy']);
  });
});
