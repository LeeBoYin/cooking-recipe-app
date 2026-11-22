// 產品事件（14 第三節）：`track(名稱, 屬性)` 把事件放進佇列，每 10 秒送一次；
// 離開畫面（visibilitychange 變 hidden）時再送一次，用 fetch 加 keepalive（sendBeacon 不能帶 Authorization）。
// 屬性的型別由 packages/core 的白名單推導，送錯事件或值型別檢查就擋下。只記操作，不記內容。
// 沒登入不送；送不出去就丟掉。
import { newId, type TrackBatch, type TrackScreen, type TrackWireEvent } from '@zhusha/core';
import { platformFromUserAgent } from './errors.ts';
import { supabase } from './supabase.ts';
import { createTracker, type TrackArgs } from './trackQueue.ts';

const FLUSH_EVERY_MS = 10_000;

function isStandalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

async function send(events: TrackWireEvent[]): Promise<void> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return; // 沒登入：丟掉
  const batch: TrackBatch = {
    appVersion: __APP_VERSION__,
    platform: platformFromUserAgent(navigator.userAgent),
    installed: isStandalone(),
    events,
  };
  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track`, {
    method: 'POST',
    keepalive: true,
    headers: {
      authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify(batch),
  });
}

const tracker = createTracker({ now: () => Date.now(), newId, send });

export const track = tracker.track;
export const trackScreen = (screen: TrackScreen): void => tracker.setScreen(screen);
export type { TrackArgs };

let started = false;

// 登入後的畫面開始時呼叫一次；回傳停止用的函式
export function startTracking(): () => void {
  if (started) return () => undefined;
  started = true;
  tracker.foreground();
  const timer = window.setInterval(() => void tracker.flush(), FLUSH_EVERY_MS);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void tracker.flush();
    else tracker.foreground();
  };
  document.addEventListener('visibilitychange', onVisibility);
  // 登出：佇列裡的事件丟掉，下一位登入的人不會收到
  const { data } = supabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') tracker.clear();
  });
  return () => {
    started = false;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    data.subscription.unsubscribe();
  };
}
