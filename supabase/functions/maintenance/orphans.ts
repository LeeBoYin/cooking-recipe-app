// 孤兒照片檔的判斷（05 刪除與保留〈照片檔〉）。純函式，不碰網路，方便測試。
// 孤兒：Storage 裡有檔案，但 photos 表沒有任何一筆資料列用到它。
// 上傳成功但資料列建立失敗、資料列刪除後檔案沒清掉，都會留下孤兒。

export interface StoredFile {
  path: string;
  createdAt: Date;
}

export interface OrphanPlan {
  total: number;
  orphans: string[];
  // 為什麼不刪；有值時 orphans 仍列出找到的，但不應該執行刪除
  refusedReason?: 'too_many_orphans';
}

// 上傳完到資料列建立之間有空窗（草稿的照片先上傳、儲存時才建資料列），
// 所以太新的檔案一律不動
export const GRACE_MS = 24 * 60 * 60 * 1000;

// 照片不備份，所以程式或資料有問題時不能一次清掉大半的照片：
// 孤兒超過檔案總數一半（而且檔案夠多）就整批不刪，交給人看
export const MIN_FILES_FOR_GUARD = 20;
export const MAX_ORPHAN_RATIO = 0.5;

export function planOrphanRemoval(files: StoredFile[], referencedPaths: Set<string>, now: Date): OrphanPlan {
  const orphans = files
    .filter((f) => !referencedPaths.has(f.path) && now.getTime() - f.createdAt.getTime() >= GRACE_MS)
    .map((f) => f.path);
  const plan: OrphanPlan = { total: files.length, orphans };
  if (files.length > MIN_FILES_FOR_GUARD && orphans.length > files.length * MAX_ORPHAN_RATIO) {
    plan.refusedReason = 'too_many_orphans';
  }
  return plan;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 固定時間比對，避免從回應時間猜出通行證
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
