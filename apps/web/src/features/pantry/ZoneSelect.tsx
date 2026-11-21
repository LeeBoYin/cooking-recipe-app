import { useIntl } from 'react-intl';
import type { StorageZone } from '../../data/pantry.ts';
import { ZONES, ZONE_ICON } from './labels.ts';
import { Icon } from '../shell/Icon.tsx';

// 放哪裡：四個分區
export function ZoneSelect({ value, onChange }: { value: StorageZone; onChange: (z: StorageZone) => void }) {
  const intl = useIntl();
  return (
    <div role="radiogroup" aria-label={intl.formatMessage({ id: 'pantry.zone.label' })} className="grid grid-cols-2 gap-2">
      {ZONES.map((z) => (
        <button
          key={z}
          type="button"
          role="radio"
          aria-checked={value === z}
          onClick={() => onChange(z)}
          className={`min-h-11 rounded-card border px-2 text-caption ${
            value === z ? 'border-ink bg-bulb-soft font-bold' : 'border-line bg-surface'
          }`}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <Icon name={ZONE_ICON[z]} size={20} />
            {intl.formatMessage({ id: `pantry.zone.${z}` })}
          </span>
        </button>
      ))}
    </div>
  );
}
