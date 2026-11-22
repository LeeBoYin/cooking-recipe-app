import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import { Icon, type IconName } from '../shell/Icon.tsx';

export type CardBadge = 'expired' | 'soon' | 'useSoon';

const BADGE: Record<CardBadge, { icon: IconName; cls: string }> = {
  expired: { icon: 'clock', cls: 'text-error' },
  soon: { icon: 'clock', cls: 'text-ink' },
  useSoon: { icon: 'bulb', cls: 'text-ink' },
};

// 廚房清單的小卡片（食材、廚具共用）：圖示加名稱，不放標籤。
// 右上角最多一個狀態小圖示；編輯模式換成刪除鈕，卡片本身不進編輯頁。
export function ItemCard({
  to, name, visual, badge, editing, onRemove,
}: {
  to: string;
  name: string;
  visual: ReactNode;
  badge?: CardBadge;
  editing: boolean;
  onRemove: () => void;
}) {
  const intl = useIntl();
  const body = (
    <>
      {visual}
      <span className="w-full truncate text-center">{name}</span>
    </>
  );
  const cls = 'flex min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface px-1 py-1.5 text-small text-ink no-underline';
  return (
    <li className="relative">
      {editing ? <div className={cls}>{body}</div> : <Link to={to} className={cls}>{body}</Link>}
      {editing ? (
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'pantry.remove.aria' }, { name })}
          onClick={onRemove}
          className="absolute -top-2.5 -right-2.5 flex size-6 items-center justify-center rounded-full border-2 border-bg bg-surface p-0 text-error shadow-sm after:absolute after:-inset-2 after:content-['']"
        >
          <Icon name="trash" size={14} />
        </button>
      ) : (
        badge && (
          <span
            role="img"
            aria-label={intl.formatMessage({ id: `kitchen.badge.${badge}` })}
            className={`pointer-events-none absolute -top-2.5 -right-2.5 flex size-6 items-center justify-center rounded-full border-2 border-bg bg-surface shadow-sm ${BADGE[badge].cls}`}
          >
            <Icon name={BADGE[badge].icon} size={14} />
          </span>
        )
      )}
    </li>
  );
}
