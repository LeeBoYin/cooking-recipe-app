// 照片上傳：壓縮好的照片先暫存在手機（IndexedDB），上傳成功才刪；關掉 App 再回來會自動續傳（04 ADR-06）。
// 這不是離線模式：暫存只保護「正在送出的內容」，不能在沒網路時瀏覽資料。
import { createStore, del, entries, set } from 'idb-keyval';
import { commitEquipmentPhoto, kitchenPhotoPaths, removeFiles, uploadFile } from '../data/photos.ts';
import type { ProcessedPhoto } from './process.ts';

type Pending = {
  id: string;
  kitchenId: string;
  equipmentId: string;
  photo: ProcessedPhoto;
  createdAt: number;
};

export type UploadProgress = { equipmentId: string; done: number; total: number; failed: boolean };
export type UploadState = ReadonlyMap<string, UploadProgress>;

const store = () => createStore('zhusha-photos', 'pending');
const STEPS = 4; // 三個檔案＋建立資料列
const RETRIES = 3;

let state: UploadState = new Map();
const stateListeners = new Set<() => void>();
const committedListeners = new Set<(kitchenId: string) => void>();

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
  const paths = kitchenPhotoPaths(p.kitchenId, p.id);
  const progress = (done: number, failed = false) =>
    setProgress(p.id, { equipmentId: p.equipmentId, done, total: STEPS, failed });
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
      const pending = (await entries<string, Pending>(store())).map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
      for (const p of pending) await send(p);
    } finally {
      flushing = undefined;
    }
  })();
  return flushing;
}

export async function enqueueEquipmentPhoto(args: {
  id: string;
  kitchenId: string;
  equipmentId: string;
  photo: ProcessedPhoto;
}): Promise<void> {
  await set(args.id, { ...args, createdAt: Date.now() } satisfies Pending, store());
  setProgress(args.id, { equipmentId: args.equipmentId, done: 0, total: STEPS, failed: false });
  // 如果有一輪正在跑，等它跑完再跑一輪，才會包含新加入的
  void (flushing ?? Promise.resolve()).then(() => flushPendingPhotos());
}

// 網路恢復時續傳
if (typeof window !== 'undefined') window.addEventListener('online', () => void flushPendingPhotos());
