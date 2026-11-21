import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import type { Bookmark } from '../../data/bookmarks.ts';
import { useBookmarkIdea, useUnbookmark } from '../../data/hooks.ts';
import type { IdeaView } from './ideaView.ts';

// 點子抽屜：菜名、理由、主要食材（廚房有的標「廚房有」）、其他材料與替代說明（AI 的點子）。
// 基礎菜色的主按鈕是「收藏」（已收藏顯示「已收藏」，再按取消）；自己的食譜不收藏，主按鈕是「打開食譜」；
// AI 想出來的變化版與新挑戰還不能收藏（收藏點子的擴充是 M1a-10），只有「記錄一篇」
export function IdeaSheet({ view, bookmark, onClose }: {
  view: IdeaView;
  bookmark?: Bookmark | undefined;
  onClose: () => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const chef = useChef();
  const reason = view.why;
  // 收藏後，大廚的話換成一句回應
  const saved = bookmark && view.baseDishId ? chef.line('bookmarked', { title: view.title }, view.key) : null;
  const add = useBookmarkIdea();
  const remove = useUnbookmark();
  const busy = add.isPending || remove.isPending;
  const failed = add.isError || remove.isError;

  function toggle() {
    if (bookmark) remove.mutate(bookmark.id);
    else if (view.baseDishId) add.mutate({ title: view.title, why: reason, baseDishId: view.baseDishId });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/45" onClick={onClose}>
      <div
        role="dialog"
        aria-label={view.title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-3.5 overflow-y-auto rounded-t-2xl bg-bg px-5 pt-2.5 pb-[calc(28px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-sm bg-line-strong" />
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap rounded-tag bg-bulb-soft px-2 py-0.5 text-small font-bold">
            <FormattedMessage id={view.source === 'own' ? 'idea.sheet.ownBadge' : 'idea.sheet.badge'} />
          </span>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: 'idea.sheet.close' })}
            onClick={onClose}
            className="ml-auto h-11 w-11 border-0 bg-transparent text-[20px] text-ink-muted"
          >
            ×
          </button>
        </div>
        <b className="-mt-2 text-[24px]">{view.title}</b>
        <div className="flex items-center gap-2.5 rounded-card bg-chef-soft px-3 py-2.5">
          <Chef size={40} mood={saved ? 'happy' : 'idea'} />
          <span className="font-round text-[15px] leading-normal" aria-live="polite">
            {saved ?? (/[。！？」」…]$/.test(reason) ? reason : `${reason}。`)}
          </span>
        </div>
        {view.ingredients.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="m-0 text-caption font-normal text-ink-muted">
              <FormattedMessage id="idea.sheet.ingredients" />
            </h2>
            <ul className="m-0 list-none p-0">
              {view.ingredients.map((ing) => (
                <li key={ing.name} className="flex min-h-10 items-center justify-between border-b border-line-soft text-body">
                  {ing.name}
                  {ing.have && (
                    <span className="whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green">
                      <FormattedMessage id="idea.sheet.kitchenHas" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {view.others.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="m-0 text-caption font-normal text-ink-muted">
              <FormattedMessage id="idea.sheet.others" />
            </h2>
            <p className="m-0 text-body">{view.others.join('、')}</p>
          </section>
        )}
        {view.substitutions.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-caption text-ink-muted">
            {view.substitutions.map((s) => (
              <li key={s.need}>
                <FormattedMessage id="idea.sheet.substitute" values={{ need: s.need, use: s.use }} />
              </li>
            ))}
          </ul>
        )}
        {view.source === 'own' && view.recipeId && (
          <button
            type="button"
            onClick={() => void navigate(`/recipes/${view.recipeId}`)}
            className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink"
          >
            <FormattedMessage id="idea.sheet.openRecipe" />
          </button>
        )}
        {view.source === 'ai' && (
          <button
            type="button"
            onClick={() => void navigate('/recipes/new', { state: { title: view.title } })}
            className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink"
          >
            <FormattedMessage id="idea.sheet.recordMain" />
          </button>
        )}
        {view.baseDishId && (
          <>
            <button
              type="button"
              aria-pressed={!!bookmark}
              disabled={busy}
              onClick={toggle}
              className={`h-12 rounded-card border-2 border-ink font-[inherit] text-body font-bold text-ink ${bookmark ? 'bg-surface' : 'bg-bulb'}`}
            >
              <FormattedMessage id={bookmark ? 'idea.sheet.bookmarked' : 'idea.sheet.bookmark'} />
            </button>
            {failed && (
              <p role="alert" className="m-0 text-caption text-error">
                <FormattedMessage id="idea.sheet.bookmarkError" />
              </p>
            )}
            <button
              type="button"
              onClick={() => void navigate('/recipes/new', { state: { title: view.title, bookmarkId: bookmark?.id } })}
              className="-mt-1.5 h-10 border-0 bg-transparent font-[inherit] text-caption text-ink-muted"
            >
              <FormattedMessage id="idea.sheet.record" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
