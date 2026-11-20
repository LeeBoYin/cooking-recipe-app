import { FormattedMessage, useIntl } from 'react-intl';
import { useCurrentKitchen, useRecentlyRemovedPantry, useRestorePantryItem } from '../../data/hooks.ts';
import { SubPage } from '../shell/SubPage.tsx';
import { displayName, emojiFor } from './labels.ts';

// 最近移除：30 天內拿掉的食材，一鍵復原（02 移除）
export function RemovedPage() {
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const removed = useRecentlyRemovedPantry(kitchen?.id);
  const restore = useRestorePantryItem(kitchen?.id);
  const items = removed.data ?? [];
  return (
    <SubPage srTitle={intl.formatMessage({ id: 'pantry.removed' })}>
      <div className="flex flex-col gap-3">
        <h2 className="m-0 font-round text-heading font-bold"><FormattedMessage id="pantry.removed" /></h2>
        {removed.isPending ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
        ) : removed.error ? (
          <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.loadError" /></p>
        ) : items.length === 0 ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="pantry.removed.empty" /></p>
        ) : (
          <ul className="m-0 list-none rounded-card bg-surface px-3 py-0">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 border-b border-line-soft py-1 last:border-b-0">
                <span aria-hidden="true" className="w-7 text-center text-card-title">{emojiFor(item.ingredient_id)}</span>
                <span className="flex-1 text-body">{displayName(item)}</span>
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(item.id)}
                  className="min-h-11 border-0 bg-transparent px-2 text-caption font-bold text-ink underline underline-offset-4"
                >
                  <FormattedMessage id="pantry.restore" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {restore.isError && (
          <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.error.write" /></p>
        )}
      </div>
    </SubPage>
  );
}
