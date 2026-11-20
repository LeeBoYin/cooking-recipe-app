import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { isRecentlyBought } from '@zhusha/ingredients';
import { Chef } from '../../chef/Chef.tsx';
import { useCurrentKitchen, usePantryItems, useRemovePantryItem, useRestorePantryItem } from '../../data/hooks.ts';
import type { PantryItem } from '../../data/pantry.ts';
import { ActionBar } from '../kitchen/ActionBar.tsx';
import { Icon } from '../shell/Icon.tsx';
import { todayIn } from './dates.ts';
import { ZONES, ZONE_EMOJI, displayName, emojiFor } from './labels.ts';

const TAG = 'rounded-tag bg-line-soft px-1.5 text-small font-bold text-ink-muted';

function Row({ item, today, onRemove }: { item: PantryItem; today: string; onRemove: (i: PantryItem) => void }) {
  const intl = useIntl();
  const name = displayName(item);
  const recent = isRecentlyBought(item.ingredient_id, item.added_on, today);
  return (
    <li className="flex items-center border-b border-line-soft last:border-b-0">
      <Link to={`/kitchen/pantry/${item.id}`} className="flex min-h-14 flex-1 items-center gap-3 py-2 text-ink no-underline">
        <span aria-hidden="true" className="w-7 text-center text-card-title">{emojiFor(item.ingredient_id)}</span>
        <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body">{name}</span>
          {recent && <span className={TAG}>{intl.formatMessage({ id: 'pantry.tag.recent' })}</span>}
          {item.want_to_use_soon && (
            <span className="rounded-tag bg-bulb-soft px-1.5 text-small font-bold text-ink">
              {intl.formatMessage({ id: 'pantry.tag.useSoon' })}
            </span>
          )}
          {item.expires_at && (
            <span className={TAG}>{intl.formatMessage({ id: 'pantry.tag.expires' }, { date: item.expires_at.slice(5).replace('-', '/') })}</span>
          )}
        </span>
      </Link>
      <button
        type="button"
        aria-label={intl.formatMessage({ id: 'pantry.remove.aria' }, { name })}
        onClick={() => onRemove(item)}
        className="flex size-11 items-center justify-center border-0 bg-transparent text-ink-muted"
      >
        <Icon name="close" size={20} />
      </button>
    </li>
  );
}

// 廚房頁的「食材」：依放哪裡分組，一項一列。移除一鍵完成、可以復原（02 食材）
export function PantryTab() {
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);
  const remove = useRemovePantryItem(kitchen?.id);
  const restore = useRestorePantryItem(kitchen?.id);
  const [undo, setUndo] = useState<PantryItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const today = todayIn(kitchen?.timezone ?? 'Asia/Taipei');

  function onRemove(item: PantryItem) {
    remove.mutate(item.id, {
      onSuccess: () => {
        setUndo(item);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setUndo(null), 6000);
      },
    });
  }

  const items = pantry.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <ActionBar inventoryTo="/kitchen/pantry/inventory" addTo="/kitchen/pantry/add" inventoryId="pantry.inventory" addId="pantry.add" />

      {pantry.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : pantry.error ? (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.loadError" /></p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Chef size={96} />
          <p className="mt-4 mb-0 text-body"><FormattedMessage id="pantry.empty" /></p>
        </div>
      ) : (
        ZONES.map((zone) => {
          const inZone = items.filter((i) => i.zone === zone);
          if (inZone.length === 0) return null;
          return (
            <section key={zone} aria-labelledby={`zone-${zone}`}>
              <h2 id={`zone-${zone}`} className="mx-0 mt-2 mb-2 text-card-title font-bold">
                {ZONE_EMOJI[zone]} <FormattedMessage id={`pantry.zone.${zone}`} />
              </h2>
              <ul className="m-0 list-none rounded-card bg-surface px-3 py-0">
                {inZone.map((item) => (
                  <Row key={item.id} item={item} today={today} onRemove={onRemove} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <Link to="/kitchen/pantry/removed" className="mt-2 min-h-11 text-caption font-bold text-ink underline underline-offset-4">
        <FormattedMessage id="pantry.removed" />
      </Link>

      {remove.isError && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.error.write" /></p>
      )}

      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[528px] items-center justify-between rounded-card bg-ink px-4 py-2 text-surface"
        >
          <span className="text-caption">{intl.formatMessage({ id: 'pantry.removed.toast' }, { name: displayName(undo) })}</span>
          <button
            type="button"
            onClick={() => {
              clearTimeout(timer.current);
              restore.mutate(undo.id);
              setUndo(null);
            }}
            className="min-h-11 border-0 bg-transparent px-2 text-caption font-bold text-bulb underline underline-offset-4"
          >
            <FormattedMessage id="pantry.restore" />
          </button>
        </div>
      )}
    </div>
  );
}
