import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { action?: ToastAction; durationMs?: number };
type ToastState = { id: number; message: string; action?: ToastAction };

const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

const DEFAULT_MS = 4000;

// 共用的提示：一次一則，幾秒後自己消失，不擋操作（17〈提示〉）。
// 放在底部導覽上方、避開 safe area；aria-live 讓讀屏軟體念出來。
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, options?: ToastOptions) => {
    clearTimeout(timer.current);
    seq.current += 1;
    setToast({ id: seq.current, message, ...(options?.action ? { action: options.action } : {}) });
    timer.current = setTimeout(() => setToast(null), options?.durationMs ?? DEFAULT_MS);
  }, []);

  const action = toast?.action;
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[528px]"
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-2 rounded-card bg-ink px-4 py-2 text-caption text-surface"
          >
            <span>{toast.message}</span>
            {action && (
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  action.onClick();
                }}
                className="min-h-11 shrink-0 border-0 bg-transparent px-2 text-caption font-bold text-bulb underline underline-offset-4"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
