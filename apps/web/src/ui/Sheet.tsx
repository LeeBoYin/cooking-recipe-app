import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

// 底部抽屜的共用外框（點子抽屜、單選、列出要買的、安裝教學都用它）。
// 可拖曳關閉：
// - 把手永遠能拖；內容在最上面（scrollTop 為 0）時，往下拉也是拖抽屜，否則是捲內容。
// - 跟手：抽屜位移等於手指位移，背景遮罩跟著變淡。
// - 放開時位移超過抽屜高度的 25%，或往下速度超過 0.5px/ms 就關；沒過就彈回（拖到一半推回去也算沒過）。
// - prefers-reduced-motion：不放動畫，直接關或回原位。
// 打開：抽屜從下方滑上來、遮罩淡入（reduced-motion 直接出現）。
// 關閉（按鈕、遮罩、Escape、拖曳）一律先滑下去、遮罩淡出，動畫結束才呼叫 onClose 讓上層卸載；
// 內容裡的按鈕要關抽屜時，用 children 的函式形式拿到 requestClose，不要直接把上層的狀態清掉（那樣會沒有關閉動畫）。
// locked：做事做到一半不能關（遮罩、Escape、拖曳都不會關）；內容裡的按鈕拿到的函式一定會關，做完自己關。
// 內容放在可捲動的 body 裡，把手固定在上方。
const CLOSE_RATIO = 0.25;
const CLOSE_VELOCITY = 0.5; // px/ms
const SLOP = 6; // 手指移動超過這個距離才判斷是拖還是捲
const ANIM_MS = 220; // 和下層頁轉場同一組：約 220ms、ease-out

