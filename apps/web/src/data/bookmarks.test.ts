import { describe, expect, it } from 'vitest';
import { cookedStateOf } from './bookmarks.ts';

describe('cookedStateOf（收藏的點子做過了的三種狀態）', () => {
  it('沒記錄過：none', () => {
    expect(cookedStateOf({ cooked_recipe_id: null, recipes: null })).toEqual({ kind: 'none' });
  });
  it('連到已發佈、沒刪除的：published', () => {
    expect(cookedStateOf({ cooked_recipe_id: 'r1', recipes: { status: 'published', deleted_at: null } })).toEqual({ kind: 'published', recipeId: 'r1' });
  });
  it('連到草稿、沒刪除的：draft', () => {
    expect(cookedStateOf({ cooked_recipe_id: 'r1', recipes: { status: 'draft', deleted_at: null } })).toEqual({ kind: 'draft', recipeId: 'r1' });
  });
  it('連到已刪除的（含草稿）：當作沒記錄過', () => {
    expect(cookedStateOf({ cooked_recipe_id: 'r1', recipes: { status: 'published', deleted_at: '2026-11-01T00:00:00Z' } })).toEqual({ kind: 'none' });
    expect(cookedStateOf({ cooked_recipe_id: 'r1', recipes: { status: 'draft', deleted_at: '2026-11-01T00:00:00Z' } })).toEqual({ kind: 'none' });
  });
  it('連到的那一篇不見了（讀不到）：當作沒記錄過', () => {
    expect(cookedStateOf({ cooked_recipe_id: 'r1', recipes: null })).toEqual({ kind: 'none' });
  });
  it('還沒內嵌食譜狀態：先當作已發佈', () => {
    expect(cookedStateOf({ cooked_recipe_id: 'r1' })).toEqual({ kind: 'published', recipeId: 'r1' });
  });
});
