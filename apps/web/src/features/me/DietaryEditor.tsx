import { track } from '../../data/track.ts';
import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { allergens, dietaryRestrictions, getIngredient, regionChain, searchIngredients, type Allergen } from '@zhusha/ingredients';
import { EMPTY_DIETARY, type Dietary } from '../../data/dietary.ts';
import { useCurrentKitchen, useMyDietary, useSaveDietary } from '../../data/hooks.ts';
import { Chip } from './Chip.tsx';

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

// 依地區列出要顯示的過敏原：上層的（甲殼類）；下層只有該地區標「自己顯示」的才列。已經選了的一定列出
export function visibleAllergens(all: readonly Allergen[], regionCodes: readonly string[], selected: readonly string[]): Allergen[] {
  return all.filter((a) => {
    if (a.deprecated) return false;
    if (selected.includes(a.id)) return true;
    if (a.parentId) return regionCodes.some((r) => a.displayLevelByRegion?.[r] === 'self');
    return !a.regions || a.regions.some((r) => regionCodes.includes(r));
  });
}

// 飲食限制（12 ④）。「我的 → 飲食限制」和新手引導 ④ 共用這個元件；
// 讀取、草稿、儲存都在這裡，呼叫的畫面只決定存好之後去哪（onDone）。
export function DietaryEditor({ onDone, doneId = 'diet.done' }: { onDone: () => void; doneId?: string }) {
  const stored = useMyDietary();
  const { kitchen, isPending } = useCurrentKitchen();
  if (stored.isPending || isPending) {
    return <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>;
  }
  if (stored.isError || !stored.data) {
    return <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="diet.loadError" /></p>;
  }
  return <Fields initial={stored.data} region={kitchen?.region ?? 'TW'} onDone={onDone} doneId={doneId} />;
}

function Fields({ initial, region, onDone, doneId }: { initial: Dietary; region: string; onDone: () => void; doneId: string }) {
  const intl = useIntl();
  const save = useSaveDietary();
  const [draft, setDraft] = useState<Dietary>(initial);
  const [query, setQuery] = useState('');

  const shownAllergens = useMemo(() => visibleAllergens(allergens, regionChain(region), initial.allergenIds), [region, initial.allergenIds]);
  const results = useMemo(
    () => searchIngredients(query, 6).filter((i) => !draft.dislikeIngredientIds.includes(i.id)),
    [query, draft.dislikeIngredientIds],
  );

  const commit = (value: Dietary) => {
    track('settings.changed', { key: 'dietary' });
    save.mutate(value, { onSuccess: onDone });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-body font-bold"><FormattedMessage id="diet.allergens" /></h2>
        <div className="flex flex-wrap gap-2">
          {shownAllergens.map((a) => (
            <Chip key={a.id} selected={draft.allergenIds.includes(a.id)} onClick={() => setDraft({ ...draft, allergenIds: toggle(draft.allergenIds, a.id) })}>
              {a.name['zh-TW']}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-body font-bold"><FormattedMessage id="diet.principles" /></h2>
        <div className="flex flex-wrap gap-2">
          {dietaryRestrictions.filter((r) => !r.deprecated).map((r) => (
            <Chip key={r.id} selected={draft.restrictionIds.includes(r.id)} onClick={() => setDraft({ ...draft, restrictionIds: toggle(draft.restrictionIds, r.id) })}>
              {r.name['zh-TW']}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-body font-bold"><FormattedMessage id="diet.other" /></h2>
        <label className="flex h-12 items-center justify-between rounded-card bg-surface px-3 text-[15px]">
          <FormattedMessage id="diet.noAlcohol" />
          <input
            type="checkbox"
            checked={draft.noCookingAlcohol}
            onChange={(e) => setDraft({ ...draft, noCookingAlcohol: e.target.checked })}
            className="size-[22px] accent-bulb"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 text-body font-bold"><FormattedMessage id="diet.dislikes" /></h2>
        <label className="flex">
          <span className="sr-only"><FormattedMessage id="diet.search.label" /></span>
          <input
            type="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={intl.formatMessage({ id: 'diet.search.placeholder' })}
            className="h-11 flex-1 rounded-card border border-line bg-surface px-3 font-[inherit] text-body"
          />
        </label>
        {query.trim() !== '' && (
          <div className="flex flex-wrap gap-2">
            {results.length === 0 && <span className="text-caption text-ink-muted"><FormattedMessage id="diet.search.none" /></span>}
            {results.map((i) => (
              <Chip
                key={i.id}
                selected={false}
                onClick={() => {
                  setDraft({ ...draft, dislikeIngredientIds: [...draft.dislikeIngredientIds, i.id] });
                  setQuery('');
                }}
              >
                {i.name['zh-TW']}
              </Chip>
            ))}
          </div>
        )}
        {draft.dislikeIngredientIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {draft.dislikeIngredientIds.map((id) => (
              <Chip key={id} selected onClick={() => setDraft({ ...draft, dislikeIngredientIds: draft.dislikeIngredientIds.filter((x) => x !== id) })}>
                {getIngredient(id)?.name['zh-TW'] ?? id} ×
              </Chip>
            ))}
          </div>
        )}
      </section>

      {save.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="diet.saveError" /></p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            setDraft(EMPTY_DIETARY);
            commit(EMPTY_DIETARY);
          }}
          className="h-12 flex-1 border-0 bg-transparent font-[inherit] text-[15px] text-ink-muted disabled:opacity-50"
        >
          <FormattedMessage id="diet.none" />
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => commit(draft)}
          className="h-12 flex-1 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
        >
          <FormattedMessage id={save.isPending ? 'common.saving' : doneId} />
        </button>
      </div>
    </div>
  );
}
