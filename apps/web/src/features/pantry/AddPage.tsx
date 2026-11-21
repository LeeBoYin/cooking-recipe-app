import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { commonIngredientIdsFor, getIngredient, rankFrequent, searchIngredients } from '@zhusha/ingredients';
import { newId } from '@zhusha/core';
import { useAddPantryItems, useCurrentKitchen, usePantryAdditions, usePantryItems } from '../../data/hooks.ts';
import type { NewPantryItem, StorageZone } from '../../data/pantry.ts';
import { Icon } from '../shell/Icon.tsx';
import { SubPage } from '../shell/SubPage.tsx';
import { todayIn } from './dates.ts';
import { ExpiryFields, type Expiry } from './ExpiryFields.tsx';
import { ZoneSelect } from './ZoneSelect.tsx';
import { ItemIcon } from '../../icons/ItemIcon.tsx';

// 一張食材卡：加入前可以設放哪裡、想先用掉、期限（02 快速新增）
type Draft = {
  id: string;
  ingredient_id: string | null;
  name: string;
  zone: StorageZone;
  want_to_use_soon: boolean;
} & Expiry;

const draftKey = (kitchenId: string) => `draft:pantry-add:${kitchenId}`;

function loadDrafts(kitchenId: string): Draft[] {
  try {
    const raw = localStorage.getItem(draftKey(kitchenId));
    return raw ? (JSON.parse(raw) as Draft[]) : [];
  } catch {
    return [];
  }
}
function saveDrafts(kitchenId: string, drafts: Draft[]) {
  try {
    if (drafts.length === 0) localStorage.removeItem(draftKey(kitchenId));
    else localStorage.setItem(draftKey(kitchenId), JSON.stringify(drafts));
  } catch {
    // 手機不讓存就算了，只是少了暫存
  }
}

function Card({ draft, today, onChange, onRemove }: { draft: Draft; today: string; onChange: (d: Draft) => void; onRemove: () => void }) {
  const intl = useIntl();
  return (
    <li className="rounded-card bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-card-title font-bold">
          <ItemIcon kind="ingredient" id={draft.ingredient_id} size={32} /> {draft.name}
        </span>
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'pantry.card.remove' }, { name: draft.name })}
          onClick={onRemove}
          className="flex size-11 items-center justify-center border-0 bg-transparent text-ink-muted"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="mt-1 flex flex-col gap-3">
        <ZoneSelect value={draft.zone} onChange={(zone) => onChange({ ...draft, zone })} />
        <label className="flex min-h-11 items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={draft.want_to_use_soon}
            onChange={(e) => onChange({ ...draft, want_to_use_soon: e.target.checked })}
            className="size-5 accent-bulb"
          />
          <FormattedMessage id="pantry.useSoon" />
        </label>
        <details>
          <summary className="min-h-11 cursor-pointer text-caption font-bold leading-[44px]">
            <FormattedMessage id="pantry.moreOptions" />
          </summary>
          <ExpiryFields value={draft} today={today} onChange={(e) => onChange({ ...draft, ...e })} />
        </details>
      </div>
    </li>
  );
}

