// 編輯頁的資料模型（純函式，方便測試）：資料庫的一篇食譜 ⇄ 編輯中的表單 ⇄ 要送出的變更。
import { buildIngredientIndex, difficultyOverall, newId, parseIngredientLineNamed, type DifficultyValues } from '@zhusha/core';
import { ingredients as dictionaryIngredients } from '@zhusha/ingredients';
import type { Highlight, RecipeDifficulty, RecipeIngredient, RecipeStep, RecipeVisibility } from '@zhusha/shared-types';
import type { Photo } from '../../data/photos.ts';
import { recipeLimits, type Recipe, type RecipePatch, type RecipePhotoInput } from '../../data/recipes.ts';

// 固定的七個選項（不能自訂）
export const HIGHLIGHTS: readonly Highlight[] = [
  'first_time',
  'hosted_friends',
  'improved',
  'family_favorite',
  'festive',
  'make_again',
  'funny_flop',
];

// 容錯：資料裡出現不認得的代碼（之後新增的選項、舊版 App 遇到新版資料）就略過，不報錯
export function knownHighlights(values: readonly string[] | null | undefined): Highlight[] {
  return (values ?? []).filter((v): v is Highlight => (HIGHLIGHTS as readonly string[]).includes(v));
}

// 使用者內容的長度上限（和 app_config.text_limits 的預設一致；資料庫是最後一道檢查）
export const textLimits = { title: 80, story: 2000, tips: 1000, step: 500 } as const;

// 超過上限幾個字（沒超過是 0），給畫面顯示「還要刪幾字」。用字元數（不是 UTF-16 長度）和資料庫一致
export function overBy(text: string, limit: number): number {
  return Math.max(0, [...text].length - limit);
}

export type EditorPhoto = {
  id: string;
  width: number;
  height: number;
  takenAt?: string;
  // 已經在資料庫裡的照片才有；剛選的照片用本機預覽
  thumbPath?: string;
  storagePath?: string;
};
export type EditorStep = { id: string; text: string; photo?: EditorPhoto };
export type EditorIngredient = { id: string; text: string };

export type EditorForm = {
  title: string;
  story: string;
  photos: EditorPhoto[]; // 上方的照片，第一張是封面
  servings: number;
  ingredients: EditorIngredient[];
  steps: EditorStep[];
  tips: string;
  highlights: Highlight[];
  difficulty: DifficultyValues | null; // 沒動過拉桿就是 null
  visibility: RecipeVisibility;
};

export const DEFAULT_SERVINGS = 2;

export function emptyForm(servings = DEFAULT_SERVINGS): EditorForm {
  return {
    title: '',
    story: '',
    photos: [],
    servings,
    ingredients: [],
    steps: [],
    tips: '',
    highlights: [],
    difficulty: null,
    visibility: 'friends',
  };
}

function toEditorPhoto(p: Photo): EditorPhoto {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    ...(p.taken_at ? { takenAt: p.taken_at } : {}),
    thumbPath: p.thumb_path,
    storagePath: p.storage_path,
  };
}

function difficultyValues(d: unknown): DifficultyValues | null {
  const x = d as Partial<RecipeDifficulty> | null;
  if (!x || typeof x !== 'object') return null;
  const values = {
    ingredients: x.ingredients,
    equipment: x.equipment,
    time: x.time,
    technique: x.technique,
    failure_risk: x.failure_risk,
  };
  return Object.values(values).every((v) => typeof v === 'number') ? (values as DifficultyValues) : null;
}

export function formFromRecipe(recipe: Recipe, photos: Photo[]): EditorForm {
  const steps = (recipe.steps as RecipeStep[]).slice().sort((a, b) => a.order - b.order);
  return {
    title: recipe.title ?? '',
    story: recipe.story ?? '',
    photos: photos.filter((p) => p.owner_type === 'recipe').map(toEditorPhoto),
    servings: recipe.servings ?? DEFAULT_SERVINGS,
    ingredients: (recipe.ingredients as RecipeIngredient[]).map((i) => ({ id: i.id, text: i.raw_text })),
    steps: steps.map((s) => {
      const photo = photos.find((p) => p.owner_type === 'recipe_step' && p.owner_id === s.id);
      return { id: s.id, text: s.text, ...(photo ? { photo: toEditorPhoto(photo) } : {}) };
    }),
    tips: recipe.tips ?? '',
    highlights: knownHighlights(recipe.highlights),
    difficulty: difficultyValues(recipe.difficulty),
    visibility: recipe.visibility as RecipeVisibility,
  };
}

export function newStep(): EditorStep {
  return { id: newId(), text: '' };
}
export function newIngredient(): EditorIngredient {
  return { id: newId(), text: '' };
}

// 食材字典的比對索引（第一次存檔時才建）
let ingredientIndex: ReturnType<typeof buildIngredientIndex> | null = null;

