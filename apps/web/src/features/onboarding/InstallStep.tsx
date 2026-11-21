import { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { InstallGuide } from '../../pwa/InstallGuide.tsx';
import { Chef } from '../../chef/Chef.tsx';
import { installMode, promptInstall, type InstallMode } from '../../pwa/install.ts';

// ② 加到主畫面（12 ②）：iPhone 圖文教學、Android 系統的安裝提示；電腦或已經從主畫面打開就跳過。
// onDone：做完這一步（記成已完成）；onAutoSkip：這一步用不到，直接往下，不記。
export function InstallStep({ onDone, onAutoSkip }: { onDone: () => void; onAutoSkip: () => void }) {
  // 進到這一步時決定一次；Android 的安裝提示事件在進入這步之前就已經接住了
  const [mode] = useState<InstallMode>(() => installMode());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!mode) onAutoSkip();
  }, [mode, onAutoSkip]);
  if (!mode) return null;

  const install = async () => {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex justify-center pt-4"><Chef size={96} /></div>
      <h1 className="m-0 font-round text-display leading-[1.4]"><FormattedMessage id="onboarding.install.title" /></h1>
      <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="onboarding.install.body" /></p>
      {mode === 'ios' && <InstallGuide />}
      <div className="mt-auto flex flex-col gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => (mode === 'ios' ? onDone() : void install())}
          className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
        >
          <FormattedMessage id={mode === 'ios' ? 'onboarding.install.added' : 'onboarding.install.button'} />
        </button>
        <button type="button" disabled={busy} onClick={onDone} className="h-11 border-0 bg-transparent font-[inherit] text-[15px] text-ink-muted">
          <FormattedMessage id="onboarding.install.later" />
        </button>
      </div>
    </div>
  );
}
