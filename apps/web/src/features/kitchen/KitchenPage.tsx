import { FormattedMessage } from 'react-intl';
import { NavLink, Outlet } from 'react-router';
import { useCurrentKitchen } from '../../data/hooks.ts';

// 廚房：頂端是目前所在的廚房，下方切換「食材」與「廚具」（02 資訊架構）
export function KitchenPage() {
  const { kitchen, error } = useCurrentKitchen();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-card text-body no-underline ${
      isActive ? 'bg-bulb-soft font-bold text-ink' : 'bg-surface text-ink-muted'
    }`;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 font-round text-heading leading-tight font-bold">
        {kitchen ? kitchen.name : error ? <FormattedMessage id="home.loadError" /> : <FormattedMessage id="common.loading" />}
      </h1>
      <div className="flex gap-2">
        <NavLink to="/kitchen" end className={tab}><FormattedMessage id="kitchen.tab.pantry" /></NavLink>
        <NavLink to="/kitchen/equipment" className={tab}><FormattedMessage id="kitchen.tab.equipment" /></NavLink>
      </div>
      <Outlet />
    </div>
  );
}
