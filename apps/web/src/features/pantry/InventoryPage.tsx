import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { commonIngredientIdsFor, getIngredient, rankFrequent } from '@zhusha/ingredients';
import { useAddPantryItems, useCurrentKitchen, usePantryAdditions, usePantryItems, useRemovePantryItem } from '../../data/hooks.ts';
import { SubPage } from '../shell/SubPage.tsx';
import { ZONES, ZONE_ICON } from './labels.ts';
import { Icon } from '../shell/Icon.tsx';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

// 快速盤點：常見食材的圖示牆，點一下「有」、再點一下「沒有」，按完成才一次送出（02 快速盤點）
export function InventoryPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);
  const additions = usePantryAdditions(kitchen?.id);
  const add = useAddPantryItems(kitchen?.id);
  const remove = useRemovePantryItem(kitchen?.id);

  const wall = useMemo(
    () => rankFrequent(additions.data ?? [], commonIngredientIdsFor(kitchen?.region ?? 'TW')),
    [additions.data, kitchen?.region],
  );
  // 廚房現在有的（只看圖示牆上有的那幾樣；牆外的不動）
  const current = useMemo(() => {
    const map = new Map<string, string>(); // ingredient_id → pantry item id
    for (const i of pantry.data ?? []) if (i.ingredient_id && wall.includes(i.ingredient_id)) map.set(i.ingredient_id, i.id);
    return map;
  }, [pantry.data, wall]);

  const [selected, setSelected] = useState<Set<string>>();
  useEffect(() => {
    if (!selected && pantry.data && additions.data) setSelected(new Set(current.keys()));
  }, [selected, pantry.data, additions.data, current]);

  const toAdd = selected ? [...selected].filter((id) => !current.has(id)) : [];
  const toRemove = selected ? [...current.keys()].filter((id) => !selected.has(id)) : [];
  const changes = toAdd.length + toRemove.length;
  const busy = add.isPending || remove.isPending;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    try {
      await Promise.all([
        toAdd.length
          ? add.mutateAsync(
              toAdd.map((id) => {
                const ing = getIngredient(id)!;
                return { raw_name: ing.name['zh-TW'], ingredient_id: id, zone: ing.defaultStorage };
              }),
            )
          : undefined,
        ...toRemove.map((id) => remove.mutateAsync(current.get(id)!)),
      ]);
      void navigate('/kitchen');
    } catch {
      // 失敗時留在這一頁，下方顯示訊息，可以再按一次
    }
  }

  return (
    <SubPage srTitle={intl.formatMessage({ id: 'pantry.inventory' })}>
      <div className="flex flex-col gap-3 pb-24">
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="pantry.inventory.help" /></p>
        {!selected ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
        ) : (
          ZONES.map((zone) => {
            const ids = wall.filter((id) => getIngredient(id)?.defaultStorage === zone);
            if (ids.length === 0) return null;
            return (
              <section key={zone} aria-labelledby={`inv-${zone}`}>
                <h2 id={`inv-${zone}`} className="mx-0 mt-2 mb-2 flex items-center gap-1.5 text-card-title font-bold">
                  <Icon name={ZONE_ICON[zone]} size={20} />
                <FormattedMessage id={`pantry.zone.${zone}`} />
                </h2>
                <div className="grid grid-cols-4 gap-2">
                  {ids.map((id) => {
                    const on = selected.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(id)}
                        className={`flex min-h-[72px] flex-col items-center justify-center gap-0.5 rounded-card border px-1 text-small ${
                          on ? 'border-ink bg-bulb-soft font-bold' : 'border-line bg-surface text-ink-muted'
                        }`}
                      >
                        <ItemIcon kind="ingredient" id={id} size={36} />
                        <span>{getIngredient(id)?.name['zh-TW']}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
        {(add.isError || remove.isError) && (
          <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.error.write" /></p>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] bg-bg px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={changes === 0 || busy}
          onClick={() => void submit()}
          className="h-12 w-full rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50"
        >
          <FormattedMessage id={busy ? 'pantry.adding' : 'pantry.inventory.done'} values={{ count: changes }} />
        </button>
      </div>
    </SubPage>
  );
}
