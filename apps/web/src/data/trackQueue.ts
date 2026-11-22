// 產品事件的佇列、批次與 session（14 第三節）。不碰網路也不碰瀏覽器，送出的方式由呼叫端注入，方便測試。
// 送不出去就丟掉，不重試、不暫存。
import { TRACK_MAX_BATCH, type TrackEventName, type TrackProps, type TrackScreen, type TrackWireEvent } from '@zhusha/core';

export const SESSION_IDLE_MS = 30 * 60_000;
// 記憶體裡最多留這麼多；送不出去的一直堆下去時，丟最舊的
export const QUEUE_LIMIT = 500;

export interface TrackerDeps {
  now(): number;
  newId(): string;
  // 送一批；丟錯或回傳 false 都當作失敗（直接丟掉這批）
  send(events: TrackWireEvent[]): Promise<unknown>;
}

export type TrackArgs<N extends TrackEventName> = keyof TrackProps<N> extends never ? [props?: undefined] : [props: TrackProps<N>];

export function createTracker(deps: TrackerDeps) {
  let queue: TrackWireEvent[] = [];
  let sessionId: string | null = null;
  let lastActivity = 0;
  let screen: TrackScreen | undefined;
  let sending: Promise<void> = Promise.resolve();

  // 30 分鐘沒動作就換一個 session；回傳是不是新的一次
  function touch(): boolean {
    const now = deps.now();
    const fresh = sessionId === null || now - lastActivity > SESSION_IDLE_MS;
    if (fresh) sessionId = deps.newId();
    lastActivity = now;
    return fresh;
  }

  function push(name: string, props: Record<string, string | number | boolean> | undefined, at: TrackScreen | undefined) {
    touch();
    const event: TrackWireEvent = { name, sessionId: sessionId as string, at: new Date(deps.now()).toISOString() };
    if (at) event.screen = at;
    if (props && Object.keys(props).length > 0) event.props = props;
    queue.push(event);
    if (queue.length > QUEUE_LIMIT) queue = queue.slice(queue.length - QUEUE_LIMIT);
  }

  return {
    track<N extends TrackEventName>(name: N, ...args: TrackArgs<N>): void {
      push(name, args[0] as Record<string, string | number | boolean> | undefined, screen);
    },
    // 換頁：記下目前的畫面，之後的事件都帶它
    setScreen(next: TrackScreen): void {
      // 同一個畫面 0.5 秒內重複換頁（例如開發模式的重複掛載）只記一次
      const last = queue.at(-1);
      screen = next;
      if (last?.name === 'screen.view' && last.screen === next && deps.now() - Date.parse(last.at) < 500) return;
      push('screen.view', undefined, next);
    },
    // 回到前景（或第一次打開）：30 分鐘內算同一次，超過才記 app.open
    foreground(): void {
      if (touch()) push('app.open', undefined, screen);
    },
    // 送出最多一批（50 個），剩下的留到下一批。同時只送一批
    flush(): Promise<void> {
      sending = sending.then(async () => {
        const batch = queue.slice(0, TRACK_MAX_BATCH);
        if (batch.length === 0) return;
        queue = queue.slice(batch.length);
        try {
          await deps.send(batch);
        } catch {
          // 丟掉，不重試
        }
      });
      return sending;
    },
    pending: () => queue.length,
    clear(): void {
      queue = [];
    },
  };
}
