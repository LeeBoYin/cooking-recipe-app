// AI 用量：本月（或前 12 個月任選）的費用與預算進度、和 Claude Console 硬上限的距離、依任務與模型的用量、使用者排行，
// 下面接異常清單。只有統計與暱稱，沒有任何使用者輸入的內容（02 L）。
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, blockedRate, usageMonths, type AiUsage, type BudgetState } from '../../data/admin.ts';
import { AiAlertsCard } from './AiAlerts.tsx';
import { Card, ErrorText, field } from './ui.tsx';

const BAR: Record<BudgetState, string> = { ok: 'bg-green', degraded: 'bg-bulb', exhausted: 'bg-error' };

export function useUsd() {
  const intl = useIntl();
  return (n: number) => intl.formatNumber(n, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function BudgetCard({ usage, current }: { usage: AiUsage; current: boolean }) {
  const intl = useIntl();
  const usd = useUsd();
  const pct = Math.min(usage.ratio, 1) * 100;
  const c = usage.console;
  return (
    <Card title={<FormattedMessage id="admin.ai.budget.title" />}>
      <p className="m-0 text-body">
        <FormattedMessage id="admin.ai.budget.summary" values={{ spent: usd(usage.spent_usd), budget: usd(usage.budget_usd), calls: usage.call_count }} />
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={intl.formatMessage({ id: 'admin.ai.budget.title' })}
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-line-soft"
      >
        <div className={`h-full rounded-full ${BAR[usage.state]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`m-0 mt-2 text-caption ${usage.state === 'ok' ? 'text-ink-muted' : 'font-bold text-error'}`}>
        <FormattedMessage id={`admin.ai.budget.state.${usage.state}`} values={{ percent: intl.formatNumber(usage.ratio, { style: 'percent', maximumFractionDigits: 1 }) }} />
      </p>
      {!current && <p className="m-0 mt-1 text-small text-ink-muted"><FormattedMessage id="admin.ai.budget.pastNote" /></p>}
      <hr className="my-3 border-0 border-t border-line-soft" />
      <h3 className="m-0 mb-1 text-caption font-bold"><FormattedMessage id="admin.ai.console.title" /></h3>
      <p className="m-0 text-caption">
        <FormattedMessage id="admin.ai.console.summary" values={{ cap: usd(c.hard_cap_usd), budget: usd(c.budget_usd), margin: usd(Math.abs(c.margin_usd)) }} />
      </p>
      {c.margin_usd < 0 && (
        <p role="alert" className="m-0 mt-1 text-caption font-bold text-error"><FormattedMessage id="admin.ai.console.over" /></p>
      )}
      {c.spent_vs_cap_ratio !== null && (
        <p className="m-0 mt-1 text-small text-ink-muted">
          <FormattedMessage id="admin.ai.console.spentVsCap" values={{ percent: intl.formatNumber(c.spent_vs_cap_ratio, { style: 'percent', maximumFractionDigits: 1 }) }} />
        </p>
      )}
      <p className="m-0 mt-1 text-small text-ink-muted"><FormattedMessage id="admin.ai.console.hint" /></p>
    </Card>
  );
}

const TH = 'py-1 pr-3 text-right font-normal whitespace-nowrap';
const TD = 'py-1 pr-3 text-right whitespace-nowrap tabular-nums';

function TaskTable({ usage }: { usage: AiUsage }) {
  const intl = useIntl();
  const usd = useUsd();
  const n = (v: number) => intl.formatNumber(v);
  return (
    <Card title={<FormattedMessage id="admin.ai.tasks.title" />}>
      {usage.by_task.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="admin.ai.tasks.empty" /></p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-caption">
            <thead>
              <tr className="text-small text-ink-muted">
                <th className="py-1 pr-3 font-normal"><FormattedMessage id="admin.settings.ai.models.task" /></th>
                <th className="py-1 pr-3 font-normal"><FormattedMessage id="admin.settings.ai.models.model" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.calls" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.input" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.output" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.cacheRead" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.cacheWrite" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.cost" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.failures" /></th>
                <th className={TH}><FormattedMessage id="admin.ai.tasks.blocked" /></th>
              </tr>
            </thead>
            <tbody>
              {usage.by_task.map((r) => {
                const rate = blockedRate(r);
                return (
                  <tr key={`${r.task}/${r.model}`} className="border-t border-line-soft">
                    <td className="py-1 pr-3 whitespace-nowrap">{intl.formatMessage({ id: `admin.settings.ai.task.${r.task}`, defaultMessage: r.task })}</td>
                    <td className="py-1 pr-3 break-all">{r.model}</td>
                    <td className={TD}>{n(r.calls)}</td>
                    <td className={TD}>{n(r.input_tokens)}</td>
                    <td className={TD}>{n(r.output_tokens)}</td>
                    <td className={TD}>{n(r.cache_read_tokens)}</td>
                    <td className={TD}>{n(r.cache_write_tokens)}</td>
                    <td className={TD}>{usd(r.cost_usd)}</td>
                    <td className={TD}>{n(r.failures)}</td>
                    <td className={TD}>
                      {rate === null ? '—' : (
                        <span title={intl.formatMessage({ id: 'admin.ai.tasks.blockedDetail' }, { passed: r.passed, rewritten: r.rewritten, blocked: r.blocked })}>
                          {intl.formatNumber(rate, { style: 'percent', maximumFractionDigits: 1 })}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 mt-2 text-small text-ink-muted"><FormattedMessage id="admin.ai.tasks.hint" /></p>
    </Card>
  );
}

function TopUsers({ usage }: { usage: AiUsage }) {
  const usd = useUsd();
  const intl = useIntl();
  return (
    <Card title={<FormattedMessage id="admin.ai.users.title" />}>
      {usage.top_users.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="admin.ai.users.empty" /></p>
      ) : (
        <ol className="m-0 list-none p-0">
          {usage.top_users.map((u, i) => (
            <li key={u.user_id} className="flex items-baseline gap-3 border-t border-line-soft py-2 text-caption first:border-t-0">
              <span className="w-6 text-ink-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 font-bold break-words">{u.display_name ?? '—'}</span>
              <span className="tabular-nums">{usd(u.cost_usd)}</span>
              <span className="w-24 text-right text-ink-muted tabular-nums">
                <FormattedMessage id="admin.ai.users.calls" values={{ count: intl.formatNumber(u.calls) }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function AiUsagePage() {
  const intl = useIntl();
  const months = useMemo(() => usageMonths(new Date()), []);
  const [month, setMonth] = useState(months[0]!);
  const current = month === months[0];
  const usage = useQuery({
    queryKey: ['admin', 'ai-usage', current ? 'current' : month],
    queryFn: () => adminApi.aiUsage(current ? undefined : month),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-round text-card-title font-bold"><FormattedMessage id="admin.ai.title" /></h1>
        <label className="flex items-center gap-2 text-caption">
          <span className="font-bold"><FormattedMessage id="admin.ai.month" /></span>
          <select className={field} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {intl.formatDate(`${m}-01T00:00:00Z`, { year: 'numeric', month: 'long', timeZone: 'UTC' })}
                {m === months[0] ? intl.formatMessage({ id: 'admin.ai.monthCurrent' }) : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {usage.isError ? (
        <ErrorText error={usage.error} />
      ) : usage.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : (
        <>
          <BudgetCard usage={usage.data} current={current} />
          <TaskTable usage={usage.data} />
          <TopUsers usage={usage.data} />
        </>
      )}
      <AiAlertsCard />
    </div>
  );
}
