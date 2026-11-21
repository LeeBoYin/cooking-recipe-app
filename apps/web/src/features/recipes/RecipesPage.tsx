import { FormattedMessage, useIntl } from 'react-intl';
import { Outlet } from 'react-router';
import { SegmentNav } from '../shell/SegmentNav.tsx';

// 食譜分頁：「我的食譜｜收藏」分段。沒有檢視切換，也沒有篩選（17 我的食譜）
export function RecipesPage() {
  const intl = useIntl();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 justify-end">
          <SegmentNav
            ariaLabel={intl.formatMessage({ id: 'recipes.tabs.aria' })}
            items={[
              { to: '/recipes', end: true, label: <FormattedMessage id="recipes.tab.mine" /> },
              { to: '/recipes/saved', label: <FormattedMessage id="recipes.tab.saved" /> },
            ]}
          />
        </div>
      </div>
      <Outlet />
    </div>
  );
}
