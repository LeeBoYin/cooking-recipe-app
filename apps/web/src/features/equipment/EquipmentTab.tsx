import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, useEquipmentPhotos, useKitchenEquipment, usePhotoUrls } from '../../data/hooks.ts';
import type { KitchenEquipment } from '../../data/equipment.ts';
import { ActionBar } from '../kitchen/ActionBar.tsx';
import { StockCard } from '../kitchen/StockCard.tsx';
import { Icon } from '../shell/Icon.tsx';
import { detailTags, groupEquipment } from './logic.ts';

const TAG = 'rounded-tag bg-line-soft px-2 text-small font-bold text-ink-muted';

function Row({ item, thumbUrl }: { item: KitchenEquipment; thumbUrl?: string }) {
  return (
    <li className="border-b border-line-soft last:border-b-0">
      <Link to={`/kitchen/equipment/${item.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 text-ink no-underline">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-line-soft">
          {thumbUrl ? <img src={thumbUrl} alt="" className="size-full object-cover" /> : <Icon name="pot" size={22} />}
        </span>
        <span className="flex-1 text-body">{item.raw_name}</span>
        {detailTags(item).map((t) => (
          <span key={t} className={TAG}>{t}</span>
        ))}
      </Link>
    </li>
  );
}

// 廚房頁的「廚具」：依分類分組，一件一列。不放大廚的點子、不計次數（02 廚具）
export function EquipmentTab() {
  const chef = useChef();
  const { kitchen } = useCurrentKitchen();
  const equipment = useKitchenEquipment(kitchen?.id);
  const groups = groupEquipment(equipment.data ?? []);
  const photos = useEquipmentPhotos(kitchen?.id).data;
  const thumbPaths = [...(photos?.values() ?? [])].map((p) => p.thumb_path);
  const thumbUrls = usePhotoUrls(thumbPaths).data;

  return (
    <div className="flex flex-col gap-3">
      <ActionBar
        inventoryTo="/kitchen/equipment/inventory"
        addTo="/kitchen/equipment/add"
        inventoryId="equipment.inventory"
        addId="equipment.add"
      />
      {equipment.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : equipment.error ? (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.loadError" /></p>
      ) : groups.length === 0 ? (
        <>
          <StockCard kind="equipment" />
          <div className="flex flex-col items-center py-10 text-center">
            <Chef size={96} mood="quiet" />
            <p className="mt-4 mb-0 font-round text-body">{chef.line('emptyEquipment')}</p>
          </div>
        </>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`eq-${g.key}`}>
            <h2 id={`eq-${g.key}`} className="mx-0 mt-2 mb-2 font-round text-body font-bold text-ink-muted">
              <FormattedMessage id={`equipment.category.${g.key}`} />
            </h2>
            <ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
              {g.items.map((i) => (
                <Row key={i.id} item={i} thumbUrl={thumbUrls?.[photos?.get(i.id)?.thumb_path ?? '']} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
