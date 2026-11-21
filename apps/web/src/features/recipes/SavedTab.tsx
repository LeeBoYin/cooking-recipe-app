import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router';
import { difficultyOverall, parseTemperaturePref, type RecipeDraft } from '@zhusha/core';
import { getIngredient } from '@zhusha/ingredients';
import { baseDishes } from '@zhusha/taste';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { ideaOf, type Bookmark } from '../../data/bookmarks.ts';
import { useCurrentKitchen, useMyBookmarks, useMySettings, useUnbookmark } from '../../data/hooks.ts';
import { editorDraftOf, unitPrefs } from '../home/draft.ts';
import { IdeaSheet } from '../home/IdeaSheet.tsx';
import { dishTechniques, renderMarks, techniqueNames, type IdeaView } from '../home/ideaView.ts';
import { localDate, groupByMonth } from './timeline.ts';
import { todayIn } from '../pantry/dates.ts';

const dishById = new Map(baseDishes.map((d) => [d.id, d]));

function difficultyOf(baseDishId: string): number | null {
  const d = dishById.get(baseDishId)?.difficulty;
  if (!d) return null;
  return difficultyOverall({
    ingredients: d.ingredients, equipment: d.equipment, time: d.time, technique: d.technique, failure_risk: d.failureRisk,
  });
}

// 收藏：依收藏的月分組的時間軸。M0 只有大廚的點子（朋友的食譜 M2 才有）；
// 打開收藏的點子就是點子抽屜：已經展開過的直接顯示做法，還沒有的第一次打開時由大廚寫並存進收藏。
// 「做了，記錄一篇」在抽屜裡：開新食譜，帶入菜名、收藏的 ID，有做法的話也帶入食材與步驟
export function SavedTab() {
  const chef = useChef();
  const { kitchen } = useCurrentKitchen();
  const timeZone = kitchen?.timezone ?? 'Asia/Taipei';
  const bookmarks = useMyBookmarks();
  const entries = useMemo(
    () => (bookmarks.data ?? []).map((b) => ({ date: localDate(b.created_at, timeZone), bookmark: b })),
    [bookmarks.data, timeZone],
  );
  const groups = groupByMonth(entries, todayIn(timeZone));

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
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <h2 className="m-0 font-round text-card-title">
            <FormattedMessage id={g.showYear ? 'recipes.monthYear' : 'recipes.month'} values={{ year: g.year, month: g.month }} />
          </h2>
          {g.entries.map((e) => <SavedCard key={e.bookmark.id} bookmark={e.bookmark} />)}
        </section>
      ))}
    </div>
  );
}

// 收藏的點子轉成抽屜要顯示的內容（和首頁的卡片同一種形狀）
function viewOfBookmark(b: Bookmark, tempUnit: string | null | undefined): IdeaView {
  const idea = ideaOf(b);
  const nameOf = (id: string) => getIngredient(id)?.name['zh-TW'] ?? id;
  return {
    key: b.id,
    title: idea.title,
    why: renderMarks(idea.why ?? '', parseTemperaturePref(tempUnit)),
    kitchenHas: false,
    ingredients: b.idea_ingredient_ids.map((id) => ({ id, name: nameOf(id), have: false })),
    others: [],
    substitutions: [],
    techniques: idea.baseDishId ? dishTechniques(idea.baseDishId) : techniqueNames([]),
    source: idea.baseDishId ? 'dish' : 'ai',
    ...(idea.baseDishId ? { baseDishId: idea.baseDishId } : {}),
    ...(idea.suggestionId ? { suggestionId: idea.suggestionId } : {}),
  };
}

function SavedCard({ bookmark }: { bookmark: Bookmark }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const settings = useMySettings();
  const [open, setOpen] = useState(false);
  const idea = ideaOf(bookmark);
  const cooked = bookmark.cooked_recipe_id;
  const difficulty = idea.baseDishId ? difficultyOf(idea.baseDishId) : null;
  const unbookmark = useUnbookmark();
  const tag = 'rounded-tag px-2 py-0.5 text-small font-bold';
  return (
    <article className="relative flex gap-3 rounded-card bg-surface p-2.5">
      <div className="grid size-24 flex-none place-items-center rounded-card bg-bulb-soft" aria-hidden="true">
        <Chef size={40} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-small text-ink-muted"><FormattedMessage id="recipes.saved.chefIdea" /></span>
        <b className="font-round text-card-title">{idea.title}</b>
        {idea.why && <span className="text-small leading-normal text-ink-muted">{idea.why}</span>}
        <div className="flex flex-wrap gap-1.5">
          {cooked ? (
            <span className={`${tag} bg-green-soft text-green`}><FormattedMessage id="recipes.saved.cooked" /></span>
          ) : (
            <span className={`${tag} bg-bg text-ink-muted`}><FormattedMessage id="recipes.saved.notCooked" /></span>
          )}
          {!cooked && difficulty !== null && (
            <span className={`${tag} bg-bg text-ink-muted`}>
              <FormattedMessage id="recipes.saved.difficulty" values={{ value: difficulty }} />
            </span>
          )}
        </div>
        {cooked ? (
          <Link to={`/recipes/${cooked}`} className="text-small text-ink underline underline-offset-4 after:absolute after:inset-0">
            <FormattedMessage id="recipes.saved.open" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="self-start border-0 bg-transparent p-0 font-[inherit] text-small text-ink underline underline-offset-4 after:absolute after:inset-0"
          >
            <FormattedMessage id="idea.sheet.open" />
          </button>
        )}
        <button
          type="button"
          disabled={unbookmark.isPending}
          onClick={() => unbookmark.mutate(bookmark.id)}
          className="relative z-10 mt-0.5 h-9 self-start rounded-full border border-line bg-bg px-3 text-caption font-[inherit] text-ink-muted disabled:opacity-50"
        >
          <FormattedMessage id="recipes.saved.remove" />
        </button>
        {unbookmark.isError && <span role="alert" className="text-small text-error"><FormattedMessage id="recipes.saved.removeError" /></span>}
      </div>
      {open && (
        <IdeaSheet
          view={viewOfBookmark(bookmark, settings.data?.temperature_unit)}
          bookmarkId={bookmark.id}
          onClose={() => setOpen(false)}
          onRecord={(draft) => record(draft)}
        />
      )}
    </article>
  );

  function record(draft: RecipeDraft | null) {
    setOpen(false);
    const prefs = unitPrefs(settings.data, intl);
    void navigate('/recipes/new', {
      state: {
        title: idea.title,
        bookmarkId: bookmark.id,
        ...(draft ? { draft: editorDraftOf(draft, prefs, (minutes) => intl.formatMessage({ id: 'idea.sheet.method.timer' }, { minutes })) } : {}),
      },
    });
  }
}
