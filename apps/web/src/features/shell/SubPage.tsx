import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { Icon } from './Icon.tsx';

// 內頁：左上返回、中間不放標題（17 第四節）。右上角可放「更多」之類的按鈕。
export function SubPage({ children, right, srTitle }: { children: ReactNode; right?: ReactNode; srTitle: string }) {
  const intl = useIntl();
  const navigate = useNavigate();
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'common.back' })}
          onClick={() => void navigate(-1)}
          className="flex size-11 items-center justify-center rounded-card border-0 bg-surface text-ink"
        >
          <Icon name="back" />
        </button>
        {right}
      </div>
      <h1 className="sr-only">{srTitle}</h1>
      {children}
    </section>
  );
}
