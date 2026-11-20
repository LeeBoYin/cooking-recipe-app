// 照片（photos 表＋私有 bucket）。權限由資料庫的 RLS 與 Storage 規則判斷，這裡只負責讀寫。
// 目前只有廚具照片：一件廚具一張，路徑與資料列的對應由資料庫檢查。
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type Photo = Row<'photos'>;

const BUCKET = 'photos';

export async function listEquipmentPhotos(kitchenId: string): Promise<Photo[]> {
  const { data, error } = await supabase()
    .from('photos')
    .select('*')
    .eq('kitchen_id', kitchenId)
    .eq('owner_type', 'equipment');
  if (error) throw error;
  return data;
}

export type NewEquipmentPhotoRow = {
  id: string;
  kitchenId: string;
  equipmentId: string;
  width: number;
  height: number;
  takenAt?: string;
};

export function kitchenPhotoPaths(kitchenId: string, id: string) {
  const base = `kitchens/${kitchenId}/${id}`;
  return { storage: `${base}.webp`, feed: `${base}_feed.webp`, thumb: `${base}_thumb.webp` };
}

// 三個檔案都上傳完才建立資料列。同一件廚具已有照片時先刪掉舊的（一件一張），回傳舊的路徑讓呼叫者清檔案。
// 重送同一個 id 不會重複建立（主鍵衝突視為已寫入）。
export async function commitEquipmentPhoto(row: NewEquipmentPhotoRow): Promise<string[]> {
  const db = supabase();
  const { data: old, error: delError } = await db
    .from('photos')
    .delete()
    .eq('owner_type', 'equipment')
    .eq('owner_id', row.equipmentId)
    .neq('id', row.id)
    .select('storage_path, feed_path, thumb_path');
  if (delError) throw delError;

  const paths = kitchenPhotoPaths(row.kitchenId, row.id);
  const { error } = await db.from('photos').insert({
    id: row.id,
    kitchen_id: row.kitchenId,
    owner_type: 'equipment',
    owner_id: row.equipmentId,
    storage_path: paths.storage,
    feed_path: paths.feed,
    thumb_path: paths.thumb,
    width: row.width,
    height: row.height,
    taken_at: row.takenAt ?? null,
  });
  if (error && error.code !== '23505') throw error;
  return old.flatMap((p) => [p.storage_path, p.feed_path, p.thumb_path]);
}

// 移除一張照片：先刪資料列，再盡力清檔案（清不掉的由之後的維護工作掃孤兒檔）
export async function deletePhoto(photo: Photo): Promise<void> {
  const { error } = await supabase().from('photos').delete().eq('id', photo.id);
  if (error) throw error;
  await removeFiles([photo.storage_path, photo.feed_path, photo.thumb_path]);
}

export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase().storage.from(BUCKET).remove(paths);
}

export async function uploadFile(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
  if (error) throw error;
}

// 簽名網址：到期時間對齊「後天凌晨」（當地時間），同一天內不重新簽，瀏覽器的快取才用得上。
// 這個快取只在這次開啟 App 期間有效。
const urlCache = new Map<string, { url: string; expiresAt: number }>();

function expiryAfterTomorrow(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
}

export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit && hit.expiresAt - now > 3_600_000) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length > 0) {
    const expires = expiryAfterTomorrow();
    const seconds = Math.floor((expires.getTime() - now) / 1000);
    const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(missing, seconds);
    if (error) throw error;
    for (const item of data) {
      if (item.path && item.signedUrl) {
        urlCache.set(item.path, { url: item.signedUrl, expiresAt: expires.getTime() });
        out[item.path] = item.signedUrl;
      }
    }
  }
  return out;
}
