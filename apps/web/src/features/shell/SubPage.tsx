import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { Icon } from './Icon.tsx';

// 內頁的頂端列：返回（沒有背景色）→ 標題（靠左、單行截斷）→ 右邊欄位（按鈕，或佔滿剩下寬度的搜尋框）。
// 有可見標題用 title；沒有就用 srTitle，只給讀屏軟體（17 第四節）。
export function TopBar({
  title,
  srTitle,
  right,
  rightFill,
  onBack,
  className = 'mb-3',
}: {
  title?: string;
  srTitle?: string;
  right?: ReactNode;
  rightFill?: boolean;
  onBack?: () => void;
  className?: string;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        aria-label={intl.formatMessage({ id: 'common.back' })}
        onClick={onBack ?? (() => void navigate(-1))}
        className="flex size-11 shrink-0 items-center justify-center rounded-card border-0 bg-transparent text-ink"
      >
        <Icon name="back" />
      </button>
      {title ? (
        <h1 className="m-0 min-w-0 flex-1 truncate font-round text-heading leading-tight font-bold">{title}</h1>
      ) : (
        srTitle && <h1 className="sr-only">{srTitle}</h1>
      )}
      {right && <div className={`flex min-w-0 items-center gap-1 ${rightFill ? 'flex-1' : 'ml-auto'}`}>{right}</div>}
    </div>
  );
}

export function SubPage({
  children,
  right,
  rightFill,
  title,
  srTitle,
}: {
  children: ReactNode;
  right?: ReactNode;
  rightFill?: boolean;
  title?: string;
  srTitle?: string;
}) {
  return (
    <section>
      <TopBar title={title} srTitle={srTitle ?? title} right={right} rightFill={rightFill} />
      {children}
    </section>
  );
}
