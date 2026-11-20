// 錯誤回報（04 ADR-21）：只送錯誤類型、發生的位置、版本與平台，不送任何內容。
// 回報本身失敗時不再回報、也不丟錯，免得錯誤引發更多錯誤。
import { supabase } from "./supabase.ts";

export type ErrorSeverity = "info" | "warning" | "critical";
export type ErrorPlatform = "ios" | "android" | "desktop";

export function platformFromUserAgent(userAgent: string): ErrorPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

// 錯誤類型只能是小寫英數與底線（資料庫也會檢查）
export function toErrorKind(raw: string): string {
  const kind = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return kind || "unknown";
}

// 同一種錯誤一分鐘內只送一次；資料庫端另外有一小時的合併
const recentlySent = new Map<string, number>();
const RESEND_AFTER_MS = 60_000;

export async function reportError(
  kind: string,
  location: string,
  severity: ErrorSeverity = "warning",
): Promise<void> {
  const key = `${kind}|${location}|${severity}`;
  const now = Date.now();
  const last = recentlySent.get(key);
  if (last !== undefined && now - last < RESEND_AFTER_MS) return;
  recentlySent.set(key, now);
  try {
    await supabase().rpc("log_error", {
      p_kind: toErrorKind(kind),
      p_location: location.slice(0, 100),
      p_severity: severity,
      p_app_version: __APP_VERSION__,
      p_platform: platformFromUserAgent(navigator.userAgent),
    });
  } catch {
    // 回報失敗就算了
  }
}

// 沒被接住的錯誤也回報（畫面本身怎麼顯示，由各畫面決定）
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", () => {
    void reportError("unhandled_error", "window", "warning");
  });
  window.addEventListener("unhandledrejection", () => {
    void reportError("unhandled_rejection", "window", "warning");
  });
}
