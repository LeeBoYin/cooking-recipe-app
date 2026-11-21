import { FormattedMessage } from 'react-intl';
import { useCurrentKitchen, useRecentlyRemovedPantry, useRestorePantryItem } from '../../data/hooks.ts';
import { displayName } from '../pantry/labels.ts';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

// 「我的 → 最近刪除」的食材區：只列目前所在廚房、30 天內拿掉的食材，一鍵復原（02 移除）
export function TrashPantry() {
  const { kitchen } = useCurrentKitchen();
  const removed = useRecentlyRemovedPantry(kitchen?.id);
  const restore = useRestorePantryItem(kitchen?.id);
  const items = removed.data ?? [];
  return (
    <section aria-labelledby="trash-pantry">
      <div className="flex flex-col gap-3">
        <h2 id="trash-pantry" className="m-0 font-round text-heading font-bold">
          {kitchen ? <FormattedMessage id="trash.pantry" values={{ kitchen: kitchen.name }} /> : <FormattedMessage id="trash.pantry.loading" />}
        </h2>
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
                <ItemIcon kind="ingredient" id={item.ingredient_id} size={32} />
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
    </section>
  );
}
