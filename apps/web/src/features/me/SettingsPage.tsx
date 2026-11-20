import { FormattedMessage, useIntl } from 'react-intl';
import { useMySettings, useUpdateSettings } from '../../data/hooks.ts';
import { SubPage } from '../shell/SubPage.tsx';

const PERSONAS = ['warm', 'coach', 'punny', 'minimal'] as const;

function Segmented({ label, options, value, onPick }: { label: string; options: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 rounded-card bg-line-soft p-[3px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onPick(o.id)}
          className={`h-[38px] rounded-lg border-0 font-[inherit] text-[15px] ${value === o.id ? 'bg-surface font-bold text-ink' : 'bg-transparent text-ink-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 我的 → 設定：平常煮幾人份、單位、大廚的語氣。每改一項就存。
export function SettingsPage() {
  const intl = useIntl();
  const settings = useMySettings();
  const update = useUpdateSettings();
  const srTitle = intl.formatMessage({ id: 'settings.title' });

  if (settings.isError) {
    return <SubPage srTitle={srTitle}><p role="alert" className="text-caption text-error"><FormattedMessage id="me.loadError" /></p></SubPage>;
  }
  if (!settings.data) {
    return <SubPage srTitle={srTitle}><p className="text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p></SubPage>;
  }
  const s = settings.data;
  const size = s.household_size;
  const setSize = (n: number) => update.mutate({ household_size: Math.min(20, Math.max(1, n)) });
  // 資料庫也允許同時顯示兩種單位（例 C+F）；這裡只提供單選，以第一個為準
  const temperature = s.temperature_unit.startsWith('F') ? 'F' : 'C';
  const measure = s.measure_unit.startsWith('us') ? 'us' : 'metric';

  return (
    <SubPage srTitle={srTitle}>
      <div className="flex flex-col gap-[18px]">
        <b className="text-card-title"><FormattedMessage id="settings.title" /></b>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-caption font-bold text-ink-muted"><FormattedMessage id="settings.servings" /></h2>
          <div className="flex items-center justify-between rounded-card bg-surface py-1.5 pr-1.5 pl-3">
            <span className="text-[15px] text-ink-muted"><FormattedMessage id="settings.servings.hint" /></span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={intl.formatMessage({ id: 'settings.servings.less' })} disabled={size <= 1} onClick={() => setSize(size - 1)} className="size-11 rounded-full border border-line bg-surface text-[20px] text-ink disabled:opacity-40">−</button>
              <b className="w-12 text-center text-[18px]"><FormattedMessage id="settings.servings.value" values={{ count: size }} /></b>
              <button type="button" aria-label={intl.formatMessage({ id: 'settings.servings.more' })} disabled={size >= 20} onClick={() => setSize(size + 1)} className="size-11 rounded-full border border-line bg-surface text-[20px] text-ink disabled:opacity-40">＋</button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-caption font-bold text-ink-muted"><FormattedMessage id="settings.units" /></h2>
          <Segmented
            label={intl.formatMessage({ id: 'settings.temperature' })}
            value={temperature}
            options={[{ id: 'C', label: intl.formatMessage({ id: 'settings.temperature.C' }) }, { id: 'F', label: intl.formatMessage({ id: 'settings.temperature.F' }) }]}
            onPick={(id) => update.mutate({ temperature_unit: id })}
          />
          <Segmented
            label={intl.formatMessage({ id: 'settings.measure' })}
            value={measure}
            options={[{ id: 'metric', label: intl.formatMessage({ id: 'settings.measure.metric' }) }, { id: 'us', label: intl.formatMessage({ id: 'settings.measure.us' }) }]}
            onPick={(id) => update.mutate({ measure_unit: id })}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-caption font-bold text-ink-muted"><FormattedMessage id="settings.persona" /></h2>
          <div role="radiogroup" aria-label={intl.formatMessage({ id: 'settings.persona' })} className="overflow-hidden rounded-card bg-surface">
            {PERSONAS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={s.chef_persona === p}
                onClick={() => update.mutate({ chef_persona: p })}
                className="flex w-full items-start gap-2.5 border-0 border-b border-line-soft bg-transparent p-3 text-left font-[inherit] text-ink last:border-b-0"
              >
                <span aria-hidden="true" className={`mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${s.chef_persona === p ? 'border-ink' : 'border-line-strong'}`}>
                  {s.chef_persona === p && <span className="size-2.5 rounded-full bg-ink" />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <b className="text-[15px]"><FormattedMessage id={`settings.persona.${p}`} /></b>
                  <span className="text-small text-ink-muted"><FormattedMessage id={`settings.persona.${p}.sample`} /></span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {update.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="settings.saveError" /></p>}
      </div>
    </SubPage>
  );
}
