import { FormattedMessage } from 'react-intl';
import { NavLink, Outlet } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';

const TABS: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/', icon: 'home', label: 'tab.home', end: true },
  { to: '/recipes', icon: 'recipes', label: 'tab.recipes' },
  { to: '/record', icon: 'plus', label: 'tab.record' },
  { to: '/kitchen', icon: 'kitchen', label: 'tab.kitchen' },
  { to: '/me', icon: 'me', label: 'tab.me' },
];

// 登入後的外殼：內容在上、底部分頁列在下（17 第四節）。分頁沒有標題列。
export function AppShell() {
  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(88px+env(safe-area-inset-bottom))]">
      <Outlet />
      <nav
        aria-label="main"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-[560px] grid-cols-5 items-end bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((tab) =>
          tab.icon === 'plus' ? (
            <NavLink key={tab.to} to={tab.to} className="relative -mt-3 flex min-h-14 flex-col items-center justify-end pb-2 no-underline">
              <span className="flex size-12 items-center justify-center rounded-full border-2 border-ink bg-bulb text-ink">
                <Icon name="plus" />
              </span>
              <span className="mt-0.5 text-tab font-bold text-ink">
                <FormattedMessage id={tab.label} />
              </span>
            </NavLink>
          ) : (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 no-underline ${
                  isActive ? 'font-bold text-ink' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-10 items-center justify-center rounded-full ${isActive ? 'bg-bulb-soft' : ''}`}>
                    <Icon name={tab.icon} />
                  </span>
                  <span className="text-tab">
                    <FormattedMessage id={tab.label} />
                  </span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
