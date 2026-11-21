import { FormattedMessage } from 'react-intl';
import type { IdeaView } from './ideaView.ts';
import { BookmarkButton } from './BookmarkButton.tsx';

// 大廚的點子卡片（17〈大廚的點子卡片〉）：菜名、一句理由、一個標籤，右上角收藏。
// 首頁：148px 寬、chef-soft 底，一排左右滑；對話：全寬、直排、白底（放在 chef-soft 的對話旁邊）
export function IdeaCard({ view, layout = 'home', onOpen }: {
  view: IdeaView;
  layout?: 'home' | 'chat';
  onOpen: () => void;
}) {
  const chat = layout === 'chat';
  return (
    <li className={`relative ${chat ? 'w-full' : 'w-[148px] flex-none snap-start'}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex h-full w-full flex-col items-start gap-1 rounded-card border-0 py-2.5 pr-11 pl-3 text-left font-[inherit] text-ink ${chat ? 'bg-surface' : 'bg-chef-soft'}`}
      >
        <b className={`w-full text-body ${chat ? '' : 'truncate'}`}>{view.title}</b>
        <span className="text-small leading-[1.4] text-ink-muted">{view.why}</span>
        {view.kitchenHas ? (
          <span className="mt-0.5 whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green">
            <FormattedMessage id="home.ideas.kitchenHas" />
          </span>
        ) : view.difficulty ? (
          <span className={`mt-0.5 whitespace-nowrap rounded-tag px-2 py-0.5 text-small text-ink-muted ${chat ? 'bg-bg' : 'bg-surface'}`}>
            <FormattedMessage id="home.ideas.difficulty" values={{ value: view.difficulty }} />
          </span>
        ) : null}
      </button>
      <BookmarkButton view={view} />
    </li>
  );
}
