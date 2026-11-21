import { describe, expect, it } from 'vitest';
import { formatRecipeText } from './recipe-text.ts';

const labels = { servings: '份量', ingredients: '食材', steps: '做法', tips: '料理筆記' };

describe('formatRecipeText', () => {
  it('排出完整的食譜', () => {
    expect(
      formatRecipeText(
        { title: '番茄炒蛋', story: '今天終於炒對了', servings: '4 人份', ingredients: ['雞蛋 4 顆', '番茄 2 顆'], steps: ['蛋打散', '炒番茄\n加一點糖'], tips: '蛋不要炒太老' },
        labels,
      ),
    ).toBe('【番茄炒蛋】\n\n今天終於炒對了\n\n份量：4 人份\n\n食材\n・雞蛋 4 顆\n・番茄 2 顆\n\n做法\n1. 蛋打散\n2. 炒番茄\n   加一點糖\n\n料理筆記\n蛋不要炒太老');
  });

  it('沒有內容的區塊整段省略', () => {
    expect(formatRecipeText({ title: ' 湯 ', ingredients: [' ', ''], steps: [], tips: '  ' }, labels)).toBe('【湯】');
  });

  it('換行統一成 \\n', () => {
    expect(formatRecipeText({ title: 'a', ingredients: [], steps: ['x\r\ny'] }, labels)).toContain('1. x\n   y');
  });
});
