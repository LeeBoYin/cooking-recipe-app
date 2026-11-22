import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, useDeleteKitchenEquipment, useEquipmentPhotos, useKitchenEquipment, usePhotoUrls } from '../../data/hooks.ts';
import type { KitchenEquipment } from '../../data/equipment.ts';
import { ActionBar } from '../kitchen/ActionBar.tsx';
import { EditToggle, ItemCard } from '../kitchen/ItemCard.tsx';
import { StockCard } from '../kitchen/StockCard.tsx';
import { removeFiles } from '../../data/photos.ts';
import { groupEquipment } from './logic.ts';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

// 廚房頁的「廚具」：依分類分組，小卡片網格。不放大廚的點子、不計次數（02 廚具）
export function EquipmentTab() {
  const chef = useChef();
  const intl = useIntl();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<KitchenEquipment | null>(null);
  const { kitchen } = useCurrentKitchen();
  const equipment = useKitchenEquipment(kitchen?.id);
  const groups = groupEquipment(equipment.data ?? []);
  const photos = useEquipmentPhotos(kitchen?.id).data;
  const thumbPaths = [...(photos?.values() ?? [])].map((p) => p.thumb_path);
  const thumbUrls = usePhotoUrls(thumbPaths).data;
  const remove = useDeleteKitchenEquipment(kitchen?.id);

  function confirmRemove(item: KitchenEquipment) {
    remove.mutate(item.id, {
      onSuccess: () => {
        const photo = photos?.get(item.id);
        // 照片資料列由資料庫連動刪除；檔案盡力清掉，清不掉的由維護工作掃孤兒檔
        if (photo) void removeFiles([photo.storage_path, photo.feed_path, photo.thumb_path]).catch(() => undefined);
        setConfirming(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ActionBar
        inventoryTo="/kitchen/equipment/inventory"
        addTo="/kitchen/equipment/add"
        inventoryId="equipment.inventory"
        addId="equipment.add"
      />
      {groups.length > 0 && <EditToggle editing={editing} onToggle={() => { setEditing((v) => !v); setConfirming(null); }} />}
      {confirming && (
        <div role="alertdialog" className="flex items-center gap-2 rounded-card border border-line bg-surface p-3">
          <span className="flex-1 text-caption">{intl.formatMessage({ id: 'equipment.delete.confirm' }, { name: confirming.raw_name })}</span>
          <button type="button" onClick={() => setConfirming(null)} className="h-11 rounded-card border border-line bg-surface px-3 text-caption text-ink">
            <FormattedMessage id="equipment.delete.cancel" />
          </button>
          <button type="button" disabled={remove.isPending} onClick={() => confirmRemove(confirming)} className="h-11 rounded-card border-0 bg-error px-3 text-caption font-bold text-surface disabled:opacity-50">
            <FormattedMessage id="equipment.delete.yes" />
          </button>
        </div>
      )}
      {remove.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.error.write" /></p>}
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
            <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
              {g.items.map((i) => {
                const thumbUrl = thumbUrls?.[photos?.get(i.id)?.thumb_path ?? ''];
                return (
                  <ItemCard
                    key={i.id}
                    to={`/kitchen/equipment/${i.id}`}
                    name={i.raw_name}
                    visual={
                      thumbUrl ? (
                        <span aria-hidden="true" className="size-9 shrink-0 overflow-hidden rounded-full bg-line-soft">
                          <img src={thumbUrl} alt="" className="size-full object-cover" />
                        </span>
                      ) : (
                        <ItemIcon kind="equipment" id={i.equipment_type_id} size={36} />
                      )
                    }
                    editing={editing}
                    onRemove={() => setConfirming(i)}
                  />
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
