import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { InstallGuide } from './InstallGuide.tsx';
import { installMode, promptInstall } from './install.ts';

// 「我的」頁的「加到主畫面」：iPhone 看圖文教學，Android 直接叫出系統的安裝提示
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const [mode] = useState(() => installMode());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function install() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/45" onClick={onClose}>
      <div
        role="dialog"
        aria-label={intl.formatMessage({ id: 'onboarding.install.title' })}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-bg px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-sm bg-line-strong" />
        <h2 className="m-0 font-round text-card-title"><FormattedMessage id="onboarding.install.title" /></h2>
        <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="onboarding.install.body" /></p>
        {mode === 'ios' && <InstallGuide />}
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} className="flex h-12 flex-1 items-center justify-center rounded-card border-0 bg-surface text-body text-ink">
            <FormattedMessage id="common.close" />
          </button>
          {mode === 'prompt' && (
            <button type="button" disabled={busy} onClick={() => void install()} className="flex h-12 flex-1 items-center justify-center rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50">
              <FormattedMessage id="onboarding.install.button" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
