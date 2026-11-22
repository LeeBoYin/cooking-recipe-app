// 下層頁轉場的判斷（17 第九節）。只放不碰 DOM 的純函式，好測；轉場本身在 TransitionRouter。

export type TransitionDirection = 'forward' | 'back';

export interface TransitionInput {
  action: 'PUSH' | 'REPLACE' | 'POP';
  prevIdx: number;
  nextIdx: number;
  prevInner: boolean;
  nextInner: boolean;
  /** App 自己的「返回」按鈕（navigate(-1)）按下的，不是手勢或瀏覽器上一頁 */
  marked: boolean;
  /** 這個環境的返回手勢、上一頁已經有系統自己的動畫（Safari 瀏覽器），沒記號的 POP 就不播 */
  systemBackAnimates: boolean;
}

// 進入下層頁（含下層頁再進下層頁）往右滑入；離開下層頁反向；
// 主要畫面之間、取代（replace）都不播。
export function decideTransition(i: TransitionInput): TransitionDirection | null {
  if (i.action === 'REPLACE') return null;
  if (i.action === 'PUSH') return i.nextInner ? 'forward' : null;
  if (!i.marked && i.systemBackAnimates) return null;
  if (i.nextIdx < i.prevIdx) return i.prevInner ? 'back' : null;
  return i.nextInner ? 'forward' : null;
}

// iOS 上所有瀏覽器（含 Chrome）和加到主畫面的 App（standalone），以及 macOS 的 Safari，
// 往右滑返回都有系統動畫（會拍下畫面一起滑）。其他加到主畫面的環境沒有。
export function systemBackAnimates(ua: string, standalone: boolean): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  if (standalone) return false;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
}
