import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, useMyRecipePhotos, useMyRecipes, usePhotoUrls, useSearchMyRecipes } from '../../data/hooks.ts';
import { todayIn } from '../pantry/dates.ts';
import { Icon } from '../shell/Icon.tsx';
import { Highlighted, RecipeCard } from './RecipeCard.tsx';
import { buildTimeline, groupByMonth, type TimelineEntry } from './timeline.ts';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// 我的食譜：草稿列、搜尋框、依月分組的時間軸（沒有篩選與其他排序，02 時間軸）
export function MyRecipesTab() {
  const chef = useChef();
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const timeZone = kitchen?.timezone ?? 'Asia/Taipei';
  const published = useMyRecipes('published');
  const drafts = useMyRecipes('draft');
  const photos = useMyRecipePhotos();
  const [input, setInput] = useState('');
  const query = useDebounced(input.trim(), 300);
  const search = useSearchMyRecipes(query);

  const entries = useMemo(
    () => (published.data && photos.data ? buildTimeline(published.data, photos.data, timeZone) : []),
    [published.data, photos.data, timeZone],
  );
  const searching = query !== '';
  const matches = useMemo(() => new Map((search.data ?? []).map((m) => [m.recipe_id, m])), [search.data]);
  const shown: TimelineEntry[] = searching ? entries.filter((e) => e.kind === 'recipe' && matches.has(e.recipeId)) : entries;
  const groups = groupByMonth(shown, todayIn(timeZone));
  const urls = usePhotoUrls(shown.flatMap((e) => (e.thumbPath ? [e.thumbPath] : []))).data;

  const loading = published.isPending || photos.isPending;
  const failed = published.isError || photos.isError;
  const draftCount = drafts.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-11 items-center gap-2 rounded-card bg-surface pr-2 pl-3 focus-within:outline-2 focus-within:outline-ink">
        <Icon name="search" size={20} className="shrink-0 text-ink-muted" />
        <span className="sr-only"><FormattedMessage id="recipes.search.label" /></span>
        <input
          type="text"
          enterKeyHint="search"
          value={input}
          placeholder={intl.formatMessage({ id: 'recipes.search.placeholder' })}
          onChange={(e) => setInput(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
        />
        {input && (
          <button
            type="button"
            aria-label={intl.formatMessage({ id: 'recipes.search.clear' })}
            onClick={() => setInput('')}
            className="flex size-8 items-center justify-center border-0 bg-transparent text-ink"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </label>

      {!searching && draftCount > 0 && (
        <Link to="/recipes/drafts" className="flex h-12 items-center justify-between rounded-card bg-surface px-3 text-[15px] text-ink no-underline">
          <FormattedMessage id="recipes.drafts.row" values={{ count: draftCount }} />
          <Icon name="right" size={20} className="text-ink-muted" />
        </Link>
      )}

      {failed || search.isError ? (
        <p role="alert" className="m-0 text-caption text-error">
          <FormattedMessage id={searching && search.isError ? 'recipes.search.error' : 'recipes.loadError'} />
        </p>
      ) : loading || (searching && search.isPending) ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : searching && shown.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipes.search.none" /></p>
      ) : !searching && entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 px-8 pt-20 text-center">
          <Chef size={96} mood="quiet" />
          <p className="m-0 font-round text-card-title">{chef.line('emptyRecipes')}</p>
          <p className="m-0 text-[15px] leading-[1.7] text-ink-muted"><FormattedMessage id="recipes.empty.body" /></p>
          <Link to="/recipes/new" className="flex h-12 items-center rounded-card bg-bulb px-5 text-body font-bold text-ink no-underline">
            <FormattedMessage id="recipes.empty.action" />
          </Link>
        </div>
      ) : (
        <>
          {searching && (
            <p className="m-0 text-small text-ink-muted" role="status">
              <FormattedMessage id="recipes.search.count" values={{ count: shown.length }} />
            </p>
          )}
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g.key} className="flex flex-col gap-2">
                <h2 className="m-0 font-round text-card-title">
                  <FormattedMessage id={g.showYear ? 'recipes.monthYear' : 'recipes.month'} values={{ year: g.year, month: g.month }} />
                </h2>
                {g.entries.map((e) => {
                  const m = matches.get(e.recipeId);
                  return (
                    <RecipeCard
                      key={e.key}
                      entry={e}
                      query={searching && m?.match_kind === 'title' ? query : ''}
                      thumbUrl={e.thumbPath ? urls?.[e.thumbPath] : undefined}
                      label={
                        searching && m ? (
                          <span className="text-small text-ink-muted">
                            {m.match_kind === 'title' ? (
                              <FormattedMessage id="recipes.match.title" />
                            ) : (
                              <FormattedMessage
                                id="recipes.match.ingredient"
                                values={{ text: <Highlighted text={m.match_text} query={query} /> }}
                              />
                            )}
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
