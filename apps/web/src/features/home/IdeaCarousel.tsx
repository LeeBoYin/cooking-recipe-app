import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

// 首頁的點子輪播：一次一張、左右露邊，下方圓點只是指示（不能點）。
// 卡片寬度 = 螢幕寬 − 48px，由 children 用 w-full 撐滿這個容器的內容寬
export function IdeaCarousel({ count, resetKey, children }: { count: number; resetKey: string; children: ReactNode }) {
  const intl = useIntl();
  const listRef = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.index ?? 0));
        }
      },
      { root: list, threshold: 0.6 },
    );
    Array.from(list.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [count]);

  // 換一組之後回到第一張
  useEffect(() => {
    listRef.current?.scrollTo({ left: 0 });
    setCurrent(0);
  }, [resetKey]);

  return (
    <div>
      <ul ref={listRef} className="-mx-4 my-0 flex snap-x snap-mandatory list-none gap-2 overflow-x-auto px-6 pb-0 [scrollbar-width:none]">
        {children}
      </ul>
      {count > 1 && (
        <div role="img" aria-label={intl.formatMessage({ id: 'home.ideas.position' }, { current: current + 1, total: count })} className="flex justify-center gap-1.5 pt-2">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${i === current ? 'bg-ink' : 'bg-line-strong'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
