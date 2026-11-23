import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, NavLink, Outlet } from 'react-router';
import { Sheet } from '../../ui/Sheet.tsx';
import { Icon, type IconName } from './Icon.tsx';

const TABS: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/', icon: 'home', label: 'tab.home', end: true },
  { to: '/recipes', icon: 'recipes', label: 'tab.recipes' },
  { to: '/record', icon: 'plus', label: 'tab.record' },
  { to: '/kitchen', icon: 'kitchen', label: 'tab.kitchen' },
  { to: '/me', icon: 'me', label: 'tab.me' },
];

// 登入後的外殼：內容在上、底部分頁列在下（17 第四節）。分頁沒有標題列。
// 「＋記錄」打開的選單：記錄一道菜（直接打開編輯頁）、從網址匯入
function RecordMenu({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const row = 'flex min-h-14 flex-col justify-center rounded-card bg-surface px-4 py-2 text-ink no-underline';
  return (
    <Sheet label={intl.formatMessage({ id: 'record.menu.title' })} onClose={onClose}>
      {(requestClose) => (
        <div className="flex flex-col gap-2">
          <Link to="/recipes/new" onClick={requestClose} className={row}>
            <b className="text-body"><FormattedMessage id="record.menu.write" /></b>
            <span className="text-small text-ink-muted"><FormattedMessage id="record.menu.write.hint" /></span>
          </Link>
          <Link to="/recipes/import" onClick={requestClose} className={row}>
            <b className="text-body"><FormattedMessage id="record.menu.import" /></b>
            <span className="text-small text-ink-muted"><FormattedMessage id="record.menu.import.hint" /></span>
          </Link>
        </div>
      )}
    </Sheet>
  );
}

export function AppShell() {
  const [recordOpen, setRecordOpen] = useState(false);
  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(88px+env(safe-area-inset-bottom))]">
      <Outlet />
      <nav
        aria-label="main"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-[560px] grid-cols-5 items-end bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((tab) =>
          tab.icon === 'plus' ? (
            <button key={tab.to} type="button" aria-haspopup="dialog" onClick={() => setRecordOpen(true)} className="relative -mt-3 flex min-h-14 flex-col items-center justify-end border-0 bg-transparent pb-2 font-[inherit] no-underline">
              <span className="flex size-12 items-center justify-center rounded-full border-2 border-ink bg-bulb text-ink">
                <Icon name="plus" />
              </span>
              <span className="mt-0.5 text-tab font-bold text-ink">
                <FormattedMessage id={tab.label} />
              </span>
            </button>
          ) : (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-14 items-center justify-center no-underline ${
                  isActive ? 'font-bold text-ink' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 ${isActive ? 'bg-bulb-soft' : ''}`}>
                    <Icon name={tab.icon} />
                    <span className="text-tab">
                      <FormattedMessage id={tab.label} />
                    </span>
                  </span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
      {recordOpen && <RecordMenu onClose={() => setRecordOpen(false)} />}
    </div>
  );
}
