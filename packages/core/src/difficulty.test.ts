import { describe, expect, it } from 'vitest';
import { difficultyOverall } from './difficulty.ts';

describe('difficultyOverall', () => {
  it('全部最低是 1、全部最高是 10', () => {
    expect(difficultyOverall({ ingredients: 1, equipment: 1, time: 1, technique: 1, failure_risk: 1 })).toBe(1);
    expect(difficultyOverall({ ingredients: 5, equipment: 5, time: 5, technique: 5, failure_risk: 5 })).toBe(10);
  });
  it('和資料庫的算法一致（紅燒肉的例子是 4）', () => {
    expect(difficultyOverall({ ingredients: 2, equipment: 1, time: 4, technique: 2, failure_risk: 3 })).toBe(4);
  });
});
