import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ExpiryFields, type Expiry } from './ExpiryFields.tsx';

// 「2025-12-03」→「12/3」
function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

const PILL = 'min-h-11 rounded-full border px-4 text-caption';

// 食材卡的兩個膠囊：「想先用掉」是開關，「期限設定」點了在下面展開期限欄位（02 有效期限）
export function ItemOptions({ soon, onSoon, expiry, today, onExpiry }: {
  soon: boolean;
  onSoon: (v: boolean) => void;
  expiry: Expiry;
  today: string;
  onExpiry: (v: Expiry) => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={soon}
          onClick={() => onSoon(!soon)}
          className={`${PILL} ${soon ? 'border-ink bg-bulb font-bold text-ink' : 'border-line bg-surface text-ink'}`}
        >
          {intl.formatMessage({ id: 'pantry.useSoon' })}
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`${PILL} ${open || expiry.expires_at ? 'border-ink bg-bulb-soft font-bold text-ink' : 'border-line bg-surface text-ink'}`}
        >
          {expiry.expires_at
            ? intl.formatMessage({ id: 'pantry.expiry.setOn' }, { date: shortDate(expiry.expires_at) })
            : intl.formatMessage({ id: 'pantry.expiry.set' })}
        </button>
      </div>
      {open && <ExpiryFields value={expiry} today={today} onChange={onExpiry} />}
    </div>
  );
}
