import { describe, expect, it } from 'vitest';
import { screenOf } from './ScreenTracker.tsx';

describe('screenOf', () => {
  it('路徑對應固定的畫面代碼，不帶 ID', () => {
    expect(screenOf('/')).toBe('home');
    expect(screenOf('/recipes/0198-abc/edit')).toBe('recipe_edit');
    expect(screenOf('/recipes/0198-abc')).toBe('recipe');
    expect(screenOf('/recipes/saved/xyz')).toBe('saved_idea');
    expect(screenOf('/recipes/saved')).toBe('recipes_saved');
    expect(screenOf('/kitchen/pantry/add')).toBe('pantry_add');
    expect(screenOf('/kitchen/pantry/123')).toBe('pantry_edit');
    expect(screenOf('/me/')).toBe('me');
    expect(screenOf('/nowhere')).toBe('other');
  });
});
