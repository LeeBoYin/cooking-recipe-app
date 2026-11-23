// 編輯頁的狀態與儲存：
// - 草稿：每次有改動就自動存（約 1 秒後），照片檔傳完才放進清單；
// - 已發佈：改了先放在畫面上，按「儲存」才更新（連照片也是）；
// - 衝突由資料層自動用最新版重送，畫面上不處理。M0 不暫存文字。
import { useQueryClient } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import { newId } from '@zhusha/core';
import type { Dictation, RecipeSource } from '@zhusha/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { queryKeys } from '../../data/hooks.ts';
import { currentUserId } from '../../data/account.ts';
import { dictateRecipe } from '../../data/ai.ts';
import { reportError } from '../../data/errors.ts';
import { track } from '../../data/track.ts';
import { trackErrorKind } from '../../data/trackError.ts';
import type { Photo } from '../../data/photos.ts';
import { createRecipe, publishRecipe, updateRecipe, type Recipe } from '../../data/recipes.ts';
import { processPhoto } from '../../photos/process.ts';
import {
  enqueueRecipePhoto,
  flushPendingPhotos,
  getUploadedPhotoIds,
  getUploadState,
  onRecipePhotoUploaded,
  subscribeUploads,
} from '../../photos/uploadQueue.ts';
import { applyResult, currentOf, withRawDictation } from './dictation.ts';
import {
  allPhotos,
  buildPatch,
  canAddPhoto,
  canAddStep,
  startingForm,
  type EditorDraft,
  formFromRecipe,
  isBlank,
  newIngredient,
  newStep,
  overLimit,
  photosChanged,
  toPhotoInputs,
  type EditorForm,
  type EditorPhoto,
} from './model.ts';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type PhotoStatus = 'ready' | 'uploading' | 'failed';
export type Removed = { photo: EditorPhoto; stepId?: string; index: number; key: number };

const AUTOSAVE_MS = 1000;

// 存檔或發佈失敗：只回報原因代碼（資料庫的錯誤碼，或我們自己的 `recipe_xxx`），不送任何內容。
// 沒有錯誤碼＝請求沒送到，當成網路問題
function failureKind(error: unknown): { kind: string; onServer: boolean } {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  const message = typeof e.message === 'string' ? (e.message.split(':')[0] ?? '') : '';
  const code = typeof e.code === 'string' ? e.code : '';
  if (/^[a-z_]+$/.test(message) && message.length <= 40) return { kind: message, onServer: true };
  if (/^[0-9A-Z]{5}$/.test(code)) return { kind: `pg_${code}`, onServer: true };
  return { kind: 'network', onServer: false };
}

