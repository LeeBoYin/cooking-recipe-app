import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { getIngredient, seasoningIngredientIds, stapleIngredientIdsFor } from '@zhusha/ingredients';
import {
  useAddKitchenEquipment, useAddPantryItems, useCurrentKitchen, useKitchenEquipment, usePantryItems,
} from '../../data/hooks.ts';
import { groupTypes, initialSelection, inventoryWall, typeName } from '../equipment/logic.ts';
import { emojiFor } from '../pantry/labels.ts';
import { Icon } from '../shell/Icon.tsx';

type Tab = 'staples' | 'sauces' | 'equipment';
const TABS: Tab[] = ['staples', 'sauces', 'equipment'];

const tile = (on: boolean, owned: boolean) =>
  `relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-card px-1 text-[13px] text-ink ${
    on ? 'border-2 border-bulb bg-bulb-soft' : 'border border-line bg-surface'
  } ${owned ? 'opacity-70' : ''}`;

function Check() {
  return (
    <span aria-hidden="true" className="absolute top-1 right-1 flex size-[18px] items-center justify-center rounded-full bg-ink text-surface">
      <Icon name="check" size={12} />
    </span>
  );
}

// ⑦ 廚房裡有什麼（12 ⑦）：三個分頁，點一下「有」、不填數量。
// 按［好了］才一次寫進廚房；已經登記過的顯示成已勾選、不能在這裡取消。［之後再說］什麼都不寫。
export function StockStep({ onDone, onLater }: { onDone: () => void; onLater: () => void }) {
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);
  const equipment = useKitchenEquipment(kitchen?.id);
  const addPantry = useAddPantryItems(kitchen?.id);
  const addEquipment = useAddKitchenEquipment(kitchen?.id);
  const region = kitchen?.region ?? 'TW';
  const [tab, setTab] = useState<Tab>('staples');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedEquipment, setPickedEquipment] = useState<Set<string>>();
  const [failed, setFailed] = useState(false);

  const staples = useMemo(() => stapleIngredientIdsFor(region).filter((id) => getIngredient(id)), [region]);
  const sauces = useMemo(() => seasoningIngredientIds(), []);
  const groups = useMemo(() => groupTypes(inventoryWall(region)), [region]);

  const ownedIngredients = useMemo(() => new Set((pantry.data ?? []).flatMap((i) => (i.ingredient_id ? [i.ingredient_id] : []))), [pantry.data]);
  const ownedEquipment = useMemo(() => new Set((equipment.data ?? []).flatMap((e) => (e.equipment_type_id ? [e.equipment_type_id] : []))), [equipment.data]);
  const ready = !!kitchen && !!pantry.data && !!equipment.data;
  // 廚具：廚房還一件都沒有時，大部分家庭都有的 10 種先勾好
  const equipmentOn = pickedEquipment ?? (ready ? initialSelection(region, ownedEquipment, equipment.data.length > 0) : new Set<string>());
  const busy = addPantry.isPending || addEquipment.isPending;

  function toggleIngredient(id: string) {
    if (ownedIngredients.has(id)) return;
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  function toggleEquipment(id: string) {
    if (ownedEquipment.has(id)) return;
    const next = new Set(equipmentOn);
    if (!next.delete(id)) next.add(id);
    setPickedEquipment(next);
  }

  async function submit() {
    setFailed(false);
    try {
      const items = [...picked].map((id) => {
        const ing = getIngredient(id)!;
        return { raw_name: ing.name['zh-TW'], ingredient_id: id, zone: ing.defaultStorage };
      });
      if (items.length > 0) await addPantry.mutateAsync(items);
      const names = new Map(groups.flatMap((g) => g.types).map((t) => [t.id, typeName(t)]));
      // 依圖示牆的順序一件一件加，廚具清單的先後才會穩定
      for (const t of groups.flatMap((g) => g.types)) {
        if (equipmentOn.has(t.id) && !ownedEquipment.has(t.id)) {
          await addEquipment.mutateAsync({ equipment_type_id: t.id, raw_name: names.get(t.id) ?? t.id });
        }
      }
      onDone();
    } catch {
      // 留在這一頁，顯示訊息，可以再按一次（已經寫進去的重送不會重複）
      setFailed(true);
    }
  }

  const grid = (ids: string[]) => (
    <div className="grid grid-cols-4 gap-2">
      {ids.map((id) => {
        const owned = ownedIngredients.has(id);
        const on = owned || picked.has(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            aria-disabled={owned || undefined}
            title={owned ? intl.formatMessage({ id: 'onboarding.stock.owned' }) : undefined}
            onClick={() => toggleIngredient(id)}
            className={tile(on, owned)}
          >
            {on && <Check />}
            <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-line-soft text-[16px] leading-none">{emojiFor(id)}</span>
            {getIngredient(id)?.name['zh-TW']}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-3.5">
      <h1 className="m-0 font-round text-heading leading-[1.4]"><FormattedMessage id="onboarding.stock.title" /></h1>
      <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="onboarding.stock.body" /></p>
      <div role="tablist" className="grid grid-cols-3 rounded-card bg-line-soft p-[3px]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-[38px] rounded-lg border-0 font-[inherit] text-[15px] ${tab === t ? 'bg-surface font-bold text-ink' : 'bg-transparent text-ink-muted'}`}
          >
            <FormattedMessage id={`onboarding.stock.tab.${t}`} />
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pb-28">
        {!ready ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
        ) : tab === 'staples' ? (
          grid(staples)
        ) : tab === 'sauces' ? (
          grid(sauces)
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`stock-${g.key}`}>
                <h2 id={`stock-${g.key}`} className="mx-0 mt-2 mb-2 font-round text-body font-bold text-ink-muted">
                  <FormattedMessage id={`equipment.category.${g.key}`} />
                </h2>
                <div className="grid grid-cols-4 gap-2">
                  {g.types.map((t) => {
                    const owned = ownedEquipment.has(t.id);
                    const on = owned || equipmentOn.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        aria-disabled={owned || undefined}
                        title={owned ? intl.formatMessage({ id: 'onboarding.stock.owned' }) : undefined}
                        onClick={() => toggleEquipment(t.id)}
                        className={tile(on, owned)}
                      >
                        {on && <Check />}
                        <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-line-soft"><Icon name="pot" size={16} /></span>
                        {typeName(t)}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[560px] flex-col gap-1 bg-bg px-5 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {failed && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="onboarding.stock.error" /></p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onLater} className="h-11 flex-1 border-0 bg-transparent font-[inherit] text-[15px] text-ink-muted">
            <FormattedMessage id="onboarding.stock.later" />
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void submit()}
            className="h-12 flex-1 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
          >
            <FormattedMessage id={busy ? 'common.saving' : 'onboarding.stock.done'} />
          </button>
        </div>
      </div>
    </div>
  );
}
