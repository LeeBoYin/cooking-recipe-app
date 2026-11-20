import { FormattedMessage, useIntl } from 'react-intl';
import { useMyDeletedRecipes, useMyRecipePhotos, usePhotoUrls, useRestoreRecipe } from '../../data/hooks.ts';
import { recipeLimits } from '../../data/recipes.ts';
import { InnerHeader } from './InnerHeader.tsx';
import { daysLeft } from './timeline.ts';

// 最近刪除：保留期限內可以復原，之後真的刪掉（沒有紅色警告）
export function DeletedPage() {
  const intl = useIntl();
  const deleted = useMyDeletedRecipes();
  const photos = useMyRecipePhotos();
  const restore = useRestoreRecipe();
  const cover = (id: string) => photos.data?.find((p) => p.owner_id === id && !p.cook_note_id)?.thumb_path;
  const urls = usePhotoUrls((deleted.data ?? []).flatMap((d) => cover(d.id) ?? [])).data;
  return (
    <section>
      <InnerHeader title={intl.formatMessage({ id: 'recipes.deleted.title' })} />
      <p className="m-0 mb-2 text-small text-ink-muted">
        <FormattedMessage id="recipes.deleted.help" values={{ days: recipeLimits.softDeleteDays }} />
      </p>
      {deleted.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : deleted.isError ? (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="recipes.loadError" /></p>
      ) : deleted.data.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipes.deleted.empty" /></p>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
          {deleted.data.map((d) => {
            const path = cover(d.id);
            const date = intl.formatDate(d.created_at, { month: 'numeric', day: 'numeric' });
            const title = d.title?.trim() || intl.formatMessage({ id: 'recipe.view.untitled' }, { date });
            return (
              <li key={d.id} className="flex items-center gap-3 border-b border-line-soft px-3 py-2.5 last:border-b-0">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-card bg-photo-empty">
                  {path && urls?.[path] && <img src={urls[path]} alt="" className="max-h-full max-w-full object-contain" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="truncate text-body">{title}</b>
                  <span className="text-small text-ink-muted">
                    <FormattedMessage
                      id="recipes.deleted.left"
                      values={{ days: d.deleted_at ? daysLeft(d.deleted_at, recipeLimits.softDeleteDays) : 0 }}
                    />
                  </span>
                </span>
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(d.id)}
                  className="h-9 shrink-0 rounded-full border border-line bg-surface px-3 text-caption font-[inherit] text-ink disabled:opacity-50"
                >
                  <FormattedMessage id="recipes.deleted.restore" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {restore.isError && (
        <p role="alert" className="m-0 mt-2 text-caption text-error"><FormattedMessage id="recipes.deleted.error" /></p>
      )}
    </section>
  );
}