export function useRecipeEditor(recipeId: string, recipe: Recipe | null, photoRows: Photo[], initialTitle?: string, defaultServings?: number, initialDraft?: EditorDraft, initialSource?: RecipeSource | null, savedDictation?: Dictation | null) {
  const queryClient = useQueryClient();
  const initial = useMemo(() => (recipe ? formFromRecipe(recipe, photoRows) : startingForm(defaultServings, initialTitle, initialDraft, initialSource ?? null)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setFormState] = useState<EditorForm>(initial);
  const formRef = useRef(form);
  // 新食譜預填的菜名與做法（從大廚的點子或收藏帶進來）還沒存進資料庫，所以「上次存的」要當成空白，這樣第一次存才會把它們送出去
  const savedForm = useRef<EditorForm>(recipe ? initial : startingForm(defaultServings, undefined, undefined));
  const savedRecipe = useRef<Recipe | null>(recipe);
  const [recipeState, setRecipeState] = useState<Recipe | null>(recipe);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // 用說的：最近一次的口述原文（存在 recipe_private）。pending 是還沒存進資料庫的那一份，下一次存檔一起送
  const [dictation, setDictation] = useState<Dictation | null>(savedDictation ?? null);
  const dictationRef = useRef(dictation);
  const pendingDictation = useRef<Dictation | null>(null);
  const aiFilledPending = useRef(false); // 這次存檔包含大廚填的內容：已發佈的食譜留的版本記成「用說的」
  const [privateDirty, setPrivateDirty] = useState(false);
  const [saveFailedOnServer, setSaveFailedOnServer] = useState(false); // 資料庫拒絕（不是網路問題）
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(new Map());
  const previewUrls = useRef(new Map<string, string>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const uploads = useSyncExternalStore(subscribeUploads, getUploadState);
  const uploaded = useSyncExternalStore(subscribeUploads, getUploadedPhotoIds);

  const isDraft = !recipeState || recipeState.status === 'draft';
  const startedAsDraft = useRef(recipe?.status === 'draft'); // 產品事件：打開時就是草稿，才算「草稿變成發佈」

  // 檔案已經在 Storage 裡：資料庫有的、或這次傳完的
  const serverIds = useRef(new Set(allPhotos(initial).map((p) => p.id)));
  const isReady = useCallback((id: string) => serverIds.current.has(id) || uploaded.has(id), [uploaded]);
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  const setForm = useCallback((update: (f: EditorForm) => EditorForm) => {
    setFormState((prev) => {
      const next = update(prev);
      formRef.current = next;
      return next;
    });
  }, []);

  // 存一次：比對上次存的，只送有改的欄位與照片清單。同時只跑一個，後面的排隊
  const save = useCallback((): Promise<Recipe | null> => {
    const run = async (): Promise<Recipe | null> => {
      const current = formRef.current;
      const ready = isReadyRef.current;
      const patch = buildPatch(savedForm.current, current);
      // 料理時間預設取第一張照片的拍攝時間（時間軸依它排序）；之後不再改
      const takenAt = current.photos.find((p) => ready(p.id))?.takenAt;
      if (takenAt && !savedRecipe.current?.cooked_at) patch.cooked_at = takenAt;
      const photosDiff = photosChanged(savedForm.current, current, ready);
      const priv = pendingDictation.current;
      if (Object.keys(patch).length === 0 && !photosDiff && !priv) return savedRecipe.current;
      if (!savedRecipe.current && isBlank(current)) return null;
      if (overLimit(current)) return savedRecipe.current;
      setSaveState('saving');
      try {
        const changedBy = aiFilledPending.current;
        const options = {
          ...(photosDiff ? { photos: toPhotoInputs(current, ready) } : {}),
          ...(priv ? { private: { dictation: priv } } : {}),
          ...(changedBy ? { changedBy: 'ai_dictation' as const } : {}),
        };
        const firstSave = !savedRecipe.current;
        const result = savedRecipe.current
          ? await updateRecipe(recipeId, patch, savedRecipe.current.updated_at, options)
          : await createRecipe(patch, { id: recipeId, ...options });
        if (firstSave) track('record.draft_saved');
        savedRecipe.current = result;
        setRecipeState(result);
        if (priv && pendingDictation.current === priv) {
          pendingDictation.current = null;
          setPrivateDirty(false);
        }
        if (changedBy) aiFilledPending.current = false;
        // 這次存進去的內容；還沒傳完的照片不算
        savedForm.current = {
          ...current,
          photos: current.photos.filter((p) => ready(p.id)),
          steps: current.steps.map((s) => (s.photo && !ready(s.photo.id) ? { id: s.id, text: s.text } : s)),
        };
        for (const p of allPhotos(savedForm.current)) serverIds.current.add(p.id);
        queryClient.setQueryData(queryKeys.recipe(recipeId), result);
        void queryClient.invalidateQueries({ queryKey: queryKeys.recipePhotos(recipeId) });
        void queryClient.invalidateQueries({ queryKey: ['recipes'] });
        setSaveState('saved');
        return result;
      } catch (error) {
        const { kind, onServer } = failureKind(error);
        setSaveFailedOnServer(onServer);
        void reportError(`recipe_save_${kind}`, 'recipe-edit', 'warning');
        trackErrorKind(kind);
        setSaveState('error');
        return savedRecipe.current;
      }
    };
    const next = chain.current.then(run, run);
    chain.current = next;
    return next;
  }, [queryClient, recipeId]);

  // 草稿自動存
  const dirtyKey = useMemo(() => `${JSON.stringify(form)}|${[...uploaded].join(',')}|${dictation?.at ?? ''}`, [form, uploaded, dictation]);
  useEffect(() => {
    if (!isDraft) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirtyKey, isDraft, save]);

  // 離開編輯頁時，草稿把還沒存的送出去
  useEffect(
    () => () => {
      if (!savedRecipe.current || savedRecipe.current.status === 'draft') void save();
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [save],
  );

  // 編輯頁開著時，這篇食譜的照片檔傳完了由這裡接手（不用補進草稿）
  useEffect(() => onRecipePhotoUploaded((p) => p.recipeId === recipeId), [recipeId]);

  // recipeState 在每次存好後換新，dirty 才會跟著重算
  const dirty = useMemo(
    () =>
      Object.keys(buildPatch(savedForm.current, form)).length > 0 || photosChanged(savedForm.current, form, isReady) || privateDirty,
    [form, isReady, recipeState, privateDirty], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const photoStatus = useCallback(
    (id: string): PhotoStatus => {
      if (isReady(id)) return 'ready';
      const u = uploads.get(id);
      return u && !u.failed ? 'uploading' : 'failed';
    },
    [isReady, uploads],
  );
  const pendingCount = allPhotos(form).filter((p) => photoStatus(p.id) !== 'ready').length;

  // ---- 照片 ----
  // 上方照片可以一次選多張；步驟照片一次一張，已經有的就換掉
  const addPhotos = useCallback(
    async (files: File[], stepId?: string) => {
      const userId = await currentUserId();
      for (const file of files) {
        const cur = formRef.current;
        if (!stepId && !canAddPhoto(cur)) break;
        const photo = await processPhoto(file, 'none');
        const id = newId();
        const url = URL.createObjectURL(photo.blobs.thumb);
        previewUrls.current.set(id, url);
        setPreviews(new Map(previewUrls.current));
        const item: EditorPhoto = { id, width: photo.width, height: photo.height, ...(photo.takenAt ? { takenAt: photo.takenAt } : {}) };
        setForm((f) =>
          stepId
            ? { ...f, steps: f.steps.map((s) => (s.id === stepId ? { ...s, photo: item } : s)) }
            : canAddPhoto(f)
              ? { ...f, photos: [...f.photos, item] }
              : f,
        );
        await enqueueRecipePhoto({ id, userId, recipeId, stepId, photo });
      }
    },
    [recipeId, setForm],
  );

  const reorderPhotos = useCallback(
    (activeId: string, overId: string) =>
      setForm((f) => {
        const from = f.photos.findIndex((p) => p.id === activeId);
        const to = f.photos.findIndex((p) => p.id === overId);
        return from < 0 || to < 0 ? f : { ...f, photos: arrayMove(f.photos, from, to) };
      }),
    [setForm],
  );

  const removePhoto = useCallback(
    (id: string) => {
      const cur = formRef.current;
      const index = cur.photos.findIndex((p) => p.id === id);
      const step = cur.steps.find((s) => s.photo?.id === id);
      const photo = index >= 0 ? cur.photos[index] : step?.photo;
      if (!photo) return;
      setRemoved({ photo, stepId: step?.id, index, key: Date.now() });
      setForm((f) => ({
        ...f,
        photos: f.photos.filter((p) => p.id !== id),
        steps: f.steps.map((s) => (s.photo?.id === id ? { id: s.id, text: s.text } : s)),
      }));
    },
    [setForm],
  );

  const undoRemove = useCallback(() => {
    setRemoved((r) => {
      if (!r) return null;
      setForm((f) => {
        if (r.stepId) {
          return { ...f, steps: f.steps.map((s) => (s.id === r.stepId && !s.photo ? { ...s, photo: r.photo } : s)) };
        }
        if (!canAddPhoto(f)) return f;
        const photos = [...f.photos];
        photos.splice(Math.min(r.index, photos.length), 0, r.photo);
        return { ...f, photos };
      });
      return null;
    });
  }, [setForm]);

  // 提示條放一陣子就收起來
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(timer);
  }, [removed]);

  // ---- 其他欄位 ----
  const patchForm = useCallback((patch: Partial<EditorForm>) => setForm((f) => ({ ...f, ...patch })), [setForm]);
  // 新增的列回傳 ID，畫面用它把游標放進去
  const addStep = useCallback((): string | null => {
    if (!canAddStep(formRef.current)) return null;
    const step = newStep();
    setForm((f) => ({ ...f, steps: [...f.steps, step] }));
    return step.id;
  }, [setForm]);
  const addIngredient = useCallback((): string => {
    const ingredient = newIngredient();
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, ingredient] }));
    return ingredient.id;
  }, [setForm]);

  const reorderIngredients = useCallback(
    (activeId: string, overId: string) =>
      setForm((f) => {
        const from = f.ingredients.findIndex((i) => i.id === activeId);
        const to = f.ingredients.findIndex((i) => i.id === overId);
        return from < 0 || to < 0 ? f : { ...f, ingredients: arrayMove(f.ingredients, from, to) };
      }),
    [setForm],
  );
  const reorderSteps = useCallback(
    (activeId: string, overId: string) =>
      setForm((f) => {
        const from = f.steps.findIndex((s) => s.id === activeId);
        const to = f.steps.findIndex((s) => s.id === overId);
        return from < 0 || to < 0 ? f : { ...f, steps: arrayMove(f.steps, from, to) };
      }),
    [setForm],
  );
  const removeIngredient = useCallback(
    (id: string) => setForm((f) => ({ ...f, ingredients: f.ingredients.filter((i) => i.id !== id) })),
    [setForm],
  );
  // 刪步驟：有照片的話照片照原本的移除流程處理；步驟已經沒了，不出現「復原」提示
  const removeStep = useCallback(
    (id: string) => {
      const photo = formRef.current.steps.find((s) => s.id === id)?.photo;
      if (photo) {
        removePhoto(photo.id);
        setRemoved(null);
      }
      setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.id !== id) }));
    },
    [removePhoto, setForm],
  );

  // ---- 用說的 ----
  // entry：speak 是說了一段新的；organize 是 AI 不能用時原話放進了心得，之後按「讓大廚整理」用存著的原話再跑一次。
  // 成功：把整理好的內容填進欄位（作者填的原樣保留，新的標「新的」）。
  // 失敗：speak 把原話放進心得（照樣能發佈），organize 什麼都不動。回傳結果給畫面顯示。
  const runDictation = useCallback(
    async (text: string, entry: 'speak' | 'organize'): Promise<'ok' | 'unavailable'> => {
      const cur = formRef.current;
      const previous = dictationRef.current;
      const lang = 'zh-TW';
      const record = (): Dictation => (entry === 'organize' && previous ? previous : { text, lang, at: new Date().toISOString() });
      const remember = (d: Dictation) => {
        dictationRef.current = d;
        setDictation(d);
        if (d !== previous) {
          pendingDictation.current = d;
          setPrivateDirty(true);
        }
      };
      try {
        const res = await dictateRecipe({ text, lang, current: currentOf(cur, previous?.text) });
        const applied = applyResult(cur, res.result, previous?.text);
        setForm(() => applied.form);
        remember(record());
        aiFilledPending.current = true;
        track('record.dictation_used', { entry, result: 'ok' });
        track('record.ai_filled', { fieldCount: Math.min(applied.fieldCount, 10) });
        return 'ok';
      } catch {
        if (entry === 'speak') {
          setForm((f) => withRawDictation(f, text, previous?.text));
          remember(record());
        }
        track('record.dictation_used', { entry, result: 'unavailable' });
        return 'unavailable';
      }
    },
    [setForm],
  );

  // 發佈：先把最新的存好，再發佈
  const publish = useCallback(async (): Promise<Recipe | null> => {
    const saved = await save();
    // 存失敗、或有欄位超過長度（沒存進去）就不發佈
    if (!saved || Object.keys(buildPatch(savedForm.current, formRef.current)).length > 0) return null;
    try {
      const result = await publishRecipe(recipeId);
      const published = formRef.current;
      track('record.publish', {
        photoCount: Math.min(allPhotos(published).length, 30),
        hasSteps: published.steps.some((s) => s.text.trim() !== ''),
        visibility: published.visibility,
        highlightCount: Math.min(published.highlights.length, 20),
      });
      if (startedAsDraft.current) track('record.draft_published');
      savedRecipe.current = result;
      setRecipeState(result);
      queryClient.setQueryData(queryKeys.recipe(recipeId), result);
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      return result;
    } catch (error) {
      const { kind, onServer } = failureKind(error);
      setSaveFailedOnServer(onServer);
      void reportError(`recipe_publish_${kind}`, 'recipe-edit', 'warning');
      trackErrorKind(kind);
      setSaveState('error');
      return null;
    }
  }, [queryClient, recipeId, save]);

  const retryUploads = useCallback(() => void flushPendingPhotos(), []);

  return {
    form,
    setForm,
    patchForm,
    recipe: recipeState,
    isDraft,
    dirty,
    saveState,
    saveFailedOnServer,
    save,
    publish,
    previews,
    photoStatus,
    pendingCount,
    addPhotos,
    reorderPhotos,
    removePhoto,
    removed,
    undoRemove,
    addStep,
    addIngredient,
    reorderIngredients,
    reorderSteps,
    removeIngredient,
    removeStep,
    retryUploads,
    dictation,
    runDictation,
  };
}
