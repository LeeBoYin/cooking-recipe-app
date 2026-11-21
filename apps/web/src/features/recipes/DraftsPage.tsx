import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { useDeleteRecipe, useMyRecipePhotos, useMyRecipes, usePhotoUrls } from '../../data/hooks.ts';
import type { Recipe } from '../../data/recipes.ts';
import { Icon } from '../shell/Icon.tsx';
import { TopBar } from '../shell/SubPage.tsx';

const REVEAL = 88; // 左滑露出「刪除」的寬度

function Row({ draft, thumb, open, onOpen, onDelete }: {
  draft: Recipe;
  thumb: string | undefined;
  open: boolean;
  onOpen: (open: boolean) => void;
  onDelete: () => void;
}) {
  const intl = useIntl();
  const md = (iso: string) => intl.formatDate(iso, { month: 'numeric', day: 'numeric' });
  const title = draft.title?.trim() || intl.formatMessage({ id: 'recipe.view.untitled' }, { date: md(draft.created_at) });
  const [startX, setStartX] = useState<number | null>(null);
  return (
    <li
      className="relative overflow-hidden border-b border-line-soft last:border-b-0"
      onTouchStart={(e) => setStartX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const dx = (e.changedTouches[0]?.clientX ?? 0) - (startX ?? 0);
        if (dx < -40) onOpen(true);
        else if (dx > 40) onOpen(false);
        setStartX(null);
      }}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label={intl.formatMessage({ id: 'recipes.drafts.deleteAria' }, { title })}
        onClick={onDelete}
        style={{ width: REVEAL }}
        className="absolute inset-y-0 right-0 border-0 bg-error text-[15px] font-bold text-surface"
      >
        <FormattedMessage id="recipes.drafts.delete" />
      </button>
      <Link
        to={`/recipes/${draft.id}/edit`}
        style={{ transform: open ? `translateX(-${REVEAL}px)` : undefined, transition: 'transform 0.2s' }}
        className="relative flex items-center gap-3 bg-surface px-3 py-2.5 text-ink no-underline"
      >
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-card bg-photo-empty">
          {thumb && <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate text-body">{title}</b>
          <span className="text-small text-ink-muted">
            <FormattedMessage id="recipes.drafts.edited" values={{ date: md(draft.updated_at) }} />
          </span>
        </span>
        <Icon name="right" size={20} className="text-ink-muted" />
      </Link>
    </li>
  );
}

// 草稿匣：只有自己看得到，沒有催促的文案。左滑露出「刪除」（刪掉的進「我的 → 最近刪除」，可以復原）
export function DraftsPage() {
  const intl = useIntl();
  const drafts = useMyRecipes('draft');
  const photos = useMyRecipePhotos();
  const remove = useDeleteRecipe();
  const [openId, setOpenId] = useState<string | null>(null);
  const cover = (id: string) => photos.data?.find((p) => p.owner_id === id && !p.cook_note_id)?.thumb_path;
  const urls = usePhotoUrls((drafts.data ?? []).flatMap((d) => cover(d.id) ?? [])).data;
  return (
    <section>
      <TopBar title={intl.formatMessage({ id: 'recipes.drafts.title' })} />
      <p className="m-0 mb-2 text-small text-ink-muted"><FormattedMessage id="recipes.drafts.help" /></p>
      {drafts.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : drafts.isError ? (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="recipes.loadError" /></p>
      ) : drafts.data.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipes.drafts.empty" /></p>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-card bg-surface p-0">
          {drafts.data.map((d) => {
            const path = cover(d.id);
            return (
              <Row
                key={d.id}
                draft={d}
                thumb={path ? urls?.[path] : undefined}
                open={openId === d.id}
                onOpen={(o) => setOpenId(o ? d.id : null)}
                onDelete={() => remove.mutate(d.id)}
              />
            );
          })}
        </ul>
      )}
      {remove.isError && (
        <p role="alert" className="m-0 mt-2 text-caption text-error"><FormattedMessage id="recipes.deleted.error" /></p>
      )}
    </section>
  );
}
