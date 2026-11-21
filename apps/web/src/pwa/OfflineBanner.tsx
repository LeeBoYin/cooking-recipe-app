import { useSyncExternalStore } from 'react';
import { FormattedMessage } from 'react-intl';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

// 網路斷了只顯示提示，不做離線功能（04 ADR-02）；恢復後自動消失。
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-ink px-4 pt-[calc(8px+env(safe-area-inset-top))] pb-2 text-center text-caption text-surface"
    >
      <FormattedMessage id="pwa.offline" />
    </div>
  );
}
