import { useIntl } from 'react-intl';
import type { DateType } from '../../data/pantry.ts';
import { addDays, addMonths } from './dates.ts';

export type Expiry = { expires_at: string | null; date_type: DateType | null };

const QUICK: { id: string; label: string; apply: (today: string) => string }[] = [
  { id: 'week', label: 'pantry.expiry.week', apply: (t) => addDays(t, 7) },
  { id: 'month', label: 'pantry.expiry.month', apply: (t) => addMonths(t, 1) },
  { id: 'three', label: 'pantry.expiry.threeMonths', apply: (t) => addMonths(t, 3) },
  { id: 'half', label: 'pantry.expiry.halfYear', apply: (t) => addMonths(t, 6) },
];

// 有效期限（選填）：快捷按鈕加自選日期，兩種日期類型。放在「更多選項」裡（02 有效期限）
export function ExpiryFields({ value, today, onChange }: { value: Expiry; today: string; onChange: (v: Expiry) => void }) {
  const intl = useIntl();
  const set = (expires_at: string | null) =>
    onChange({ expires_at, date_type: expires_at ? (value.date_type ?? 'best-before') : null });
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-small text-ink-muted">{intl.formatMessage({ id: 'pantry.expiry.help' })}</p>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => set(q.apply(today))}
            className="min-h-11 rounded-full border border-line bg-surface px-3 text-caption text-ink"
          >
            {intl.formatMessage({ id: q.label })}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label={intl.formatMessage({ id: 'pantry.expiry.date' })}
          value={value.expires_at ?? ''}
          min={today}
          onChange={(e) => set(e.target.value || null)}
          className="h-12 flex-1 rounded-card border border-line bg-surface px-3 text-body text-ink"
        />
        {value.expires_at && (
          <button
            type="button"
            onClick={() => set(null)}
            className="min-h-11 border-0 bg-transparent px-2 text-caption font-bold text-ink underline underline-offset-4"
          >
            {intl.formatMessage({ id: 'pantry.expiry.clear' })}
          </button>
        )}
      </div>
      {value.expires_at && (
        <div role="radiogroup" aria-label={intl.formatMessage({ id: 'pantry.expiry.type' })} className="flex gap-2">
          {(['best-before', 'use-by'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={value.date_type === t}
              onClick={() => onChange({ ...value, date_type: t })}
              className={`min-h-11 flex-1 rounded-card border px-3 text-caption ${
                value.date_type === t ? 'border-ink bg-bulb-soft font-bold' : 'border-line bg-surface'
              }`}
            >
              {intl.formatMessage({ id: `pantry.expiry.${t}` })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
