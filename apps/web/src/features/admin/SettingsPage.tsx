// 系統設定：人數上限、刪除後可以復原的天數、AI 總開關與每月預算；各任務的模型唯讀顯示。用量保護的數值 M1a-04 才加。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi } from '../../data/admin.ts';
import { btnPrimary, Card, ErrorText, field } from './ui.tsx';

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
