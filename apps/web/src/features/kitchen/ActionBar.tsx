import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { Icon } from '../shell/Icon.tsx';

// 食材與廚具共用的動作列：左邊「快速盤點」（次要）、右邊「＋ 新增…」（主要）
export function ActionBar({ inventoryTo, addTo, inventoryId, addId }: { inventoryTo: string; addTo: string; inventoryId: string; addId: string }) {
  return (
    <div className="flex items-center justify-between">
      <Link to={inventoryTo} className="flex min-h-11 items-center text-caption text-ink-muted underline underline-offset-4">
        <FormattedMessage id={inventoryId} />
      </Link>
      <Link to={addTo} className="flex h-11 items-center gap-1 rounded-card bg-bulb px-4 text-body font-bold text-ink no-underline">
        <Icon name="plus" size={18} />
        <FormattedMessage id={addId} />
      </Link>
    </div>
  );
}
