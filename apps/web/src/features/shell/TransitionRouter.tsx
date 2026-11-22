import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { UNSAFE_createBrowserHistory as createBrowserHistory, Router, type Location, type NavigationType } from 'react-router';
import { decideTransition, systemBackAnimates } from './pageTransition.ts';

// 取代 <BrowserRouter>：react-router 8 只有 <RouterProvider>（資料路由）會用 View Transitions，
// 而且瀏覽器上一頁（POP）它不播。這裡自己接 history，在換畫面的那一刻包一層 document.startViewTransition。
// 動畫的樣子在 styles.css（html[data-vt]），判斷規則在 pageTransition.ts。

const MARK_MS = 1500;

function isStandalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0;
}

export function TransitionRouter({ isInner, children }: { isInner: (pathname: string) => boolean; children: ReactNode }) {
  const historyRef = useRef<ReturnType<typeof createBrowserHistory>>(null);
  historyRef.current ??= createBrowserHistory({ v5Compat: true });
  const history = historyRef.current;

  const [state, setState] = useState<{ action: NavigationType; location: Location }>({
    action: history.action,
    location: history.location,
  });
  const current = useRef({ location: history.location, idx: historyIdx() });
  const markedAt = useRef(0);
  const scrollByKey = useRef(new Map<string, number>());

  // App 內的 navigate(-1)（返回按鈕）會走到這裡，先做記號；手勢與瀏覽器的上一頁不會
  const nav = useMemo(
    () => ({
      createHref: history.createHref,
      encodeLocation: history.encodeLocation,
      push: history.push,
      replace: history.replace,
      go: (delta: number) => {
        if (delta < 0) markedAt.current = Date.now();
        history.go(delta);
      },
    }),
    [history],
  );

  useLayoutEffect(() => {
    // 捲動位置自己記，才能在轉場的換畫面那一刻還原
    const prevRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const scrollByKeyMap = scrollByKey.current;
    const unlisten = history.listen(({ action, location }) => {
      const prev = current.current;
      const nextIdx = historyIdx();
      scrollByKeyMap.set(prev.location.key, window.scrollY);
      const marked = Date.now() - markedAt.current < MARK_MS;
      markedAt.current = 0;
      const samePath = prev.location.pathname === location.pathname;
      current.current = { location, idx: nextIdx };

      const apply = () => {
        flushSync(() => setState({ action, location }));
        if (!samePath && action !== 'REPLACE') {
          window.scrollTo({ top: action === 'POP' ? (scrollByKeyMap.get(location.key) ?? 0) : 0, behavior: 'instant' });
        }
      };

      const direction = decideTransition({
        action,
        prevIdx: prev.idx,
        nextIdx,
        prevInner: isInner(prev.location.pathname),
        nextInner: isInner(location.pathname),
        marked,
        systemBackAnimates: systemBackAnimates(navigator.userAgent, isStandalone()),
      });
      if (!direction || typeof document.startViewTransition !== 'function') {
        apply();
        return;
      }
      const root = document.documentElement;
      root.dataset.vt = direction;
      const t = document.startViewTransition(apply);
      void t.finished.finally(() => {
        delete root.dataset.vt;
      });
    });
    return () => {
      unlisten();
      window.history.scrollRestoration = prevRestoration;
    };
  }, [history, isInner]);

  return (
    <Router location={state.location} navigationType={state.action} navigator={nav}>
      {children}
    </Router>
  );
}
