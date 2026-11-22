import { FormattedMessage, useIntl } from 'react-intl';
import { useState } from 'react';
import { Link } from 'react-router';
import { EXPIRY_SOON_DAYS } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, usePantryItems, useRemovePantryItem, useRestorePantryItem } from '../../data/hooks.ts';
import type { PantryItem } from '../../data/pantry.ts';
import { ActionBar } from '../kitchen/ActionBar.tsx';
import { EditToggle, ItemCard, type CardBadge } from '../kitchen/ItemCard.tsx';
import { StockCard } from '../kitchen/StockCard.tsx';
import { Icon } from '../shell/Icon.tsx';
import { useToast } from '../shell/Toast.tsx';
import { ZONES, ZONE_ICON, displayName } from './labels.ts';
import { addDays, todayIn } from './dates.ts';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

function badgeOf(item: PantryItem, today: string): CardBadge | undefined {
  if (item.expires_at) {
    if (item.expires_at < today) return 'expired';
    if (item.expires_at <= addDays(today, EXPIRY_SOON_DAYS)) return 'soon';
  }
  return item.want_to_use_soon ? 'useSoon' : undefined;
}

// 廚房頁的「食材」：依放哪裡分組，小卡片網格。移除一鍵完成、可以復原（02 食材）
export function PantryTab() {
  const chef = useChef();
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);
  const remove = useRemovePantryItem(kitchen?.id);
  const restore = useRestorePantryItem(kitchen?.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const today = todayIn(kitchen?.timezone ?? 'Asia/Taipei');

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

      {items.length > 0 && <EditToggle editing={editing} onToggle={() => setEditing((v) => !v)} />}

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
              <h2 id={`zone-${zone}`} className="mx-0 mt-2 mb-2 flex items-center gap-1.5 text-card-title font-bold">
                <Icon name={ZONE_ICON[zone]} size={20} />
                <FormattedMessage id={`pantry.zone.${zone}`} />
              </h2>
              <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
                {inZone.map((item) => (
                  <ItemCard
                    key={item.id}
                    to={`/kitchen/pantry/${item.id}`}
                    name={displayName(item)}
                    visual={<ItemIcon kind="ingredient" id={item.ingredient_id} size={36} />}
                    badge={badgeOf(item, today)}
                    editing={editing}
                    onRemove={() => onRemove(item)}
                  />
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
