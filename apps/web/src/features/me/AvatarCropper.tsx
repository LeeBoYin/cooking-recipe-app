import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampState,
  cropRect,
  initialState,
  pan,
  zoomAt,
  type CropState,
} from '../../photos/avatarCrop.ts';
import { processAvatar } from '../../photos/process.ts';

const MAX_FRAME = 300;

// 換大頭貼的圓框裁切（02 H 節）：拖曳移動、兩指縮放（桌機用滾輪或滑桿），按「使用」輸出 400px 正方形
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const intl = useIntl();
  // 網址要在 effect 裡建立與撤銷（StrictMode 會重跑 effect，不能用 useMemo 建）
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [state, setState] = useState<CropState>({ cx: 0, cy: 0, zoom: 1 });
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(MAX_FRAME);
  const area = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setFrame(Math.max(160, Math.min(MAX_FRAME, el.clientWidth - 48, el.clientHeight - 24)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const apply = (fn: (s: CropState, w: number, h: number) => CropState) => {
    if (!size) return;
    setState((s) => fn(s, size.w, size.h));
  };

  // 圓框中心在畫面上的位置，縮放時以手指中點為不動點
  const anchorOf = (clientX: number, clientY: number) => {
    const r = area.current?.getBoundingClientRect();
    return r ? { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = pointers.current.size === 2 ? distance() : null;
  };
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      apply((s, w, h) => pan(w, h, s, frame, e.clientX - prev.x, e.clientY - prev.y));
    } else if (pointers.current.size === 2 && pinch.current) {
      const now = distance();
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const mid = anchorOf((a.x + b.x) / 2, (a.y + b.y) / 2);
      const ratio = now / pinch.current;
      pinch.current = now;
      apply((s, w, h) => zoomAt(w, h, s, frame, s.zoom * ratio, mid.x, mid.y));
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = pointers.current.size === 2 ? distance() : null;
  };
  const onWheel = (e: WheelEvent) => {
    const a = anchorOf(e.clientX, e.clientY);
    apply((s, w, h) => zoomAt(w, h, s, frame, s.zoom * Math.exp(-e.deltaY / 400), a.x, a.y));
  };

  const confirm = async () => {
    if (!size || busy) return;
    setBusy(true);
    try {
      const blob = await processAvatar(file, cropRect(size.w, size.h, state));
      onDone(blob);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const scale = size ? frame / Math.min(size.w, size.h) * state.zoom : 1;

  return (
    <div role="dialog" aria-modal="true" aria-label={intl.formatMessage({ id: 'me.avatar.crop.title' })} className="fixed inset-0 z-50 flex flex-col bg-[#14100e] text-surface">
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button type="button" onClick={onCancel} className="h-11 border-0 bg-transparent text-body text-surface">
          <FormattedMessage id="common.cancel" />
        </button>
        <b className="text-body"><FormattedMessage id="me.avatar.crop.title" /></b>
        <button
          type="button"
          disabled={!size || busy}
          onClick={() => void confirm()}
          className="h-11 border-0 bg-transparent text-body font-bold text-bulb disabled:opacity-50"
        >
          <FormattedMessage id="me.avatar.crop.use" />
        </button>
      </div>

      <div
        ref={area}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="relative flex-1 touch-none select-none overflow-hidden"
      >
        <img
          src={url ?? undefined}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const w = e.currentTarget.naturalWidth;
            const h = e.currentTarget.naturalHeight;
            setSize({ w, h });
            setState(initialState(w, h));
          }}
          onError={() => setFailed(true)}
          style={{
            width: size?.w,
            height: size?.h,
            transform: size
              ? `translate(${-state.cx * scale}px, ${-state.cy * scale}px) scale(${scale})`
              : undefined,
          }}
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none origin-top-left"
        />
        <div
          aria-hidden="true"
          style={{ width: frame, height: frame, boxShadow: '0 0 0 999px rgba(20, 16, 14, 0.62)' }}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
        />
      </div>

      <div className="flex flex-col items-center gap-3 px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={state.zoom}
          disabled={!size}
          aria-label={intl.formatMessage({ id: 'me.avatar.crop.zoom' })}
          onChange={(e) => apply((s, w, h) => clampState(w, h, zoomAt(w, h, s, frame, Number(e.target.value))))}
          className="w-full max-w-xs accent-[#f2b705]"
        />
        {failed ? (
          <p role="alert" className="m-0 text-caption text-[#ffb4a8]"><FormattedMessage id="me.avatar.crop.error" /></p>
        ) : (
          <p className="m-0 text-center text-caption text-line"><FormattedMessage id="me.avatar.crop.hint" /></p>
        )}
      </div>
    </div>
  );
}