// 快速新增：搜尋字典或點常買清單，下方多一張食材卡，最後一次加入（02 快速新增、09 買菜回來）
export function AddPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { kitchen } = useCurrentKitchen();
  const kitchenId = kitchen?.id;
  const pantry = usePantryItems(kitchenId);
  const additions = usePantryAdditions(kitchenId);
  const add = useAddPantryItems(kitchenId);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadedFor, setLoadedFor] = useState<string>();

  // 還沒送出的卡片暫存在手機，離開再回來還在
  useEffect(() => {
    if (kitchenId && loadedFor !== kitchenId) {
      setDrafts(loadDrafts(kitchenId));
      setLoadedFor(kitchenId);
    }
  }, [kitchenId, loadedFor]);
  useEffect(() => {
    if (kitchenId && loadedFor === kitchenId) saveDrafts(kitchenId, drafts);
  }, [drafts, kitchenId, loadedFor]);

  const today = todayIn(kitchen?.timezone ?? 'Asia/Taipei');
  const results = useMemo(() => searchIngredients(query), [query]);
  const frequent = useMemo(
    () => rankFrequent(additions.data ?? [], commonIngredientIdsFor(kitchen?.region ?? 'TW')),
    [additions.data, kitchen?.region],
  );
  const have = new Set((pantry.data ?? []).map((i) => i.ingredient_id));
  const carded = new Set(drafts.map((d) => d.ingredient_id).filter(Boolean));
  const trimmed = query.trim();
  const exact = results.some((r) => r.name['zh-TW'] === trimmed);

  function addIngredient(id: string) {
    const ing = getIngredient(id);
    if (!ing || carded.has(id)) return;
    setDrafts((d) => [
      ...d,
      { id: newId(), ingredient_id: id, name: ing.name['zh-TW'], zone: ing.defaultStorage, want_to_use_soon: false, expires_at: null, date_type: null },
    ]);
    setQuery('');
  }
  function addCustom(name: string) {
    setDrafts((d) => [
      ...d,
      { id: newId(), ingredient_id: null, name, zone: 'pantry', want_to_use_soon: false, expires_at: null, date_type: null },
    ]);
    setQuery('');
  }

  async function submit() {
    const items: NewPantryItem[] = drafts.map((d) => ({
      id: d.id,
      raw_name: d.name,
      ingredient_id: d.ingredient_id,
      zone: d.zone,
      want_to_use_soon: d.want_to_use_soon,
      expires_at: d.expires_at,
      date_type: d.date_type,
    }));
    try {
      await add.mutateAsync(items);
      setDrafts([]);
      if (kitchenId) saveDrafts(kitchenId, []);
      void navigate('/kitchen');
    } catch {
      // 錯誤訊息由下方 add.isError 顯示；卡片留著，可以再按一次
    }
  }

  return (
    <SubPage srTitle={intl.formatMessage({ id: 'pantry.add' })}>
      <div className="flex flex-col gap-3 pb-24">
        <label className="relative block">
          <span className="sr-only"><FormattedMessage id="pantry.search" /></span>
          <Icon name="search" size={20} className="pointer-events-none absolute top-3.5 left-3 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={intl.formatMessage({ id: 'pantry.search.placeholder' })}
            className="h-12 w-full rounded-card border-0 bg-surface pr-3 pl-10 text-body text-ink"
          />
        </label>

        {trimmed && (
          <ul className="m-0 list-none rounded-card bg-surface px-3 py-0">
            {results.map((r) => (
              <li key={r.id} className="border-b border-line-soft last:border-b-0">
                <button
                  type="button"
                  disabled={carded.has(r.id)}
                  onClick={() => addIngredient(r.id)}
                  className="flex min-h-12 w-full items-center gap-3 border-0 bg-transparent py-1 text-left text-body text-ink disabled:text-ink-muted"
                >
                  <ItemIcon kind="ingredient" id={r.id} size={32} />
                  <span className="flex-1">{r.name['zh-TW']}</span>
                  {have.has(r.id) && (
                    <span className="rounded-tag bg-green-soft px-1.5 text-small font-bold text-green">
                      <FormattedMessage id="pantry.tag.have" />
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!exact && (
              <li>
                <button
                  type="button"
                  onClick={() => addCustom(trimmed)}
                  className="min-h-12 w-full border-0 bg-transparent py-1 text-left text-body font-bold text-ink"
                >
                  <FormattedMessage id="pantry.addCustom" values={{ name: trimmed }} />
                </button>
              </li>
            )}
          </ul>
        )}

        <section aria-labelledby="frequent">
          <h2 id="frequent" className="mx-0 mt-2 mb-2 text-card-title font-bold"><FormattedMessage id="pantry.frequent" /></h2>
          <div className="flex flex-wrap gap-2">
            {frequent.map((id) => {
              const used = carded.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={used}
                  aria-pressed={used}
                  onClick={() => addIngredient(id)}
                  className={`min-h-11 rounded-full border px-3 text-caption ${used ? 'border-ink bg-bulb-soft font-bold' : 'border-line bg-surface'}`}
                >
                  <ItemIcon kind="ingredient" id={id} size={24} /> {getIngredient(id)?.name['zh-TW']}
                  {have.has(id) && !used && <span className="text-ink-muted"> ✓</span>}
                </button>
              );
            })}
          </div>
        </section>

        {drafts.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {drafts.map((d) => (
              <Card
                key={d.id}
                draft={d}
                today={today}
                onChange={(next) => setDrafts((all) => all.map((x) => (x.id === d.id ? next : x)))}
                onRemove={() => setDrafts((all) => all.filter((x) => x.id !== d.id))}
              />
            ))}
          </ul>
        )}

        {add.isError && (
          <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="pantry.error.write" /></p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] bg-bg px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={drafts.length === 0 || add.isPending}
          onClick={() => void submit()}
          className="h-12 w-full rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50"
        >
          {add.isPending ? (
            <FormattedMessage id="pantry.adding" />
          ) : (
            <FormattedMessage id="pantry.addN" values={{ count: drafts.length }} />
          )}
        </button>
      </div>
    </SubPage>
  );
}
