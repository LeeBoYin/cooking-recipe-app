import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { regionProfiles } from '@zhusha/ingredients';
import { useCurrentKitchen, useUpdateKitchen } from '../../data/hooks.ts';
import { timezoneLabel, timezoneOptions } from '../onboarding/kitchenDefaults.ts';
import { SubPage } from '../shell/SubPage.tsx';

const ROW = 'flex min-h-[52px] items-center justify-between gap-3 rounded-card bg-surface px-3';

type Values = { name: string; timezone: string; region: string };

// 廚房設定：名稱、時區、地區都屬於廚房（02 廚房）。地區決定常備食材、過敏原清單與口味題庫的版本
export function KitchenSettingsPage() {
  const intl = useIntl();
  const { kitchen, isPending, error } = useCurrentKitchen();
  return (
    <SubPage title={intl.formatMessage({ id: 'kitchen.settings.title' })}>
      {isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : error || !kitchen ? (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="onboarding.kitchen.noKitchen" /></p>
      ) : (
        <Form key={kitchen.id} kitchenId={kitchen.id} initial={{ name: kitchen.name, timezone: kitchen.timezone, region: kitchen.region }} />
      )}
    </SubPage>
  );
}

function Form({ kitchenId, initial }: { kitchenId: string; initial: Values }) {
  const navigate = useNavigate();
  const update = useUpdateKitchen();
  const [values, setValues] = useState<Values>(initial);
  const zones = useMemo(() => timezoneOptions(values.timezone, initial.timezone), [values.timezone, initial.timezone]);
  const name = values.name.trim();
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  const patch = {
    ...(name !== initial.name ? { name } : {}),
    ...(values.timezone !== initial.timezone ? { timezone: values.timezone } : {}),
    ...(values.region !== initial.region ? { region: values.region } : {}),
  };
  const changed = Object.keys(patch).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-bold"><FormattedMessage id="onboarding.kitchen.name" /></span>
        <input
          type="text"
          value={values.name}
          maxLength={40}
          onChange={(e) => set({ name: e.target.value })}
          className="h-12 rounded-card border border-line bg-surface px-3 font-[inherit] text-[16px] text-ink"
        />
      </label>
      <label className={ROW}>
        <span className="text-[15px] text-ink-muted"><FormattedMessage id="onboarding.kitchen.timezone" /></span>
        <select
          value={values.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
          className="min-h-11 max-w-[220px] border-0 bg-transparent text-right font-[inherit] text-[16px] text-ink"
        >
          {zones.map((z) => <option key={z} value={z}>{timezoneLabel(z)}</option>)}
        </select>
      </label>
      <label className={ROW}>
        <span className="text-[15px] text-ink-muted"><FormattedMessage id="onboarding.kitchen.region" /></span>
        <select
          value={values.region}
          onChange={(e) => set({ region: e.target.value })}
          className="min-h-11 border-0 bg-transparent text-right font-[inherit] text-[16px] text-ink"
        >
          {!regionProfiles.some((r) => r.code === values.region) && <option value={values.region}>{values.region}</option>}
          {regionProfiles.map((r) => <option key={r.code} value={r.code}>{r.name['zh-TW']}</option>)}
        </select>
      </label>
      <p className="m-0 text-[13px] leading-relaxed text-ink-muted"><FormattedMessage id="kitchen.settings.regionHint" /></p>
      {update.isError && <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="onboarding.kitchen.error" /></p>}
      <button
        type="button"
        disabled={name === '' || !changed || update.isPending}
        onClick={() => update.mutate({ kitchenId, patch }, { onSuccess: () => void navigate(-1) })}
        className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
      >
        <FormattedMessage id="kitchen.settings.save" />
      </button>
    </div>
  );
}
