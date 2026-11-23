// 編輯頁的資料模型（純函式，方便測試）：資料庫的一篇食譜 ⇄ 編輯中的表單 ⇄ 要送出的變更。
import { buildIngredientIndex, difficultyOverall, newId, parseIngredientLineNamed, type DifficultyValues } from '@zhusha/core';
import { ingredients as dictionaryIngredients } from '@zhusha/ingredients';
import type { Highlight, RecipeDifficulty, RecipeIngredient, RecipeSource, RecipeStep, RecipeVisibility } from '@zhusha/shared-types';
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
// isNew：這次用說的新加的項目（旁邊顯示「新的」小標記）；作者編輯過那一項就拿掉。只存在編輯頁，不存進資料庫
export type EditorStep = { id: string; text: string; photo?: EditorPhoto; isNew?: boolean };
export type EditorIngredient = { id: string; text: string; isNew?: boolean };

// 難易度：source 是 author（作者動過拉桿，AI 不再覆寫）或 ai（大廚估的）；estimatedFrom 只有 AI 估的才有
export type EditorDifficulty = { values: DifficultyValues; source: 'author' | 'ai'; estimatedFrom?: 'recipe' | 'text' };

export type EditorForm = {
  title: string;
  story: string;
  photos: EditorPhoto[]; // 上方的照片，第一張是封面
  servings: number;
  ingredients: EditorIngredient[];
  steps: EditorStep[];
  tips: string;
  highlights: Highlight[];
  difficulty: EditorDifficulty | null; // 還沒有難易度就是 null
  visibility: RecipeVisibility;
  source: RecipeSource | null; // 從網址匯入的來源；其他食譜是 null
};

export const DEFAULT_SERVINGS = 2;

// 作者編輯過這一項：「新的」標記就消失
export function edited<T extends { isNew?: boolean }>(item: T, patch: Partial<T>): T {
  const { isNew: _isNew, ...rest } = item;
  return { ...rest, ...patch } as T;
}

// 新食譜預先帶入的內容（從收藏的點子「做了，記錄一篇」進來）：大廚展開好的食材與步驟，已經依偏好轉成編輯頁的文字
export type EditorDraft = { servings: number; ingredients: EditorIngredient[]; steps: { id: string; text: string }[]; tips: string };

// 新食譜的起點：空白表單加上菜名與帶入的內容
export function startingForm(servings: number | undefined, title: string | undefined, draft: EditorDraft | undefined, source: RecipeSource | null = null): EditorForm {
  return {
    ...emptyForm(servings),
    title: title ?? '',
    source,
    ...(draft ? { servings: draft.servings, ingredients: draft.ingredients, steps: draft.steps, tips: draft.tips } : {}),
  };
}

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
    source: null,
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

function editorDifficulty(d: unknown): EditorDifficulty | null {
  const x = d as Partial<RecipeDifficulty> | null;
  if (!x || typeof x !== 'object') return null;
  const values = {
    ingredients: x.ingredients,
    equipment: x.equipment,
    time: x.time,
    technique: x.technique,
    failure_risk: x.failure_risk,
  };
  if (!Object.values(values).every((v) => typeof v === 'number')) return null;
  return {
    values: values as DifficultyValues,
    source: x.source === 'ai' ? 'ai' : 'author',
    ...(x.source === 'ai' && x.estimated_from ? { estimatedFrom: x.estimated_from } : {}),
  };
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
    difficulty: editorDifficulty(recipe.difficulty),
    visibility: recipe.visibility as RecipeVisibility,
    source: (recipe.source as RecipeSource | null) ?? null,
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
    difficulty: form.difficulty
      ? { ...form.difficulty.values, source: form.difficulty.source, ...(form.difficulty.source === 'ai' && form.difficulty.estimatedFrom ? { estimated_from: form.difficulty.estimatedFrom } : {}) }
      : null,
    visibility: form.visibility,
    source: form.source,
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

// 產品事件用：這篇做到哪（放棄時記 step）。只看有沒有內容，不記內容本身
export function recordProgress(form: EditorForm): 'blank' | 'photo' | 'text' | 'method' {
  if (form.ingredients.some((i) => i.text.trim() !== '') || form.steps.some((s) => s.text.trim() !== '') || form.tips.trim() !== '') return 'method';
  if (form.title.trim() !== '' || form.story.trim() !== '') return 'text';
  if (allPhotos(form).length > 0) return 'photo';
  return 'blank';
}

export { difficultyOverall };
