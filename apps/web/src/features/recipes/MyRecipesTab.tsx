import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, useMyRecipePhotos, useMyRecipes, usePhotoUrls, useSearchMyRecipes } from '../../data/hooks.ts';
import { todayIn } from '../pantry/dates.ts';
import { Icon } from '../shell/Icon.tsx';
import { Highlighted, RecipeCard } from './RecipeCard.tsx';
import { useRecipesQuery } from './RecipesPage.tsx';
import { buildTimeline, groupByMonth, type TimelineEntry } from './timeline.ts';

// 我的食譜：草稿列、依月分組（搜尋框在食譜頁外框）的時間軸（沒有篩選與其他排序，02 時間軸）
export function MyRecipesTab() {
  const chef = useChef();
  const { kitchen } = useCurrentKitchen();
  const timeZone = kitchen?.timezone ?? 'Asia/Taipei';
  const published = useMyRecipes('published');
  const drafts = useMyRecipes('draft');
  const photos = useMyRecipePhotos();
  const query = useRecipesQuery();
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
