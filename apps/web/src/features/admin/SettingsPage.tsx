// 系統設定：人數上限、刪除後可以復原的天數、AI 總開關與每月預算、用量保護的數值（速率、合理使用上限、異常偵測門檻、Console 硬上限）；各任務的模型唯讀顯示。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, protectionIssue, type AiProtection } from '../../data/admin.ts';
import { btnPrimary, Card, ErrorText, field } from './ui.tsx';

const protNum = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

type ProtectionDraft = Record<string, string>;

function toDraft(p: AiProtection): ProtectionDraft {
  return {
    perMinute: String(p.perMinute),
    perHour: String(p.perHour),
    freeDaily: String(p.fairUse.free.dailyUsd),
    freeMonthly: String(p.fairUse.free.monthlyUsd),
    plusDaily: String(p.fairUse.plus.dailyUsd),
    plusMonthly: String(p.fairUse.plus.monthlyUsd),
    rateBlockAlerts: String(p.anomaly.rateBlockAlerts),
    repeatedInputCount: String(p.anomaly.repeatedInputCount),
    oversizedStreak: String(p.anomaly.oversizedStreak),
    oversizedRatio: String(p.anomaly.oversizedRatio),
    burstCalls: String(p.anomaly.burstCalls),
    burstDevices: String(p.anomaly.burstDevices),
    burstWindowMinutes: String(p.anomaly.burstWindowMinutes),
    consoleHardCapUsd: String(p.consoleHardCapUsd),
  };
}

function fromDraft(d: ProtectionDraft): AiProtection {
  return {
    schemaVersion: 1,
    perMinute: protNum(d.perMinute!),
    perHour: protNum(d.perHour!),
    fairUse: {
      free: { dailyUsd: protNum(d.freeDaily!), monthlyUsd: protNum(d.freeMonthly!) },
      plus: { dailyUsd: protNum(d.plusDaily!), monthlyUsd: protNum(d.plusMonthly!) },
    },
    anomaly: {
      rateBlockAlerts: protNum(d.rateBlockAlerts!),
      repeatedInputCount: protNum(d.repeatedInputCount!),
      oversizedStreak: protNum(d.oversizedStreak!),
      oversizedRatio: protNum(d.oversizedRatio!),
      burstCalls: protNum(d.burstCalls!),
      burstDevices: protNum(d.burstDevices!),
      burstWindowMinutes: protNum(d.burstWindowMinutes!),
    },
    consoleHardCapUsd: protNum(d.consoleHardCapUsd!),
  };
}

const PROTECTION_FIELDS: ReadonlyArray<{ group: string; key: string; min: number; max: number; step: string }> = [
  { group: 'rate', key: 'perMinute', min: 1, max: 600, step: '1' },
  { group: 'rate', key: 'perHour', min: 1, max: 6000, step: '1' },
  { group: 'fairUse', key: 'freeDaily', min: 0, max: 100000, step: '0.5' },
  { group: 'fairUse', key: 'freeMonthly', min: 0, max: 100000, step: '0.5' },
  { group: 'fairUse', key: 'plusDaily', min: 0, max: 100000, step: '0.5' },
  { group: 'fairUse', key: 'plusMonthly', min: 0, max: 100000, step: '0.5' },
  { group: 'anomaly', key: 'rateBlockAlerts', min: 1, max: 10000, step: '1' },
  { group: 'anomaly', key: 'repeatedInputCount', min: 2, max: 10000, step: '1' },
  { group: 'anomaly', key: 'oversizedStreak', min: 2, max: 1000, step: '1' },
  { group: 'anomaly', key: 'oversizedRatio', min: 0.5, max: 1, step: '0.01' },
  { group: 'anomaly', key: 'burstCalls', min: 2, max: 10000, step: '1' },
  { group: 'anomaly', key: 'burstDevices', min: 2, max: 100, step: '1' },
  { group: 'anomaly', key: 'burstWindowMinutes', min: 1, max: 1440, step: '1' },
  { group: 'console', key: 'consoleHardCapUsd', min: 0, max: 100000, step: '1' },
];

