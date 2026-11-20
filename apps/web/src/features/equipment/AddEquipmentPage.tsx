import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import type { EquipmentType } from '@zhusha/equipment';
import { useAddKitchenEquipment, useCurrentKitchen } from '../../data/hooks.ts';
import type { NewEquipment } from '../../data/equipment.ts';
import { Icon } from '../shell/Icon.tsx';
import { SubPage } from '../shell/SubPage.tsx';
import { groupTypes, hasExactName, searchTypes, typeName } from './logic.ts';

const ROW = 'flex min-h-14 w-full items-center gap-3 border-0 border-b border-line-soft bg-transparent px-3 text-left text-body text-ink last:border-b-0 disabled:opacity-50';

function Circle({ children }: { children: React.ReactNode }) {
  return <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-line-soft">{children}</span>;
}

// 新增一件廚具：從字典選，或用自己打的名稱。新增後直接進編輯頁補品牌、容量這些選填資料（02 新增／編輯器具）
export function AddEquipmentPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { kitchen } = useCurrentKitchen();
  const add = useAddKitchenEquipment(kitchen?.id);
  const [query, setQuery] = useState('');
  const region = kitchen?.region ?? 'TW';
  const name = query.trim();
  const results = searchTypes(query, region);
  const canCustom = name.length > 0 && !hasExactName(query, region);

  async function create(item: NewEquipment) {
    try {
      const created = await add.mutateAsync(item);
      void navigate(`/kitchen/equipment/${created.id}`, { replace: true });
    } catch {
      // 錯誤訊息由下方 add.isError 顯示
    }
  }
  const pick = (t: EquipmentType) => create({ equipment_type_id: t.id, raw_name: typeName(t) });

  return (
    <SubPage srTitle={intl.formatMessage({ id: 'equipment.add' })}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col">
          <span className="sr-only"><FormattedMessage id="equipment.search.label" /></span>
          <input
            type="search"
            autoFocus
            maxLength={40}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={intl.formatMessage({ id: 'equipment.search.placeholder' })}
            className="h-12 rounded-card border border-line bg-surface px-3 text-body text-ink"
          />
        </label>

        {canCustom && (
          <div className="flex flex-col gap-1">
            <ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
              <li>
                <button type="button" disabled={add.isPending} onClick={() => void create({ raw_name: name })} className={ROW}>
                  <Circle><Icon name="plus" size={20} /></Circle>
                  <span className="flex-1">{intl.formatMessage({ id: 'equipment.addCustom' }, { name })}</span>
                </button>
              </li>
            </ul>
            <p className="m-0 px-1 text-small text-ink-muted"><FormattedMessage id="equipment.customHelp" /></p>
          </div>
        )}

        {name && results.length === 0 && (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="equipment.noMatch" /></p>
        )}

        {groupTypes(results).map((g) => (
          <section key={g.key} aria-labelledby={`add-${g.key}`}>
            <h2 id={`add-${g.key}`} className="mx-0 mt-2 mb-2 font-round text-body font-bold text-ink-muted">
              <FormattedMessage id={`equipment.category.${g.key}`} />
            </h2>
            <ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
              {g.types.map((t) => (
                <li key={t.id}>
                  <button type="button" disabled={add.isPending} onClick={() => void pick(t)} className={ROW}>
                    <Circle><Icon name="pot" size={22} /></Circle>
                    <span className="flex-1">{typeName(t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {add.isError && (
          <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.error.write" /></p>
        )}
      </div>
    </SubPage>
  );
}
