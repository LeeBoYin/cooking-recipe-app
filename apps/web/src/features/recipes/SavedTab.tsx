import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { cookedStateOf, ideaOf, type Bookmark } from '../../data/bookmarks.ts';
import { useCurrentKitchen, useMyBookmarks, useMySettings, usePantryItems } from '../../data/hooks.ts';
import { mainIngredientTags, type IdeaView } from '../home/ideaView.ts';
import { viewOfBookmark } from './SavedIdeaPage.tsx';
import { useRecipesQuery } from './RecipesPage.tsx';
import { localDate, groupByMonth } from './timeline.ts';
import { todayIn } from '../pantry/dates.ts';

// 收藏：依收藏的月分組的時間軸。M0 只有大廚的點子（朋友的食譜 M2 才有）；
// 點卡片打開收藏的完整頁（SavedIdeaPage）：已經展開過的直接顯示做法，還沒有的第一次打開時由大廚寫並存進收藏。
export function SavedTab() {
  const chef = useChef();
  const { kitchen } = useCurrentKitchen();
  const timeZone = kitchen?.timezone ?? 'Asia/Taipei';
  const bookmarks = useMyBookmarks();
  const entries = useMemo(
    () => (bookmarks.data ?? []).map((b) => ({ date: localDate(b.created_at, timeZone), bookmark: b })),
    [bookmarks.data, timeZone],
  );
  const settings = useMySettings();
  const pantry = usePantryItems(kitchen?.id);
  const pantryIds = useMemo(() => new Set((pantry.data ?? []).flatMap((p) => (p.ingredient_id ? [p.ingredient_id] : []))), [pantry.data]);
  // 收藏的數量少，搜尋在手機端比對點子名稱與主要食材
  const query = useRecipesQuery().toLowerCase();
  const views = useMemo(
    () => new Map(entries.map((e) => [e.bookmark.id, viewOfBookmark(e.bookmark, settings.data?.temperature_unit, pantryIds)])),
    [entries, settings.data?.temperature_unit, pantryIds],
  );
  const shown = query === ''
    ? entries
    : entries.filter((e) => {
        const v = views.get(e.bookmark.id);
        return ideaOf(e.bookmark).title.toLowerCase().includes(query) || (v?.ingredients ?? []).some((i) => i.name.toLowerCase().includes(query));
      });
  const groups = groupByMonth(shown, todayIn(timeZone));

  if (bookmarks.isError) {
    return (
      <p role="alert" className="m-0 text-caption text-error">
        <FormattedMessage id="recipes.saved.loadError" />
      </p>
    );
  }
  if (bookmarks.isPending) {
    return <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>;
  }
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3.5 px-8 pt-20 text-center">
        <Chef size={96} mood="quiet" />
        <p className="m-0 font-round text-card-title">{chef.line('emptySaved')}</p>
        <p className="m-0 text-[15px] leading-[1.7] text-ink-muted"><FormattedMessage id="recipes.saved.empty.body" /></p>
      </div>
    );
  }
  if (shown.length === 0) {
    return <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="recipes.search.none" /></p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <h2 className="m-0 font-round text-card-title">
            <FormattedMessage id={g.showYear ? 'recipes.monthYear' : 'recipes.month'} values={{ year: g.year, month: g.month }} />
          </h2>
          {g.entries.map((e) => <SavedCard key={e.bookmark.id} bookmark={e.bookmark} view={views.get(e.bookmark.id)!} />)}
        </section>
      ))}
    </div>
  );
}

function SavedCard({ bookmark, view }: { bookmark: Bookmark; view: IdeaView }) {
  const idea = ideaOf(bookmark);
  const cooked = cookedStateOf(bookmark).kind === 'published';
  const { names, extra } = mainIngredientTags(view);
  const tag = 'whitespace-nowrap rounded-tag px-2 py-0.5 text-small font-bold';
  return (
    <article className="relative flex gap-3 rounded-card bg-surface p-2.5">
      <div className="grid size-24 flex-none place-items-center rounded-card bg-bulb-soft" aria-hidden="true">
        <Chef size={40} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-small text-ink-muted"><FormattedMessage id="recipes.saved.chefIdea" /></span>
        <Link to={`/recipes/saved/${bookmark.id}`} className="font-round text-card-title font-bold text-ink no-underline after:absolute after:inset-0">
          {idea.title}
        </Link>
        {idea.why && <span className="text-small leading-normal text-ink-muted">{idea.why}</span>}
        {/* 一行放不下的標籤不顯示：固定一行高，換行的標籤被裁掉 */}
        <div className="flex h-[26px] flex-wrap gap-1.5 overflow-hidden">
          {cooked ? (
            <span className={`${tag} bg-green-soft text-green`}><FormattedMessage id="recipes.saved.cooked" /></span>
          ) : (
            <span className={`${tag} bg-bg text-ink-muted`}><FormattedMessage id="recipes.saved.notCooked" /></span>
          )}
          {names.map((n) => <span key={n} className={`${tag} bg-green-soft text-green`}>{n}</span>)}
          {extra > 0 && <span className={`${tag} bg-green-soft text-green`}><FormattedMessage id="home.ideas.tagMore" values={{ count: extra }} /></span>}
        </div>
      </div>
    </article>
  );
}
