// 大頭貼裁切的計算（純函式，方便測試）。
// 圓框是 frame × frame 的正方形；縮放 1 倍＝照片短邊剛好填滿圓框（不會露出空白）。
// 狀態用「圓框中心對到照片的哪個點（照片像素）」＋縮放倍數表示，換圓框大小時狀態不用重算。
import type { Crop } from './sizes.ts';

export const AVATAR_SIZE = 400;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export type CropState = { cx: number; cy: number; zoom: number };

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

// 圓框在照片上對到的正方形邊長（照片像素）
export function cropSide(imageW: number, imageH: number, zoom: number): number {
  return Math.min(imageW, imageH) / clampZoom(zoom);
}

// 拖曳或縮放後，確保正方形不超出照片
export function clampState(imageW: number, imageH: number, s: CropState): CropState {
  const zoom = clampZoom(s.zoom);
  const half = cropSide(imageW, imageH, zoom) / 2;
  return {
    zoom,
    cx: Math.min(imageW - half, Math.max(half, s.cx)),
    cy: Math.min(imageH - half, Math.max(half, s.cy)),
  };
}

export function initialState(imageW: number, imageH: number): CropState {
  return { cx: imageW / 2, cy: imageH / 2, zoom: MIN_ZOOM };
}

// 手指在畫面上移動 dx、dy（畫面像素）→ 照片要跟著移動，所以圓框中心反方向移動
export function pan(imageW: number, imageH: number, s: CropState, frame: number, dx: number, dy: number): CropState {
  const perPixel = cropSide(imageW, imageH, s.zoom) / frame;
  return clampState(imageW, imageH, { ...s, cx: s.cx - dx * perPixel, cy: s.cy - dy * perPixel });
}

// 以圓框內某一點（相對圓框中心的畫面像素）為不動點縮放
export function zoomAt(
  imageW: number,
  imageH: number,
  s: CropState,
  frame: number,
  zoom: number,
  anchorX = 0,
  anchorY = 0,
): CropState {
  const next = clampZoom(zoom);
  const before = cropSide(imageW, imageH, s.zoom) / frame;
  const after = cropSide(imageW, imageH, next) / frame;
  return clampState(imageW, imageH, {
    zoom: next,
    cx: s.cx + anchorX * (before - after),
    cy: s.cy + anchorY * (before - after),
  });
}

// 要從照片切下來的正方形（照片像素，整數）
export function cropRect(imageW: number, imageH: number, s: CropState): Crop {
  const c = clampState(imageW, imageH, s);
  const side = Math.min(Math.round(cropSide(imageW, imageH, c.zoom)), imageW, imageH);
  return {
    x: Math.min(imageW - side, Math.max(0, Math.round(c.cx - side / 2))),
    y: Math.min(imageH - side, Math.max(0, Math.round(c.cy - side / 2))),
    width: side,
    height: side,
  };
}
