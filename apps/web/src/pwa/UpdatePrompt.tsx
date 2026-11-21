import { useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { hasUnsavedEdits } from './unsaved.ts';

const CHECK_MS = 60 * 60 * 1000;

// 偵測到新版時由使用者決定何時更新（04 ADR-09）。放在畫面上方，不會蓋到底部的分頁列與動作列。
// 已發佈的食譜改到一半（還沒儲存）時，按「重新整理」先提醒，不直接重載。
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // 久沒重新載入的 App（手機常常整天開著）也要能發現新版：每小時檢查一次，回到前景時也檢查
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
  const [warn, setWarn] = useState(false);

  if (!needRefresh) return null;

  const reload = () => {
    if (!warn && hasUnsavedEdits()) {
      setWarn(true);
      return;
    }
    void updateServiceWorker(true);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(12px+env(safe-area-inset-top))] z-50 mx-auto flex max-w-[528px] flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <p className="m-0 flex-1 text-caption">
          <FormattedMessage id={warn ? 'pwa.updateUnsaved' : 'pwa.updateReady'} />
        </p>
        <button
          type="button"
          className="h-11 rounded-card border-0 bg-transparent px-3 text-caption text-ink-muted"
          onClick={() => {
            setWarn(false);
            setNeedRefresh(false);
          }}
        >
          <FormattedMessage id={warn ? 'pwa.saveFirst' : 'pwa.later'} />
        </button>
        <button type="button" className="h-11 rounded-card border-0 bg-bulb px-4 text-caption font-bold text-ink" onClick={reload}>
          <FormattedMessage id={warn ? 'pwa.reloadAnyway' : 'pwa.reload'} />
        </button>
      </div>
    </div>
  );
}
