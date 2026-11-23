import { describe, expect, it } from 'vitest';
import { replaceTempMarks, type AiIdea } from '@zhusha/core';
import { ingredientBadges, mainIngredientTags, mentionUsed, renderMarks, viewOfAiIdea } from './ideaView.ts';

const idea = (over: Partial<AiIdea> = {}): AiIdea => ({
  id: 'i1', slot: 'twist', title: '豆瓣醬燒茄子', why: '用{{temp:180:C}}煎到金黃。', candidateRef: null, usesPantryIds: ['eggplant', 'doubanjiang'], usesPriorityIds: ['eggplant'],
  otherIngredients: [], difficulty: { ingredients: 2, equipment: 1, time: 2, technique: 2, failure_risk: 1, overall: 3 }, techniques: ['pan-fry'], equipment: ['frying-pan'],
  substitutions: [], ...over,
});

describe('AI 點子的顯示內容', () => {
  it('理由裡的溫度標記依偏好換成攝氏或華氏', () => {
    expect(renderMarks('用{{temp:180:C}}煎', { unit: 'C', both: false })).toBe('用180°C煎');
    expect(renderMarks('用{{temp:180:C}}煎', { unit: 'F', both: false })).toBe('用355°F煎');
    // 標記的單位和偏好相同：照原樣顯示、不換算（含一位小數）
    expect(renderMarks('煮到{{temp:165:F}}以上', { unit: 'F', both: false })).toBe('煮到165°F以上');
    expect(renderMarks('煮到{{temp:73.9:C}}以上', { unit: 'C', both: false })).toBe('煮到73.9°C以上');
    // 安全標記：有官方值就直接用，不換算；沒有才換算並無條件進位
    const us = '{{temp:165:F:min:73.9}}';
    expect(renderMarks(us, { unit: 'C', both: false })).toBe('73.9°C');
    expect(renderMarks(us, { unit: 'F', both: false })).toBe('165°F');
    expect(renderMarks(us, { unit: 'C', both: true })).toBe('73.9°C（165°F）');
    expect(renderMarks('{{temp:160:F:min:71.1}}', { unit: 'C', both: false })).toBe('71.1°C');
    expect(renderMarks('{{temp:62.8:C:min}}', { unit: 'F', both: false })).toBe('146°F'); // 沒有官方華氏：62.8°C = 145.04°F，往上進位到整數華氏
    expect(renderMarks('{{temp:75:C:min}}', { unit: 'F', both: false })).toBe('167°F'); // 75°C = 167°F
    expect(renderMarks('{{temp:75.1:C:min}}', { unit: 'F', both: false })).toBe('168°F'); // 167.18°F 往上進位
    expect(renderMarks('{{temp:180:C}}', { unit: 'F', both: false })).toBe('355°F'); // 一般標記照舊
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

  it('對話的點子：你說的食材標出來；AI 想的點子帶 suggestionId 才能收藏', () => {
    const pref = { unit: 'C', both: false } as const;
    const v = viewOfAiIdea(idea({ usesPantryIds: ['pork-ribs'], usesMentionedIds: ['bamboo-shoot'] }), pref, 's1');
    expect(v.ingredients.map((i) => [i.have, i.said ?? false])).toEqual([[true, false], [false, true]]);
    expect(v.kitchenHas).toBe(true);
    expect(v.suggestionId).toBe('s1');
    expect(viewOfAiIdea(idea(), pref).suggestionId).toBeUndefined();
  });
});

describe('ingredientBadges', () => {
  const view = { ingredients: [{ id: 'cabbage', name: '高麗菜', have: true }, { id: 'bamboo-shoot', name: '竹筍', have: false, said: true }, { name: '無 ID', have: true }] };
  it('用標準食材 ID 對：廚房有、你說的', () => {
    expect(ingredientBadges(view, 'cabbage')).toEqual({ said: false, have: true });
    expect(ingredientBadges(view, 'bamboo-shoot')).toEqual({ said: true, have: false });
  });
  it('對不到或沒有 ID 的列不加標籤', () => {
    expect(ingredientBadges(view, 'salt')).toEqual({ said: false, have: false });
    expect(ingredientBadges(view, null)).toEqual({ said: false, have: false });
    expect(ingredientBadges(view, undefined)).toEqual({ said: false, have: false });
  });
});

describe('主要食材標籤', () => {
  const ing = (name: string, over: { have?: boolean; said?: boolean } = {}) => ({ id: name, name, have: false, ...over });
  it('取廚房有的與使用者說的，沒有的不放', () => {
    expect(mainIngredientTags({ ingredients: [ing('茄子', { have: true }), ing('豆腐', { said: true }), ing('豬肉')] })).toEqual({ names: ['茄子', '豆腐'], extra: 0 });
  });
  it('最多 3 個，超過的算進 extra', () => {
    const ingredients = ['a', 'b', 'c', 'd', 'e'].map((n) => ing(n, { have: true }));
    expect(mainIngredientTags({ ingredients })).toEqual({ names: ['a', 'b', 'c'], extra: 2 });
  });
  it('沒有任何食材時回空', () => {
    expect(mainIngredientTags({ ingredients: [] })).toEqual({ names: [], extra: 0 });
  });
  it('AI 點子：用到的廚房食材加上使用者說的', () => {
    const v = viewOfAiIdea(idea({ usesMentionedIds: ['tofu'] }), { unit: 'C', both: false });
    expect(mainIngredientTags(v).names).toHaveLength(3);
  });
});

describe('mentionUsed（對話卡片的「你提到的食材」）', () => {
  const view = { title: '高麗菜豆腐湯', others: ['麵條'], ingredients: [{ id: 'cabbage', name: '高麗菜', have: true }, { id: 'bamboo-shoot', name: '竹筍', have: false, said: true }, { id: 'egg', name: '雞蛋', have: false }] };
  it('ID 對得上（廚房有或你說的）算用到；只是骨架裡列出的不算', () => {
    expect(mentionUsed(view, { text: '高麗菜', ingredientId: 'cabbage' })).toBe(true);
    expect(mentionUsed(view, { text: '筍子', ingredientId: 'bamboo-shoot' })).toBe(true);
    expect(mentionUsed(view, { text: '雞蛋', ingredientId: 'egg' })).toBe(false);
  });
  it('沒有 ID 時，字出現在菜名或其他材料裡才算', () => {
    expect(mentionUsed(view, { text: '麵條', ingredientId: null })).toBe(true);
    expect(mentionUsed(view, { text: '豆腐', ingredientId: null })).toBe(true);
    expect(mentionUsed(view, { text: '巧克力', ingredientId: null })).toBe(false);
  });
});
