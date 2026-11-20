import { usePhotoSync } from '../data/hooks.ts';

// 登入後放一個：打開 App 時續傳沒傳完的照片，傳完後更新畫面
export function PhotoSync() {
  usePhotoSync();
  return null;
}
