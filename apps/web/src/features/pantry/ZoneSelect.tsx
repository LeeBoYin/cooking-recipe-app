import { useIntl } from 'react-intl';
import type { StorageZone } from '../../data/pantry.ts';
import { ZONES, ZONE_ICON } from './labels.ts';
import { Icon } from '../shell/Icon.tsx';

// 放哪裡：四個分區排成一行，圖示在上、短名稱在下
export function ZoneSelect({ value, onChange }: { value: StorageZone; onChange: (z: StorageZone) => void }) {
  const intl = useIntl();
  return (
    <div role="radiogroup" aria-label={intl.formatMessage({ id: 'pantry.zone.label' })} className="grid grid-cols-4 gap-2">
      {ZONES.map((z) => (
        <button
          key={z}
          type="button"
          role="radio"
          aria-checked={value === z}
          onClick={() => onChange(z)}
          className={`min-h-[64px] rounded-card border px-1 py-2 text-small ${
            value === z ? 'border-ink bg-bulb-soft font-bold' : 'border-line bg-surface'
          }`}
        >
          <span className="flex flex-col items-center justify-center gap-1">
            <Icon name={ZONE_ICON[z]} size={20} />
            {intl.formatMessage({ id: `pantry.zone.${z}.short` })}
          </span>
        </button>
      ))}
    </div>
  );
}