// 用量保護的數值（03〈用量保護〉）：前端先檢查和資料庫一樣的規則，資料庫是最後一道
function ProtectionCard() {
  const qc = useQueryClient();
  const intl = useIntl();
  const info = useQuery({ queryKey: ['admin', 'ai-protection'], queryFn: adminApi.aiProtection });
  const [draft, setDraft] = useState<ProtectionDraft | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (info.data) setDraft(toDraft(info.data.protection));
  }, [info.data]);

  const save = useMutation({
    mutationFn: (p: AiProtection) => adminApi.updateAiProtection(p),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (!draft) return;
    const next = fromDraft(draft);
    const problem = protectionIssue(next);
    setIssue(problem);
    if (!problem && !save.isPending) save.mutate(next);
  }

  if (info.isError) return <Card><ErrorText error={info.error} /></Card>;
  const groups = ['rate', 'fairUse', 'anomaly', 'console'];
  return (
    <Card title={<FormattedMessage id="admin.ai.protection.title" />}>
      <p className="m-0 mb-3 text-small text-ink-muted"><FormattedMessage id="admin.ai.protection.hint" /></p>
      {draft && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {groups.map((g) => (
            <fieldset key={g} className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 p-0 text-caption font-bold"><FormattedMessage id={`admin.ai.protection.group.${g}`} /></legend>
              <p className="m-0 text-small text-ink-muted"><FormattedMessage id={`admin.ai.protection.group.${g}Hint`} /></p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PROTECTION_FIELDS.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-small font-bold"><FormattedMessage id={`admin.ai.protection.field.${f.key}`} /></span>
                    <input
                      type="number"
                      required
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={draft[f.key]}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      className={`${field} w-full`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {info.data && (
            <p className={`m-0 text-caption ${info.data.console.budget_within_cap ? 'text-ink-muted' : 'font-bold text-error'}`}>
              <FormattedMessage
                id={info.data.console.budget_within_cap ? 'admin.ai.protection.margin' : 'admin.ai.protection.marginOver'}
                values={{
                  budget: intl.formatNumber(info.data.console.budget_usd, { style: 'currency', currency: 'USD' }),
                  cap: intl.formatNumber(info.data.console.hard_cap_usd, { style: 'currency', currency: 'USD' }),
                }}
              />
            </p>
          )}
          {issue && <p role="alert" className="m-0 text-caption text-error">{intl.formatMessage({ id: `admin.ai.protection.issue.${issue}` })}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={save.isPending} className={btnPrimary}><FormattedMessage id="admin.save" /></button>
            {saved && <span role="status" className="text-caption text-green"><FormattedMessage id="admin.settings.saved" /></span>}
            {save.isError && <ErrorText error={save.error} />}
          </div>
        </form>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['admin', 'config'], queryFn: adminApi.config });
  const [maxUsers, setMaxUsers] = useState('');
  const [days, setDays] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [budget, setBudget] = useState('');
  const [saved, setSaved] = useState(false);
  const intl = useIntl();
  const models = useQuery({ queryKey: ['admin', 'ai-models'], queryFn: adminApi.aiModels });

  useEffect(() => {
    if (config.data) {
      setMaxUsers(String(config.data.max_users));
      setDays(String(config.data.soft_delete_retention_days));
      setAiEnabled(config.data.ai_enabled);
      setBudget(String(config.data.ai_monthly_budget_usd));
    }
  }, [config.data]);

  const save = useMutation({
    mutationFn: () => adminApi.updateConfig({ maxUsers: Number(maxUsers), softDeleteRetentionDays: Number(days), aiEnabled, aiMonthlyBudgetUsd: Number(budget) }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (!save.isPending) save.mutate();
  }

  if (config.isError) return <ErrorText error={config.error} />;
  const c = config.data;
  const full = c ? c.registered_count + c.pending_invite_count >= c.max_users : false;

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      <Card title={<FormattedMessage id="admin.settings.capacity.title" />}>
        {c && (
          <p className={`m-0 text-body ${full ? 'font-bold text-error' : ''}`}>
            <FormattedMessage
              id="admin.settings.capacity.summary"
              values={{ registered: c.registered_count, pending: c.pending_invite_count, max: c.max_users }}
            />
          </p>
        )}
        <p className="m-0 mt-1 text-small text-ink-muted"><FormattedMessage id="admin.settings.capacity.hint" /></p>
      </Card>
      <Card title={<FormattedMessage id="admin.settings.title" />}>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="admin.settings.maxUsers" /></span>
            <input type="number" min={1} max={1000} required value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className={`${field} w-32`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="admin.settings.retention" /></span>
            <input type="number" min={1} max={365} required value={days} onChange={(e) => setDays(e.target.value)} className={`${field} w-32`} />
            <span className="text-small text-ink-muted"><FormattedMessage id="admin.settings.retentionHint" /></span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
            <span className="text-caption font-bold"><FormattedMessage id="admin.settings.ai.enabled" /></span>
          </label>
          <span className="-mt-2 text-small text-ink-muted"><FormattedMessage id="admin.settings.ai.enabledHint" /></span>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="admin.settings.ai.budget" /></span>
            <input type="number" min={0} max={10000} step="0.5" required value={budget} onChange={(e) => setBudget(e.target.value)} className={`${field} w-32`} />
            <span className="text-small text-ink-muted"><FormattedMessage id="admin.settings.ai.budgetHint" /></span>
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={save.isPending || !c} className={btnPrimary}><FormattedMessage id="admin.save" /></button>
            {saved && <span role="status" className="text-caption text-green"><FormattedMessage id="admin.settings.saved" /></span>}
            {save.isError && <ErrorText error={save.error} />}
          </div>
        </form>
      </Card>
      <ProtectionCard />
      <Card title={<FormattedMessage id="admin.settings.ai.models.title" />}>
        <p className="m-0 mb-2 text-small text-ink-muted"><FormattedMessage id="admin.settings.ai.models.hint" /></p>
        {models.isError ? (
          <ErrorText error={models.error} />
        ) : (
          <table className="w-full border-collapse text-left text-caption">
            <thead>
              <tr className="text-small text-ink-muted">
                <th className="py-1 pr-2 font-normal"><FormattedMessage id="admin.settings.ai.models.task" /></th>
                <th className="py-1 pr-2 font-normal"><FormattedMessage id="admin.settings.ai.models.model" /></th>
                <th className="py-1 pr-2 font-normal"><FormattedMessage id="admin.settings.ai.models.effort" /></th>
                <th className="py-1 font-normal"><FormattedMessage id="admin.settings.ai.models.maxTokens" /></th>
              </tr>
            </thead>
            <tbody>
              {(models.data ?? []).map((m) => (
                <tr key={m.task} className="border-t border-line-soft">
                  <td className="py-1 pr-2">{intl.formatMessage({ id: `admin.settings.ai.task.${m.task}`, defaultMessage: m.task })}</td>
                  <td className="py-1 pr-2 break-all">{m.model}</td>
                  <td className="py-1 pr-2">
                    {m.effort}
                    {m.thinking === 'off' && <> · <FormattedMessage id="admin.settings.ai.models.thinkingOff" /></>}
                  </td>
                  <td className="py-1">{m.max_output_tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
