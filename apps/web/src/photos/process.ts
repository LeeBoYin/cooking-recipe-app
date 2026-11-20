// 選好照片之後，在手機端處理：先讀拍攝時間 → 解碼並轉正 → （廚具照片才裁切）→ 產生三種尺寸的 WebP。
// 重新編碼會拿掉 EXIF（含 GPS），只留下我們另外讀出的拍攝時間。
import { encodeWebp } from './encode.ts';
import { readTakenAt } from './exif.ts';
import { ASPECT, PHOTO_SIZES, centerCrop, fitLongEdge, type AspectName, type PhotoVariant } from './sizes.ts';

export type ProcessedPhoto = {
  blobs: Record<PhotoVariant, Blob>;
  width: number; // 原圖（裁切後）的尺寸
  height: number;
  takenAt?: string; // ISO 時間
};

// aspect 給 'none' 就不裁切（食譜照片）；廚具照片裁成正方形
export async function processPhoto(file: Blob, aspect: AspectName | 'none' = 'square'): Promise<ProcessedPhoto> {
  const takenAt = readTakenAt(await file.arrayBuffer());
  // from-image：依 EXIF 的方向轉正，之後的 canvas 不再帶方向資訊
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const crop =
      aspect === 'none'
        ? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
        : centerCrop(bitmap.width, bitmap.height, ASPECT[aspect]);
    const original = fitLongEdge(crop.width, crop.height, PHOTO_SIZES.original);

    const blobs = {} as Record<PhotoVariant, Blob>;
    let size = original;
    for (const variant of ['original', 'feed', 'thumb'] as const) {
      size = fitLongEdge(original.width, original.height, PHOTO_SIZES[variant]);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
      blobs[variant] = await encodeWebp(canvas);
    }
    return { blobs, width: original.width, height: original.height, takenAt: takenAt?.toISOString() };
  } finally {
    bitmap.close();
  }
}
