import { FormattedMessage } from 'react-intl';
import { useRegisterSW } from 'virtual:pwa-register/react';

// 偵測到新版時由使用者決定何時更新（04 ADR-09）。
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] mx-auto flex max-w-[528px] items-center gap-3 rounded-card bg-surface p-3"
    >
      <p className="m-0 flex-1 text-caption">
        <FormattedMessage id="pwa.updateReady" />
      </p>
      <button
        type="button"
        className="h-11 rounded-card px-3 text-caption text-ink-muted"
        onClick={() => setNeedRefresh(false)}
      >
        <FormattedMessage id="pwa.later" />
      </button>
      <button
        type="button"
        className="h-11 rounded-card bg-bulb px-4 text-caption font-bold text-ink"
        onClick={() => void updateServiceWorker(true)}
      >
        <FormattedMessage id="pwa.reload" />
      </button>
    </div>
  );
}
