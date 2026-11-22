import type { IdeaView } from './ideaView.ts';
import { IdeaTags } from './IdeaTags.tsx';
import { BookmarkButton } from './BookmarkButton.tsx';

// 大廚的點子卡片（17〈大廚的點子卡片〉）：菜名、一句理由、主要食材標籤，右上角收藏。
// 首頁：輪播裡的一張（寬度由輪播決定）、chef-soft 底；對話：全寬、直排、白底（放在 chef-soft 的對話旁邊）
export function IdeaCard({ view, layout = 'home', index, onOpen }: {
  view: IdeaView;
  index?: number; // 輪播裡的第幾張（圓點指示用）
  layout?: 'home' | 'chat';
  onOpen: () => void;
}) {
  const chat = layout === 'chat';
  return (
    <li data-index={index} className={`relative ${chat ? 'w-full' : 'w-full flex-none snap-center snap-always'}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex h-full w-full flex-col items-start gap-1 rounded-card border-0 py-2.5 pr-11 pl-3 text-left font-[inherit] text-ink ${chat ? 'bg-surface' : 'bg-chef-soft'}`}
      >
        <b className="w-full text-body">{view.title}</b>
        <span className="text-small leading-[1.4] text-ink-muted">{view.why}</span>
        <IdeaTags view={view} tone={chat ? 'bg' : 'surface'} />
      </button>
      <BookmarkButton view={view} />
    </li>
  );
}
