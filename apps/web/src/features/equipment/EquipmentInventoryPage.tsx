import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useAddKitchenEquipment, useCurrentKitchen, useKitchenEquipment } from '../../data/hooks.ts';
import { Icon } from '../shell/Icon.tsx';
import { SubPage } from '../shell/SubPage.tsx';
import { groupTypes, initialSelection, inventoryWall, typeName } from './logic.ts';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

// 快速盤點：圖示牆勾選「你的廚房有什麼」，按完成才一次新增。
// 已登記的顯示成已勾選、不能在這裡取消，避免誤刪品牌、容量這些資料；要刪請到那件廚具的編輯頁。
export function EquipmentInventoryPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { kitchen } = useCurrentKitchen();
  const equipment = useKitchenEquipment(kitchen?.id);
  const add = useAddKitchenEquipment(kitchen?.id);
  const region = kitchen?.region ?? 'TW';

  const owned = useMemo(
    () => new Set((equipment.data ?? []).flatMap((e) => (e.equipment_type_id ? [e.equipment_type_id] : []))),
    [equipment.data],
  );
  const groups = useMemo(() => groupTypes(inventoryWall(region)), [region]);

  const [selected, setSelected] = useState<Set<string>>();
  const current = selected ?? (equipment.data ? initialSelection(region, owned, equipment.data.length > 0) : undefined);

  const toAdd = current ? [...current].filter((id) => !owned.has(id)) : [];

  function toggle(id: string) {
    if (!current || owned.has(id)) return;
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit() {
    try {
      const names = new Map(groups.flatMap((g) => g.types).map((t) => [t.id, typeName(t)]));
      // 依圖示牆的順序一件一件加，清單裡的先後才會穩定
      for (const id of toAdd) await add.mutateAsync({ equipment_type_id: id, raw_name: names.get(id) ?? id });
      void navigate('/kitchen/equipment');
    } catch {
      // 失敗時留在這一頁，下方顯示訊息，可以再按一次
    }
  }

  return (
    <SubPage title={intl.formatMessage({ id: 'equipment.inventory.title' })}>
      <div className="flex flex-col gap-3 pb-24">
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="equipment.inventory.help" /></p>
        {!current ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
        ) : (
          groups.map((g) => (
            <section key={g.key} aria-labelledby={`inv-${g.key}`}>
              <h3 id={`inv-${g.key}`} className="mx-0 mt-2 mb-2 font-round text-body font-bold text-ink-muted">
                <FormattedMessage id={`equipment.category.${g.key}`} />
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {g.types.map((t) => {
                  const on = current.has(t.id);
                  const isOwned = owned.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      aria-disabled={isOwned || undefined}
                      title={isOwned ? intl.formatMessage({ id: 'equipment.inventory.owned' }) : undefined}
                      onClick={() => toggle(t.id)}
                      className={`relative flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-card border px-1 text-caption ${
                        on ? 'border-2 border-bulb bg-bulb-soft text-ink' : 'border-line bg-surface text-ink'
                      } ${isOwned ? 'opacity-70' : ''}`}
                    >
                      {on && (
                        <span aria-hidden="true" className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-bulb">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                      <ItemIcon kind="equipment" id={t.id} size={40} />
                      {typeName(t)}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
        {add.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.error.write" /></p>}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] bg-bg px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={toAdd.length === 0 || add.isPending}
          onClick={() => void submit()}
          className="h-12 w-full rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50"
        >
          <FormattedMessage id={add.isPending ? 'pantry.adding' : 'equipment.inventory.done'} values={{ count: toAdd.length }} />
        </button>
      </div>
    </SubPage>
  );
}
