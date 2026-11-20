import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { Icon } from '../shell/Icon.tsx';

// 內頁的頂端：返回加標題（草稿、最近刪除）
export function InnerHeader({ title }: { title: string }) {
  const intl = useIntl();
  const navigate = useNavigate();
  return (
    <div className="mb-2 flex items-center gap-2">
      <button
        type="button"
        aria-label={intl.formatMessage({ id: 'common.back' })}
        onClick={() => void navigate(-1)}
        className="flex size-11 shrink-0 items-center justify-center rounded-card border-0 bg-surface text-ink"
      >
        <Icon name="back" />
      </button>
      <h1 className="m-0 ml-1 flex-1 font-round text-heading">{title}</h1>
    </div>
  );
}
