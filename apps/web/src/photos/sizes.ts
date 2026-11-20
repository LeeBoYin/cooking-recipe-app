// 三種尺寸與裁切的計算（純函式，方便測試）。長邊：原圖 1600px、動態圖 1080px、縮圖 400px（04 ADR-06）。

export const PHOTO_SIZES = { original: 1600, feed: 1080, thumb: 400 } as const;
export type PhotoVariant = keyof typeof PHOTO_SIZES;

export type Crop = { x: number; y: number; width: number; height: number };

// 裁切比例：寬 / 高。正方形、直式 4:5、橫式 5:4
export const ASPECT = { square: 1, portrait: 4 / 5, landscape: 5 / 4 } as const;
export type AspectName = keyof typeof ASPECT;

// 置中裁切成指定比例，盡量保留最大範圍
export function centerCrop(width: number, height: number, aspect: number): Crop {
  let w = width;
  let h = Math.round(w / aspect);
  if (h > height) {
    h = height;
    w = Math.round(h * aspect);
  }
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}

// 長邊縮到上限；原圖不夠大就維持原尺寸，不放大
export function fitLongEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
