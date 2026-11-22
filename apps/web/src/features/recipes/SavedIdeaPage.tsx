import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { parseTemperaturePref, type ExpandInput } from '@zhusha/core';
import { getIngredient } from '@zhusha/ingredients';
import { Chef } from '../../chef/Chef.tsx';
import { ideaOf, type Bookmark } from '../../data/bookmarks.ts';
import { useCurrentKitchen, useExpandSteps, useMyBookmarks, useMySettings, usePantryItems } from '../../data/hooks.ts';
import { editorDraftOf, unitPrefs } from '../home/draft.ts';
import { MethodSection } from '../home/IdeaSheet.tsx';
import { dishTechniques, renderMarks, techniqueNames, type IdeaView } from '../home/ideaView.ts';
import { useIdeaBookmark } from '../home/useIdeaBookmark.ts';
import { TopBar } from '../shell/SubPage.tsx';

// 收藏的點子轉成要顯示的內容（和首頁的卡片同一種形狀）；pantryIds：廚房現有的食材，用來標「廚房有」
export function viewOfBookmark(b: Bookmark, tempUnit: string | null | undefined, pantryIds: ReadonlySet<string>): IdeaView {
  const idea = ideaOf(b);
  const nameOf = (id: string) => getIngredient(id)?.name['zh-TW'] ?? id;
  return {
    key: b.id,
    title: idea.title,
    why: renderMarks(idea.why ?? '', parseTemperaturePref(tempUnit)),
    kitchenHas: false,
    ingredients: b.idea_ingredient_ids.map((id) => ({ id, name: nameOf(id), have: pantryIds.has(id) })),
    others: [],
    substitutions: [],
    techniques: idea.baseDishId ? dishTechniques(idea.baseDishId) : techniqueNames([]),
    source: idea.baseDishId ? 'dish' : 'ai',
    ...(idea.baseDishId ? { baseDishId: idea.baseDishId } : {}),
    ...(idea.suggestionId ? { suggestionId: idea.suggestionId } : {}),
  };
}

// 收藏的大廚點子的完整頁（/recipes/saved/:bookmarkId）：排版像食譜頁——菜名、理由、食材、步驟。
// 做法第一次打開時由大廚寫（和點子抽屜同一個 hook 與同一組等待、失敗畫面）。
// 取消收藏之後留在頁面，可以再按回來；離開頁面清單才會少一張，所以頁面自己留一份收藏的快照。
export function SavedIdeaPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { bookmarkId = '' } = useParams();
  const bookmarks = useMyBookmarks();
  const settings = useMySettings();
  const { kitchen } = useCurrentKitchen();
  const pantry = usePantryItems(kitchen?.id);

  const live = bookmarks.data?.find((b) => b.id === bookmarkId);
  const [snapshot, setSnapshot] = useState<Bookmark | null>(null);
  useEffect(() => {
    if (live) setSnapshot(live);
  }, [live]);
  const bookmark = live ?? snapshot;

  const pantryIds = useMemo(() => new Set((pantry.data ?? []).flatMap((p) => (p.ingredient_id ? [p.ingredient_id] : []))), [pantry.data]);
  const view = useMemo(
    () => (bookmark ? viewOfBookmark(bookmark, settings.data?.temperature_unit, pantryIds) : null),
    [bookmark, settings.data?.temperature_unit, pantryIds],
  );

  const back = () => void navigate('/recipes/saved');
  if (!view || !bookmark) {
    return (
      <section>
        <TopBar onBack={back} srTitle={intl.formatMessage({ id: 'recipes.savedIdea.title' })} />
        {bookmarks.isPending ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
        ) : (
          <p role="alert" className="m-0 text-caption text-ink-muted"><FormattedMessage id={bookmarks.isError ? 'recipes.saved.loadError' : 'recipes.savedIdea.notFound'} /></p>
        )}
      </section>
    );
  }
  return <Loaded bookmark={bookmark} view={view} onBack={back} />;
}

function Loaded({ bookmark, view, onBack }: { bookmark: Bookmark; view: IdeaView; onBack: () => void }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const settings = useMySettings();
  // 做法的來源固定用打開時的那一筆：取消收藏之後（那筆已經不在了）畫面上的做法還在
  const [input] = useState<ExpandInput>({ bookmarkId: bookmark.id });
  const expand = useExpandSteps(input);
  const draft = expand.data?.draft ?? null;
  const saved = useIdeaBookmark(view);
  const current = saved.bookmark;
  const cooked = current?.cooked_recipe_id ?? bookmark.cooked_recipe_id;
  const reason = view.why;

  function record() {
    const prefs = unitPrefs(settings.data, intl);
    void navigate('/recipes/new', {
      state: {
        title: view.title,
        ...(current ? { bookmarkId: current.id } : {}),
        ...(draft ? { draft: editorDraftOf(draft, prefs, (minutes) => intl.formatMessage({ id: 'idea.sheet.method.timer' }, { minutes })) } : {}),
      },
    });
  }

  const pill = 'whitespace-nowrap rounded-tag px-2 py-0.5 text-small font-bold';
  return (
    <section className="pb-[calc(112px+env(safe-area-inset-bottom))]">
      <TopBar onBack={onBack} srTitle={view.title} />
      <div className="flex flex-col gap-3.5">
        <span className={`${pill} self-start bg-bulb-soft`}><FormattedMessage id="idea.sheet.badge" /></span>
        <h1 className="m-0 font-round text-[24px] leading-tight font-bold">{view.title}</h1>
        {reason && (
          <div className="flex items-center gap-2.5 rounded-card bg-chef-soft px-3 py-2.5">
            <Chef size={40} mood="idea" />
            <span className="font-round text-[15px] leading-normal">{/[。！？」…]$/.test(reason) ? reason : `${reason}。`}</span>
          </div>
        )}
        {!draft && view.ingredients.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="m-0 text-caption font-normal text-ink-muted"><FormattedMessage id="idea.sheet.ingredients" /></h2>
            <ul className="m-0 list-none p-0">
              {view.ingredients.map((ing) => (
                <li key={ing.name} className="flex min-h-10 items-center justify-between border-b border-line-soft text-body">
                  {ing.name}
                  {ing.have && <span className={`${pill} bg-green-soft text-green`}><FormattedMessage id="idea.sheet.kitchenHas" /></span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <MethodSection
          view={view}
          hasInput
          pending={expand.isPending}
          failed={expand.isError}
          retrying={expand.isFetching}
          draft={draft}
          onRetry={() => void expand.refetch()}
        />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[560px] flex-col gap-1.5 border-t border-line bg-bg px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]">
        {saved.failed && <span role="alert" className="text-small text-error"><FormattedMessage id="idea.card.bookmarkError" /></span>}
        {cooked && (
          <Link to={`/recipes/${cooked}`} className="text-center text-caption text-ink underline underline-offset-4">
            <FormattedMessage id="recipes.saved.open" />
          </Link>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={!!current}
            disabled={saved.busy || !saved.can}
            onClick={saved.toggle}
            className="h-12 flex-1 rounded-card border border-line bg-surface font-[inherit] text-body text-ink disabled:opacity-50"
          >
            <FormattedMessage id={current ? 'home.ideas.bookmarked' : 'idea.sheet.bookmark'} />
          </button>
          <button
            type="button"
            onClick={record}
            className="h-12 flex-[1.4] rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink"
          >
            <FormattedMessage id="idea.sheet.record" />
          </button>
        </div>
      </div>
    </section>
  );
}
