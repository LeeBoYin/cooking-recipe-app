import { useState, type CSSProperties } from 'react';
import { FormattedMessage } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { installMode } from '../../pwa/install.ts';
import { Icon, type IconName } from '../shell/Icon.tsx';
import { InstallStep } from './InstallStep.tsx';

// 小煙火：幾個彩色圓點，位置固定、不動（動畫之後和大廚的表情一起做，17 第八節）
const SPARKS: { left: number; top: number; size: number; color: string }[] = [
  { left: 70, top: 70, size: 10, color: 'bg-bulb' }, { left: 300, top: 60, size: 8, color: 'bg-tomato' },
  { left: 110, top: 40, size: 6, color: 'bg-green' }, { left: 270, top: 120, size: 12, color: 'bg-bulb' },
  { left: 60, top: 150, size: 7, color: 'bg-green' }, { left: 320, top: 170, size: 6, color: 'bg-tomato' },
  { left: 150, top: 30, size: 8, color: 'bg-tomato' }, { left: 240, top: 30, size: 6, color: 'bg-bulb' },
];

const TABS: { id: 'home' | 'recipes' | 'record' | 'kitchen' | 'me'; icon: IconName }[] = [
  { id: 'home', icon: 'home' },
  { id: 'recipes', icon: 'recipes' },
  { id: 'record', icon: 'plus' },
  { id: 'kitchen', icon: 'kitchen' },
  { id: 'me', icon: 'me' },
];

// ⑧ 收尾（12 ⑧）：先謝謝使用者，再用一頁讓人知道底部五個分頁各做什麼；還沒安裝的再提醒一次。
export function DoneStep({ onStart }: { onStart: () => void }) {
  const chef = useChef();
  const [showInstall, setShowInstall] = useState(false);
  // 進到這一頁時決定一次，之後從安裝頁回來也不變
  const [canInstall] = useState(() => installMode() !== null);

  if (showInstall) {
    return <InstallStep onDone={() => setShowInstall(false)} onAutoSkip={() => setShowInstall(false)} />;
  }

  return (
    <div className="relative flex flex-1 flex-col gap-3">
      {SPARKS.map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full ${s.color}`}
          style={{ left: `${(s.left / 390) * 100}%`, top: s.top - 44, width: s.size, height: s.size } as CSSProperties}
        />
      ))}
      <div className="flex justify-center pt-4"><Chef size={96} mood="happy" /></div>
      <h1 className="m-0 text-center font-round text-title"><FormattedMessage id="onboarding.done.title" /></h1>
      <p className="m-0 text-center font-round text-[15px] leading-relaxed">{chef.line('onboardDone')}</p>
      <ul className="m-0 mt-1 flex list-none flex-col rounded-chef bg-surface px-3.5 py-1">
        {TABS.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${t.id === 'record' ? 'bg-bulb' : 'bg-bulb-soft'}`}>
              <Icon name={t.icon} size={22} />
            </span>
            <span className="flex flex-col gap-0.5">
              <b className="text-[15px]"><FormattedMessage id={`onboarding.done.${t.id}`} /></b>
              <span className="text-[13px] leading-snug text-ink-muted"><FormattedMessage id={`onboarding.done.${t.id}.body`} /></span>
            </span>
          </li>
        ))}
      </ul>
      {canInstall && (
        <button type="button" onClick={() => setShowInstall(true)} className="flex min-h-9 items-center justify-center border-0 bg-transparent font-[inherit] text-[14px] text-ink-muted underline underline-offset-4">
          <FormattedMessage id="onboarding.done.install" />
        </button>
      )}
      <div className="mt-auto flex flex-col gap-1">
        <button type="button" onClick={onStart} className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink">
          <FormattedMessage id="onboarding.done.start" />
        </button>
      </div>
    </div>
  );
}