// 一列食材原文 → 要送出的食材：原文照存，另外附上手機解析好的 name（拆出來的食材名字，食材正規化的對應與回填用）、
// ingredient_id、amount、amount_max、unit（資料庫會再檢查，不合格的欄位清空）；解析不出來的欄位不放
export function toIngredient(id: string, text: string): RecipeIngredient {
  ingredientIndex ??= buildIngredientIndex(dictionaryIngredients);
  const parsed = parseIngredientLineNamed(text, ingredientIndex);
  return {
    id,
    raw_text: text,
    ...(parsed.name !== '' && [...parsed.name].length <= 60 ? { name: parsed.name } : {}),
    ...(parsed.ingredientId ? { ingredient_id: parsed.ingredientId } : {}),
    ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
    ...(parsed.amountMax !== undefined ? { amount_max: parsed.amountMax } : {}),
    ...(parsed.unit ? { unit: parsed.unit } : {}),
    optional: false,
  };
}

// 表單 → save_recipe 的欄位（全部欄位；比較變更時兩邊都轉成這個形狀）
export function toFields(form: EditorForm): RecipePatch {
  const text = (s: string) => (s.trim() === '' ? null : s);
  return {
    title: text(form.title.trim()),
    story: text(form.story),
    servings: form.servings,
    ingredients: form.ingredients
      .filter((i) => i.text.trim() !== '')
      .map((i): RecipeIngredient => toIngredient(i.id, i.text.trim())),
    steps: form.steps.map((s, order): RecipeStep => ({ id: s.id, order, text: s.text })),
    tips: text(form.tips),
    highlights: form.highlights,
    difficulty: form.difficulty ? { ...form.difficulty, source: 'author' } : null,
    visibility: form.visibility,
  };
}

// 和上次存的比，只送有改的欄位（save_recipe 只送有改的欄位）
export function buildPatch(saved: EditorForm, current: EditorForm): RecipePatch {
  const a = toFields(saved) as Record<string, unknown>;
  const b = toFields(current) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(b)) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) patch[key] = b[key];
  }
  return patch as RecipePatch;
}

// 表單的照片清單：上方照片依序，接著是各步驟的照片（依步驟順序）。ready 回傳這張照片的檔案傳完了沒；沒傳完的先不放
export function toPhotoInputs(form: EditorForm, ready: (id: string) => boolean): RecipePhotoInput[] {
  const input = (p: EditorPhoto, stepId?: string): RecipePhotoInput => ({
    id: p.id,
    owner_type: stepId ? 'recipe_step' : 'recipe',
    ...(stepId ? { owner_id: stepId } : {}),
    width: p.width,
    height: p.height,
    ...(p.takenAt ? { taken_at: p.takenAt } : {}),
  });
  return [
    ...form.photos.filter((p) => ready(p.id)).map((p) => input(p)),
    ...form.steps.flatMap((s) => (s.photo && ready(s.photo.id) ? [input(s.photo, s.id)] : [])),
  ];
}

// 照片有沒有改（順序、新增、移除都算）
export function photosChanged(saved: EditorForm, current: EditorForm, ready: (id: string) => boolean): boolean {
  const all = () => true;
  return JSON.stringify(toPhotoInputs(saved, all).map((p) => [p.id, p.owner_id])) !==
    JSON.stringify(toPhotoInputs(current, ready).map((p) => [p.id, p.owner_id]));
}

export function allPhotos(form: EditorForm): EditorPhoto[] {
  return [...form.photos, ...form.steps.flatMap((s) => (s.photo ? [s.photo] : []))];
}

// 發佈：要有菜名，也要至少一張照片
export function hasContent(form: EditorForm): boolean {
  return form.title.trim() !== '' && allPhotos(form).length > 0;
}

export function canAddPhoto(form: EditorForm): boolean {
  return form.photos.length < recipeLimits.photos;
}
export function canAddStep(form: EditorForm): boolean {
  return form.steps.length < recipeLimits.steps;
}

// 任何一個欄位超過長度上限
export function overLimit(form: EditorForm): { field: 'title' | 'story' | 'tips' | 'step'; over: number } | null {
  const checks: { field: 'title' | 'story' | 'tips' | 'step'; over: number }[] = [
    { field: 'title', over: overBy(form.title, textLimits.title) },
    { field: 'story', over: overBy(form.story, textLimits.story) },
    { field: 'tips', over: overBy(form.tips, textLimits.tips) },
    ...form.steps.map((s) => ({ field: 'step' as const, over: overBy(s.text, textLimits.step) })),
  ];
  return checks.find((c) => c.over > 0) ?? null;
}

// 草稿的空白判斷：整篇都沒有內容時不用存（開了編輯頁什麼都沒寫就離開，不留空草稿）
export function isBlank(form: EditorForm): boolean {
  return (
    form.title.trim() === '' &&
    form.story.trim() === '' &&
    form.photos.length === 0 &&
    form.ingredients.every((i) => i.text.trim() === '') &&
    form.steps.every((s) => s.text.trim() === '' && !s.photo) &&
    form.tips.trim() === '' &&
    form.highlights.length === 0 &&
    form.difficulty === null
  );
}

export { difficultyOverall };
