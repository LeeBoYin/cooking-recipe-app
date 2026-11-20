import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import type { TimelineEntry } from './timeline.ts';

const TILT = ['-rotate-3', 'rotate-2'];

// 把符合的字標出來（不分大小寫）
export function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-bulb-soft text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// 時間軸的食譜卡：左邊縮圖（不裁切、置中），右邊菜名、心得、貼紙（17 我的食譜）。卡片上不放日期。
export function RecipeCard({ entry, thumbUrl, label, query = '' }: {
  entry: TimelineEntry;
  thumbUrl?: string;
  label?: ReactNode; // 菜名上方的一行：「又做了一次」標籤或搜尋的符合說明
  query?: string;
}) {
  const intl = useIntl();
  const title =
    entry.title ??
    intl.formatMessage({ id: 'recipe.view.untitled' }, { date: intl.formatDate(`${entry.date}T00:00:00`, { month: 'numeric', day: 'numeric' }) });
  return (
    <Link to={`/recipes/${entry.recipeId}`} className="flex gap-3 rounded-card bg-surface p-2.5 text-ink no-underline">
      <div className="relative shrink-0">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-card bg-photo-empty">
          {thumbUrl && <img src={thumbUrl} alt="" className="max-h-full max-w-full object-contain" />}
        </div>
        {entry.photoCount > 1 && (
          <span className="absolute right-1 bottom-1 rounded-tag bg-ink/70 px-1.5 text-small font-bold text-surface">
            <FormattedMessage id="recipes.card.photos" values={{ count: entry.photoCount }} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {entry.kind === 'cook_note' && (
          <span className="self-start rounded-tag bg-line-soft px-2 text-small font-bold text-ink-muted">
            <FormattedMessage id="recipes.card.cookAgain" />
          </span>
        )}
        {label}
        <b className="font-round text-card-title">
          <Highlighted text={title} query={query} />
        </b>
        {entry.text && <span className="line-clamp-2 text-small leading-normal text-ink-muted">{entry.text}</span>}
        {entry.highlights.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {entry.highlights.map((h, i) => (
              <span key={h} className={`inline-block ${TILT[i % 2]} rounded-[4px] border-[1.5px] border-dashed border-ink bg-surface px-2 py-px text-small font-bold`}>
                <FormattedMessage id={`highlight.${h}`} />
              </span>
            ))}
          </span>
        )}
      </div>
    </Link>
  );
}
