import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Sheet } from '../ui/Sheet.tsx';
import { InstallGuide } from './InstallGuide.tsx';
import { installMode, promptInstall } from './install.ts';

// 「我的」頁的「加到主畫面」：iPhone 看圖文教學，Android 直接叫出系統的安裝提示
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const [mode] = useState(() => installMode());
  const [busy, setBusy] = useState(false);

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
    <Sheet label={intl.formatMessage({ id: 'onboarding.install.title' })} onClose={onClose}>
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
    </Sheet>
  );
}
