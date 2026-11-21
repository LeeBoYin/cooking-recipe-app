import { useIntl } from 'react-intl';
import type { IdeaView } from './ideaView.ts';
import { useIdeaBookmark } from './useIdeaBookmark.ts';

// 卡片右上角的收藏圖示（20px 線條，收藏後填 bulb；點擊範圍 44px）：點一下收藏或取消，不打開抽屜
export function BookmarkButton({ view }: { view: IdeaView }) {
  const intl = useIntl();
  const { can, bookmark, toggle, busy, failed } = useIdeaBookmark(view);
  if (!can) return null;
  const saved = !!bookmark;
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={intl.formatMessage({ id: failed ? 'idea.card.bookmarkError' : saved ? 'home.ideas.bookmarked' : 'idea.sheet.bookmark' })}
      disabled={busy}
      onClick={toggle}
      className="absolute top-0 right-0 grid h-11 w-11 place-items-center border-0 bg-transparent p-0 text-ink"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? 'var(--color-bulb)' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3.5h12v17l-6-4.2-6 4.2z" />
      </svg>
    </button>
  );
}
