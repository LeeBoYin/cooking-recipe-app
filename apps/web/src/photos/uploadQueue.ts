// 照片上傳：壓縮好的照片先暫存在手機（IndexedDB），上傳成功才刪；關掉 App 再回來會自動續傳（04 ADR-06）。
// 這不是離線模式：暫存只保護「正在送出的內容」，不能在沒網路時瀏覽資料。
import { createStore, del, entries, set } from 'idb-keyval';
import { commitEquipmentPhoto, kitchenPhotoPaths, removeFiles, uploadFile, userPhotoPaths } from '../data/photos.ts';
import { attachPhotoToDraft } from '../data/recipes.ts';
import type { ProcessedPhoto } from './process.ts';

// 廚具照片：傳完三個檔案後直接建立資料列。
// 食譜照片：只傳三個檔案，資料列由儲存食譜（save_recipe 的 p_photos）建立；
//   編輯頁開著時由編輯頁接手，編輯頁已經關掉時補進草稿。
type Pending =
  | { kind: 'equipment'; id: string; kitchenId: string; equipmentId: string; photo: ProcessedPhoto; createdAt: number }
  | { kind: 'recipe'; id: string; userId: string; recipeId: string; stepId?: string; photo: ProcessedPhoto; createdAt: number };

// ownerId：廚具 ID 或食譜 ID
export type UploadProgress = { ownerId: string; done: number; total: number; failed: boolean };
export type UploadState = ReadonlyMap<string, UploadProgress>;

const store = () => createStore('zhusha-photos', 'pending');
const STEPS = 4; // 三個檔案＋建立資料列
const RETRIES = 3;

let state: UploadState = new Map();
let uploaded: ReadonlySet<string> = new Set();
const stateListeners = new Set<() => void>();
const committedListeners = new Set<(kitchenId: string) => void>();
// 食譜照片的檔案傳完了；回傳 true 表示編輯頁接手了
const recipeUploadedListeners = new Set<(p: { id: string; recipeId: string }) => boolean>();

function setProgress(id: string, p: UploadProgress | null) {
  const next = new Map(state);
  if (p) next.set(id, p);
  else next.delete(id);
  state = next;
  stateListeners.forEach((l) => l());
}

export const subscribeUploads = (l: () => void) => {
  stateListeners.add(l);
  return () => void stateListeners.delete(l);
};
export const getUploadState = (): UploadState => state;
// 這次開啟 App 期間，檔案已經傳完的食譜照片 ID
export const getUploadedPhotoIds = (): ReadonlySet<string> => uploaded;
export const onRecipePhotoUploaded = (l: (p: { id: string; recipeId: string }) => boolean) => {
  recipeUploadedListeners.add(l);
  return () => void recipeUploadedListeners.delete(l);
};
export const onPhotoCommitted = (l: (kitchenId: string) => void) => {
  committedListeners.add(l);
  return () => void committedListeners.delete(l);
};

// 重試也沒用的錯誤（權限、資料不存在、格式不對）：丟掉暫存；網路問題則保留，之後再試
function isPermanent(error: unknown): boolean {
  const e = error as { code?: string; status?: number; statusCode?: string | number } | null;
  const code = e?.code ?? '';
  if (code.startsWith('23') || code === '42501' || code === 'PGRST301') return true;
  const status = Number(e?.status ?? e?.statusCode);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isPermanent(e)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

async function send(p: Pending): Promise<void> {
  const paths = p.kind === 'equipment' ? kitchenPhotoPaths(p.kitchenId, p.id) : userPhotoPaths(p.userId, p.id);
  const ownerId = p.kind === 'equipment' ? p.equipmentId : p.recipeId;
  const total = p.kind === 'equipment' ? STEPS : STEPS - 1;
  const progress = (done: number, failed = false) => setProgress(p.id, { ownerId, done, total, failed });
  progress(0);
  const files: [string, Blob][] = [
    [paths.thumb, p.photo.blobs.thumb],
    [paths.feed, p.photo.blobs.feed],
    [paths.storage, p.photo.blobs.original],
  ];
  let done = 0;
  try {
    for (const [path, blob] of files) {
      await withRetry(() => uploadFile(path, blob));
      progress(++done);
    }
    if (p.kind === 'equipment') {
      const old = await withRetry(() =>
        commitEquipmentPhoto({
          id: p.id,
          kitchenId: p.kitchenId,
          equipmentId: p.equipmentId,
          width: p.photo.width,
          height: p.photo.height,
          takenAt: p.photo.takenAt,
        }),
      );
      await del(p.id, store());
      setProgress(p.id, null);
      committedListeners.forEach((l) => l(p.kitchenId));
      void removeFiles(old).catch(() => undefined);
    } else {
      await del(p.id, store());
      uploaded = new Set(uploaded).add(p.id);
      setProgress(p.id, null);
      const taken = [...recipeUploadedListeners].map((l) => l({ id: p.id, recipeId: p.recipeId })).some(Boolean);
      if (!taken) {
        void attachPhotoToDraft(p.recipeId, {
          id: p.id,
          owner_type: p.stepId ? 'recipe_step' : 'recipe',
          ...(p.stepId ? { owner_id: p.stepId } : {}),
          width: p.photo.width,
          height: p.photo.height,
          ...(p.photo.takenAt ? { taken_at: p.photo.takenAt } : {}),
        }).catch(() => undefined);
      }
    }
  } catch (e) {
    if (isPermanent(e)) {
      // 例如廚具在上傳期間被刪掉：丟掉暫存，也清掉已經傳上去的檔案
      await del(p.id, store());
      setProgress(p.id, null);
      void removeFiles(Object.values(paths)).catch(() => undefined);
    } else {
      progress(done, true); // 保留暫存，下次打開或網路恢復時再傳
    }
  }
}

let flushing: Promise<void> | undefined;

// 把暫存的照片傳完；同時只跑一次
export function flushPendingPhotos(): Promise<void> {
  flushing ??= (async () => {
    try {
      const pending = (await entries<string, Pending>(store()))
        .map(([, v]) => ((v as { kind?: string }).kind ? v : ({ ...(v as object), kind: 'equipment' } as Pending))) // 舊版暫存沒有 kind，一律是廚具照片
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const p of pending) await send(p);
    } finally {
      flushing = undefined;
    }
  })();
  return flushing;
}

async function enqueue(p: Pending): Promise<void> {
  await set(p.id, p, store());
  const ownerId = p.kind === 'equipment' ? p.equipmentId : p.recipeId;
  setProgress(p.id, { ownerId, done: 0, total: p.kind === 'equipment' ? STEPS : STEPS - 1, failed: false });
  // 如果有一輪正在跑，等它跑完再跑一輪，才會包含新加入的
  void (flushing ?? Promise.resolve()).then(() => flushPendingPhotos());
}

export function enqueueEquipmentPhoto(args: {
  id: string;
  kitchenId: string;
  equipmentId: string;
  photo: ProcessedPhoto;
}): Promise<void> {
  return enqueue({ kind: 'equipment', ...args, createdAt: Date.now() });
}

export function enqueueRecipePhoto(args: {
  id: string;
  userId: string;
  recipeId: string;
  stepId?: string; // 步驟照片才有
  photo: ProcessedPhoto;
}): Promise<void> {
  return enqueue({ kind: 'recipe', ...args, createdAt: Date.now() });
}

// 網路恢復時續傳
if (typeof window !== 'undefined') window.addEventListener('online', () => void flushPendingPhotos());
