import { FormattedMessage } from 'react-intl';
import { IdeaCarousel } from './IdeaCarousel.tsx';

// 大廚的點子還沒到時的骨架卡（首次沒有上次的點子、按「換一組」等新的一組）：
// 和點子卡同寬、同高，淡淡的光掃過；減少動態時不閃
export function IdeaSkeletons({ count = 3 }: { count?: number }) {
  return (
    <>
      <p role="status" className="sr-only"><FormattedMessage id="home.ideas.thinking" /></p>
      <IdeaCarousel count={count} resetKey="skeleton">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} data-index={i} aria-hidden="true" className="w-full flex-none snap-center snap-always">
            <div className="skeleton-shimmer flex h-[117px] flex-col gap-2 rounded-card bg-chef-soft py-3 pr-11 pl-3">
              <span className="h-4 w-2/3 rounded-tag bg-line-soft" />
              <span className="h-3 w-full rounded-tag bg-line-soft" />
              <span className="h-3 w-1/2 rounded-tag bg-line-soft" />
            </div>
          </li>
        ))}
      </IdeaCarousel>
    </>
  );
}
