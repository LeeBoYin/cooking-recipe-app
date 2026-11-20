import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { regionProfiles } from '@zhusha/ingredients';
import { Chef } from '../../chef/Chef.tsx';
import { useCurrentKitchen, useUpdateKitchen } from '../../data/hooks.ts';
import { deviceRegion, deviceTimezone, timezoneLabel, timezoneOptions } from './kitchenDefaults.ts';

const ROW = 'flex min-h-[52px] items-center justify-between gap-3 rounded-card bg-surface px-3';

// ⑥-2 建立我的廚房（12 ⑥）：帳號建立時已經有預設廚房，這一頁確認名稱、時區、地區。
// 時區與地區取手機的設定帶入，可以改；M0 沒有家人可以加入，所以沒有「家人已經在用」那幾頁。
export function KitchenStep({ onDone, redo }: { onDone: () => void; redo: boolean }) {
  const intl = useIntl();
  const { kitchen, isPending, error } = useCurrentKitchen();
  if (isPending) return null;
  if (error || !kitchen) {
    return <p role="alert" className="m-0 px-5 pt-16 text-center text-caption text-error"><FormattedMessage id="onboarding.kitchen.noKitchen" /></p>;
  }
  return (
    <KitchenForm
      key={kitchen.id}
      kitchenId={kitchen.id}
      initial={{ name: kitchen.name, timezone: kitchen.timezone, region: kitchen.region }}
      onDone={onDone}
      redo={redo}
      intl={intl}
    />
  );
}

type Values = { name: string; timezone: string; region: string };

function KitchenForm({ kitchenId, initial, onDone, redo, intl }: { kitchenId: string; initial: Values; onDone: () => void; redo: boolean; intl: ReturnType<typeof useIntl> }) {
  const update = useUpdateKitchen();
  // 預設值：名稱沿用現有的；時區與地區取手機的，手機沒給或我們不支援就留廚房現在的。重跑時不覆蓋使用者改過的
  const [values, setValues] = useState<Values>(() => ({
    name: initial.name,
    timezone: (!redo && deviceTimezone()) || initial.timezone,
    region: (!redo && deviceRegion()) || initial.region,
  }));
  const zones = useMemo(() => timezoneOptions(values.timezone, initial.timezone), [values.timezone, initial.timezone]);
  const name = values.name.trim();
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  function submit() {
    const patch = {
      ...(name !== initial.name ? { name } : {}),
      ...(values.timezone !== initial.timezone ? { timezone: values.timezone } : {}),
      ...(values.region !== initial.region ? { region: values.region } : {}),
    };
    if (Object.keys(patch).length === 0) return onDone();
    update.mutate({ kitchenId, patch }, { onSuccess: onDone });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex justify-center pt-2"><Chef size={96} /></div>
      <h1 className="m-0 font-round text-heading leading-[1.4]"><FormattedMessage id="onboarding.kitchen.title" /></h1>
      <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="onboarding.kitchen.body" /></p>
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
          {/* 廚房現在的地區不在字典裡時，也要看得到，不然選單會顯示成別的地區 */}
          {!regionProfiles.some((r) => r.code === values.region) && <option value={values.region}>{values.region}</option>}
          {regionProfiles.map((r) => <option key={r.code} value={r.code}>{r.name['zh-TW']}</option>)}
        </select>
      </label>
      <p className="m-0 text-[13px] text-ink-muted"><FormattedMessage id="onboarding.kitchen.hint" /></p>
      {update.isError && <p role="alert" className="m-0 text-caption text-error">{intl.formatMessage({ id: 'onboarding.kitchen.error' })}</p>}
      <div className="mt-auto flex flex-col gap-1">
        <button
          type="button"
          disabled={name === '' || update.isPending}
          onClick={submit}
          className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50"
        >
          <FormattedMessage id="common.ok" />
        </button>
      </div>
    </div>
  );
}
