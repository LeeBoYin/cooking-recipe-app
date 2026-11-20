import { FormattedMessage } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';

// 還沒做的分頁
export function Placeholder() {
  return (
    <div className="flex flex-col items-center pt-16 text-center">
      <Chef size={96} />
      <p className="mt-4 text-caption text-ink-muted">
        <FormattedMessage id="placeholder.soon" />
      </p>
    </div>
  );
}
