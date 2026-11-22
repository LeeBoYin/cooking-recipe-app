// `error` 產品事件（14）：只分 4 類，不記錯誤的內容、位置或代號。
// 詳細的錯誤紀錄仍走 errors.ts 的 reportError（`error_logs`），兩邊的分工見 14。
import type { TrackProps } from '@zhusha/core';
import { track } from './track.ts';

type ErrorKind = TrackProps<'error'>['kind'];

export function trackError(kind: ErrorKind): void {
  track('error', { kind });
}

// 儲存食譜失敗的代號（useRecipeEditor 的 failureKind）→ 類別：沒連上網是 network，資料庫拒絕權限是 permission，其他不記
export function trackErrorKind(kind: string): void {
  if (kind === 'network') trackError('network');
  else if (kind === 'pg_42501' || /permission|forbidden|not_allowed|rls/.test(kind)) trackError('permission');
}

// AI 失敗的代號 → 類別：被擋下（拒絕、被截斷、輸出沒過檢查）與沒連上網；其他（額度、速率、伺服器）不記
export function trackAiError(code: string): void {
  if (code === 'refused' || code === 'truncated' || code === 'invalid_output') trackError('ai_blocked');
  else if (code === 'network') trackError('network');
}
