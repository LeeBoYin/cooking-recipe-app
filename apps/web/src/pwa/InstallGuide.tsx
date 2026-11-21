import { FormattedMessage } from 'react-intl';

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline align-[-3px]">
    <path d="M12 3v12M8 7l4-4 4 4M5 12v7h14v-7" />
  </svg>
);

// iPhone 的「加到主畫面」圖文教學三步驟：新手引導 ②、⑧ 與「我的」頁共用
export function InstallGuide() {
  return (
    <ol className="m-0 flex list-none flex-col gap-4 rounded-chef bg-surface p-4">
      {(['1', '2', '3'] as const).map((n) => (
        <li key={n} className="flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bulb text-[14px] font-bold">{n}</span>
          <div className="flex flex-col gap-1">
            <b className="text-body">
              <FormattedMessage id={`onboarding.install.ios.${n}`} />
              {n === '1' && <> <ShareIcon /></>}
            </b>
            <span className="text-caption leading-normal text-ink-muted"><FormattedMessage id={`onboarding.install.ios.${n}.hint`} /></span>
          </div>
        </li>
      ))}
    </ol>
  );
}
