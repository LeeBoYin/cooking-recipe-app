import { describe, expect, it } from 'vitest';
import { replaceTempMarks, type AiIdea } from '@zhusha/core';
import { renderMarks, viewOfAiIdea } from './ideaView.ts';

const idea = (over: Partial<AiIdea> = {}): AiIdea => ({
  id: 'i1', slot: 'twist', title: '豆瓣醬燒茄子', why: '用{{temp:180:C}}煎到金黃。', candidateRef: null, usesPantryIds: ['eggplant', 'doubanjiang'], usesPriorityIds: ['eggplant'],
  otherIngredients: [], difficulty: { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 1, overall: 3 }, techniques: ['pan-fry'], equipment: ['frying-pan'],
  substitutions: [], ...over,
});

describe('AI 點子的顯示內容', () => {
  it('理由裡的溫度標記依偏好換成攝氏或華氏', () => {
    expect(renderMarks('用{{temp:180:C}}煎', { unit: 'C', both: false })).toBe('用180°C煎');
    expect(renderMarks('用{{temp:180:C}}煎', { unit: 'F', both: false })).toBe('用355°F煎');
    expect(replaceTempMarks('沒有標記', () => 'x')).toBe('沒有標記');
  });

  it('食材都在廚房、沒有其他材料才標「廚房有」；否則顯示難易度', () => {
    expect(viewOfAiIdea(idea(), { unit: 'C', both: false }).kitchenHas).toBe(true);
    const v = viewOfAiIdea(idea({ otherIngredients: [{ name: '九層塔', ingredientId: 'thai-basil' }] }), { unit: 'C', both: false });
    expect(v.kitchenHas).toBe(false);
    expect(v.difficulty).toBe(3);
    expect(v.others).toEqual(['九層塔']);
  });

  it('熟悉的：自己的食譜可以打開、家常菜可以收藏；變化版與新挑戰都不行', () => {
    const pref = { unit: 'C', both: false } as const;
    expect(viewOfAiIdea(idea({ slot: 'familiar', candidateRef: 'own:abc' }), pref)).toMatchObject({ source: 'own', recipeId: 'abc' });
    expect(viewOfAiIdea(idea({ slot: 'familiar', candidateRef: 'dish:mapo-tofu' }), pref)).toMatchObject({ source: 'dish', baseDishId: 'mapo-tofu' });
    const twist = viewOfAiIdea(idea({ slot: 'twist', candidateRef: 'dish:mapo-tofu' }), pref);
    expect(twist.source).toBe('ai');
    expect(twist.baseDishId).toBeUndefined();
  });
});
