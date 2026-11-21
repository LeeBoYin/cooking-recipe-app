// 編輯頁的狀態與儲存：
// - 草稿：每次有改動就自動存（約 1 秒後），照片檔傳完才放進清單；
// - 已發佈：改了先放在畫面上，按「儲存」才更新（連照片也是）；
// - 衝突由資料層自動用最新版重送，畫面上不處理。M0 不暫存文字。
import { useQueryClient } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import { newId } from '@zhusha/core';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { queryKeys } from '../../data/hooks.ts';
import { currentUserId } from '../../data/account.ts';
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
import {
  allPhotos,
  buildPatch,
  canAddPhoto,
  canAddStep,
  emptyForm,
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

export function useRecipeEditor(recipeId: string, recipe: Recipe | null, photoRows: Photo[], initialTitle?: string, defaultServings?: number) {
  const queryClient = useQueryClient();
  const initial = useMemo(() => (recipe ? formFromRecipe(recipe, photoRows) : { ...emptyForm(defaultServings), title: initialTitle ?? '' }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setFormState] = useState<EditorForm>(initial);
  const formRef = useRef(form);
  const savedForm = useRef<EditorForm>(initial);
  const savedRecipe = useRef<Recipe | null>(recipe);
  const [recipeState, setRecipeState] = useState<Recipe | null>(recipe);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(new Map());
  const previewUrls = useRef(new Map<string, string>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const uploads = useSyncExternalStore(subscribeUploads, getUploadState);
  const uploaded = useSyncExternalStore(subscribeUploads, getUploadedPhotoIds);

  const isDraft = !recipeState || recipeState.status === 'draft';

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
      if (Object.keys(patch).length === 0 && !photosDiff) return savedRecipe.current;
      if (!savedRecipe.current && isBlank(current)) return null;
      if (overLimit(current)) return savedRecipe.current;
      setSaveState('saving');
      try {
        const options = photosDiff ? { photos: toPhotoInputs(current, ready) } : {};
        const result = savedRecipe.current
          ? await updateRecipe(recipeId, patch, savedRecipe.current.updated_at, options)
          : await createRecipe(patch, { id: recipeId, ...options });
        savedRecipe.current = result;
        setRecipeState(result);
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
      } catch {
        setSaveState('error');
        return savedRecipe.current;
      }
    };
    const next = chain.current.then(run, run);
    chain.current = next;
    return next;
  }, [queryClient, recipeId]);

  // 草稿自動存
  const dirtyKey = useMemo(() => `${JSON.stringify(form)}|${[...uploaded].join(',')}`, [form, uploaded]);
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
      Object.keys(buildPatch(savedForm.current, form)).length > 0 || photosChanged(savedForm.current, form, isReady),
    [form, isReady, recipeState], // eslint-disable-line react-hooks/exhaustive-deps
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

  // 發佈：先把最新的存好，再發佈
  const publish = useCallback(async (): Promise<Recipe | null> => {
    const saved = await save();
    // 存失敗、或有欄位超過長度（沒存進去）就不發佈
    if (!saved || Object.keys(buildPatch(savedForm.current, formRef.current)).length > 0) return null;
    try {
      const result = await publishRecipe(recipeId);
      savedRecipe.current = result;
      setRecipeState(result);
      queryClient.setQueryData(queryKeys.recipe(recipeId), result);
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      return result;
    } catch {
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
    retryUploads,
  };
}
