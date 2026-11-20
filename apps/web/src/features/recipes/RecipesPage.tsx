import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, NavLink, Outlet } from 'react-router';
import { Icon } from '../shell/Icon.tsx';

// 食譜分頁：「我的食譜｜收藏」分段加「更多」（只有最近刪除）。沒有檢視切換，也沒有篩選（17 我的食譜）
export function RecipesPage() {
  const intl = useIntl();
  const [menu, setMenu] = useState(false);
  const seg = ({ isActive }: { isActive: boolean }) =>
    `flex h-9 flex-1 items-center justify-center rounded-[8px] text-[15px] no-underline ${isActive ? 'bg-surface font-bold text-ink' : 'text-ink-muted'}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <nav aria-label={intl.formatMessage({ id: 'recipes.tabs.aria' })} className="flex flex-1 gap-1 rounded-[12px] bg-line-soft p-1">
          <NavLink to="/recipes" end className={seg}><FormattedMessage id="recipes.tab.mine" /></NavLink>
          <NavLink to="/recipes/saved" className={seg}><FormattedMessage id="recipes.tab.saved" /></NavLink>
        </nav>
        <div className="relative">
          <button
            type="button"
            aria-label={intl.formatMessage({ id: 'recipes.more' })}
            aria-expanded={menu}
            onClick={() => setMenu((o) => !o)}
            className="flex size-11 items-center justify-center rounded-card border-0 bg-surface text-ink"
          >
            <Icon name="more" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden="true" />
              <div className="absolute top-12 right-0 z-20 w-56 rounded-card bg-surface px-3 shadow-[0_2px_12px_rgba(43,38,34,0.12)]">
                <Link to="/recipes/deleted" className="flex h-12 items-center text-body text-ink no-underline">
                  <FormattedMessage id="recipes.deleted" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
