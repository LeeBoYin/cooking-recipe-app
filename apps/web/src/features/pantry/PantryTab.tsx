import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, usePantryItems, useRemovePantryItem, useRestorePantryItem } from '../../data/hooks.ts';
import type { PantryItem } from '../../data/pantry.ts';
import { ActionBar } from '../kitchen/ActionBar.tsx';
import { StockCard } from '../kitchen/StockCard.tsx';
import { Icon } from '../shell/Icon.tsx';
import { useToast } from '../shell/Toast.tsx';
import { ZONES, ZONE_EMOJI, displayName } from './labels.ts';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

const TAG = 'rounded-tag bg-line-soft px-1.5 text-small font-bold text-ink-muted';

function Row({ item, onRemove }: { item: PantryItem; onRemove: (i: PantryItem) => void }) {
  const intl = useIntl();
  const name = displayName(item);
  return (
    <li className="flex items-center border-b border-line-soft last:border-b-0">
      <Link to={`/kitchen/pantry/${item.id}`} className="flex min-h-14 flex-1 items-center gap-3 py-2 text-ink no-underline">
        <ItemIcon kind="ingredient" id={item.ingredient_id} size={32} />
        <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body">{name}</span>
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
  const chef = useChef();
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);
  const remove = useRemovePantryItem(kitchen?.id);
  const restore = useRestorePantryItem(kitchen?.id);
  const toast = useToast();

  function onRemove(item: PantryItem) {
    remove.mutate(item.id, {
      onSuccess: () =>
        toast(intl.formatMessage({ id: 'pantry.removed.toast' }, { name: displayName(item) }), {
          action: { label: intl.formatMessage({ id: 'pantry.restore' }), onClick: () => restore.mutate(item.id) },
          durationMs: 6000,
        }),
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
        <>
          <StockCard kind="pantry" />
          <div className="flex flex-col items-center py-10 text-center">
            <Chef size={96} mood="quiet" />
            <p className="mt-4 mb-0 font-round text-body">{chef.line('emptyPantry')}</p>
            <Link to="/kitchen/pantry/inventory" className="mt-3 flex h-11 items-center rounded-card border-2 border-ink bg-bulb px-4 text-body font-bold text-ink no-underline">
              <FormattedMessage id="pantry.inventory" />
            </Link>
          </div>
        </>
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
                  <Row key={item.id} item={item} onRemove={onRemove} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {remove.isError && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.error.write" /></p>
      )}

    </div>
  );
}
