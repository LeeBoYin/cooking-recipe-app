import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Outlet } from 'react-router';
import { useCurrentKitchen } from '../../data/hooks.ts';
import { Icon } from '../shell/Icon.tsx';
import { SegmentNav } from '../shell/SegmentNav.tsx';
import { KitchenSwitcher } from './KitchenSwitcher.tsx';

// 廚房：左邊是目前所在的廚房（點一下切換），右邊切換「食材」與「廚具」（02 資訊架構）
export function KitchenPage() {
  const intl = useIntl();
  const { kitchen, error } = useCurrentKitchen();
  const [switching, setSwitching] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="m-0 min-w-0 flex-1 font-round text-heading leading-tight font-bold">
          {kitchen ? (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={intl.formatMessage({ id: 'kitchen.switch.aria' }, { name: kitchen.name })}
              onClick={() => setSwitching(true)}
              className="flex min-h-11 max-w-full items-center gap-1 border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] font-bold text-ink"
            >
              <span className="truncate">{kitchen.name}</span>
              <Icon name="down" size={20} className="shrink-0" />
            </button>
          ) : error ? (
            <FormattedMessage id="home.loadError" />
          ) : (
            <FormattedMessage id="common.loading" />
          )}
        </h1>
        <SegmentNav
          ariaLabel={intl.formatMessage({ id: 'kitchen.tabs.aria' })}
          items={[
            { to: '/kitchen', end: true, label: <FormattedMessage id="kitchen.tab.pantry" /> },
            { to: '/kitchen/equipment', label: <FormattedMessage id="kitchen.tab.equipment" /> },
          ]}
        />
      </div>
      <Outlet />
      {switching && <KitchenSwitcher currentId={kitchen?.id} onClose={() => setSwitching(false)} />}
    </div>
  );
}
