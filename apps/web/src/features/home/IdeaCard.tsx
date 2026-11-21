import { FormattedMessage, useIntl } from 'react-intl';
import type { Idea, TasteProfile } from '@zhusha/core';
import { reasonMessage } from './reason.ts';

// 大廚的點子卡片（17〈大廚的點子卡片〉）：菜名、一句理由、一個標籤
export function IdeaCard({ idea, profile, bookmarked, onOpen }: {
  idea: Idea;
  profile: TasteProfile;
  bookmarked: boolean;
  onOpen: () => void;
}) {
  const intl = useIntl();
  const reason = reasonMessage(idea.reason, profile);
  return (
    <li className="w-[148px] flex-none snap-start">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col items-start gap-1 rounded-card border-0 bg-chef-soft px-3 py-2.5 text-left font-[inherit] text-ink"
      >
        <span className="flex w-full items-center gap-1">
          <b className="min-w-0 flex-1 truncate text-body">{idea.title}</b>
          {bookmarked && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={intl.formatMessage({ id: 'home.ideas.bookmarked' })} className="flex-none">
              <path d="M6 3h12v18l-6-4.5L6 21z" />
            </svg>
          )}
        </span>
        <span className="text-small leading-[1.4] text-ink-muted">{intl.formatMessage({ id: reason.id }, reason.values)}</span>
        {idea.allInKitchen ? (
          <span className="mt-0.5 whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green">
            <FormattedMessage id="home.ideas.kitchenHas" />
          </span>
        ) : idea.difficulty ? (
          <span className="mt-0.5 whitespace-nowrap rounded-tag bg-surface px-2 py-0.5 text-small text-ink-muted">
            <FormattedMessage id="home.ideas.difficulty" values={{ value: idea.difficulty }} />
          </span>
        ) : null}
      </button>
    </li>
  );
}
