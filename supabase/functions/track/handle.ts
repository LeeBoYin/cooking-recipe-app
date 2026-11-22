// track 的處理流程（和 Deno.serve、Supabase 用戶端分開，才能單獨測試）。
// 白名單與檢查在 packages/core/src/track/events.ts，前端與這裡共用同一份。
import { validateBatch, type TrackBatch } from '../../../packages/core/src/index.ts';

export const MAX_BODY_BYTES = 64 * 1024;

export interface TrackDeps {
  // 寫進資料庫（public.track_events）。回傳寫進幾筆；失敗丟錯
  write(batch: TrackBatch, dropped: number): Promise<void>;
  now(): number;
}

export type TrackResult = { status: 204 } | { status: 400 | 413 | 500; error: string };

// 已登入由呼叫端確認。整批欄位不合格回 400；不合格的事件只丟掉、其他照收（回 204）
export async function handleTrack(deps: TrackDeps, rawBody: string): Promise<TrackResult> {
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return { status: 413, error: 'too_large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, error: 'invalid_input' };
  }
  const result = validateBatch(parsed, deps.now());
  if (!result) return { status: 400, error: 'invalid_input' };
  if (result.batch.events.length === 0 && result.dropped === 0) return { status: 204 };
  try {
    await deps.write(result.batch, result.dropped);
  } catch {
    return { status: 500, error: 'server_error' };
  }
  return { status: 204 };
}