type Drag = { x: number; y: number; decided: boolean; active: boolean; fromHandle: boolean; samples: { t: number; y: number }[]; offset: number };

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Sheet({
  label,
  onClose,
  locked = false,
  children,
}: {
  label: string;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const closing = useRef(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const slideTo = (offset: number, fade: number) => {
    const panelEl = panel.current;
    const backdropEl = backdrop.current;
    if (!panelEl || !backdropEl) return;
    panelEl.style.transition = `transform ${ANIM_MS}ms ease-out`;
    panelEl.style.transform = offset === 0 ? '' : `translateY(${offset}px)`;
    backdropEl.style.transition = `opacity ${ANIM_MS}ms ease-out`;
    backdropEl.style.opacity = String(fade);
  };

  // 先滑下去再呼叫 onClose；已經在關（含拖曳已經帶出去）就不重複
  const closeNow = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const panelEl = panel.current;
    if (reduced() || !panelEl) {
      closeRef.current();
      return;
    }
    slideTo(panelEl.offsetHeight || 1, 0);
    closeTimer.current = window.setTimeout(() => closeRef.current(), ANIM_MS);
  }, []);
  // 遮罩、Escape、拖曳用這個：鎖住的時候不關
  const requestClose = useCallback(() => {
    if (!lockedRef.current) closeNow();
  }, [closeNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // 打開：先放在畫面下方、遮罩全透明，下一個 frame 再滑上來
  useLayoutEffect(() => {
    const panelEl = panel.current;
    const backdropEl = backdrop.current;
    if (!panelEl || !backdropEl || reduced()) return;
    panelEl.style.transition = 'none';
    panelEl.style.transform = 'translateY(100%)';
    backdropEl.style.transition = 'none';
    backdropEl.style.opacity = '0';
    void panelEl.offsetHeight; // 強制 reflow，讓起點生效
    slideTo(0, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const panelEl = panel.current;
    const backdropEl = backdrop.current;
    const bodyEl = body.current;
    const handleEl = handle.current;
    if (!panelEl || !backdropEl || !bodyEl || !handleEl) return;
    let drag: Drag | null = null;

    function place(offset: number, animate: boolean, fade: number) {
      const tr = animate ? `${ANIM_MS}ms ease-out` : 'none';
      panelEl!.style.transition = animate ? `transform ${tr}` : 'none';
      panelEl!.style.transform = offset === 0 ? '' : `translateY(${offset}px)`;
      backdropEl!.style.transition = animate ? `opacity ${tr}` : 'none';
      backdropEl!.style.opacity = String(fade);
    }

    function start(x: number, y: number, t: number, target: EventTarget | null) {
      if (closing.current || lockedRef.current) return;
      drag = { x, y, decided: false, active: false, fromHandle: target instanceof Node && handleEl!.contains(target), samples: [{ t, y }], offset: 0 };
    }

    // 回傳 true 代表這次移動是拖抽屜（呼叫端要擋掉原本的捲動）
    function move(x: number, y: number, t: number): boolean {
      if (!drag) return false;
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (!drag.decided) {
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return false;
        drag.decided = true;
        drag.active = dy > 0 && Math.abs(dy) > Math.abs(dx) && (drag.fromHandle || bodyEl!.scrollTop <= 0);
        if (!drag.active) {
          drag = null;
          return false;
        }
      }
      drag.offset = Math.max(0, dy);
      drag.samples.push({ t, y });
      if (drag.samples.length > 6) drag.samples.shift();
      const h = panelEl!.offsetHeight || 1;
      place(drag.offset, false, Math.max(0, 1 - drag.offset / h));
      return true;
    }

    function end() {
      const d = drag;
      drag = null;
      if (!d || !d.active) return;
      const first = d.samples[0]!;
      const last = d.samples[d.samples.length - 1]!;
      const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      const h = panelEl!.offsetHeight || 1;
      if (d.offset > h * CLOSE_RATIO || velocity > CLOSE_VELOCITY) {
        requestClose();
      } else if (reduced()) {
        place(0, false, 1);
      } else {
        place(0, true, 1);
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length === 1 && t) start(t.clientX, t.clientY, e.timeStamp, e.target);
      else drag = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && move(t.clientX, t.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      handleEl.setPointerCapture(e.pointerId);
      start(e.clientX, e.clientY, e.timeStamp, e.target);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') move(e.clientX, e.clientY, e.timeStamp);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') end();
    };

    panelEl.addEventListener('touchstart', onTouchStart, { passive: true });
    panelEl.addEventListener('touchmove', onTouchMove, { passive: false });
    panelEl.addEventListener('touchend', end);
    panelEl.addEventListener('touchcancel', end);
    handleEl.addEventListener('pointerdown', onPointerDown);
    handleEl.addEventListener('pointermove', onPointerMove);
    handleEl.addEventListener('pointerup', onPointerUp);
    handleEl.addEventListener('pointercancel', onPointerUp);
    return () => {
      panelEl.removeEventListener('touchstart', onTouchStart);
      panelEl.removeEventListener('touchmove', onTouchMove);
      panelEl.removeEventListener('touchend', end);
      panelEl.removeEventListener('touchcancel', end);
      handleEl.removeEventListener('pointerdown', onPointerDown);
      handleEl.removeEventListener('pointermove', onPointerMove);
      handleEl.removeEventListener('pointerup', onPointerUp);
      handleEl.removeEventListener('pointercancel', onPointerUp);
    };
  }, [requestClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div ref={backdrop} aria-hidden="true" onClick={requestClose} className="absolute inset-0 bg-ink/45" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col rounded-t-2xl bg-bg"
      >
        <div ref={handle} data-sheet-handle="" className="flex flex-none cursor-grab touch-none justify-center pt-2.5 pb-2">
          <span aria-hidden="true" className="h-[5px] w-10 rounded-sm bg-line-strong" />
        </div>
        <div ref={body} className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-5 pb-[calc(28px+env(safe-area-inset-bottom))]">
          {typeof children === 'function' ? children(closeNow) : children}
        </div>
      </div>
    </div>
  );
}
