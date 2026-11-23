// 異常使用清單（03〈用量保護〉）：被速率限制或合理使用上限擋下、異常偵測標記的帳號，和全站預算的 80%／100% 提醒。
// 只顯示暱稱、種類與時間，不顯示任何使用者輸入的內容。
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, type AiAlert, type AiAlertResolution, type AiAlertStatus } from '../../data/admin.ts';
import { btn, Card, ErrorText, field } from './ui.tsx';

const PAGE = 50;
const RESOLUTIONS: AiAlertResolution[] = ['ok', 'override_raised', 'ai_paused'];

function AlertRow({ alert }: { alert: AiAlert }) {
  const intl = useIntl();
  const qc = useQueryClient();
  const [resolution, setResolution] = useState<AiAlertResolution>('ok');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const resolve = useMutation({ mutationFn: () => adminApi.resolveAiAlert(alert.id, resolution), onSuccess: refresh });
  const pause = useMutation({
    mutationFn: () => adminApi.setUserAiPaused(alert.user_id!, !alert.ai_paused),
    onSuccess: refresh,
  });
  const open = alert.resolved_at === null;
  const failure = [resolve, pause].find((m) => m.isError)?.error;

  return (
    <li className="flex flex-col gap-1.5 border-t border-line-soft py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold">
          {alert.user_id ? (alert.display_name ?? '—') : <FormattedMessage id="admin.ai.alerts.global" />}
        </span>
        <span className="rounded-full bg-line-soft px-2 py-0.5 text-small font-bold">
          <FormattedMessage id={`admin.ai.alerts.kind.${alert.kind}`} defaultMessage={alert.kind} />
        </span>
        {alert.ai_paused && (
          <span className="rounded-full bg-bulb-soft px-2 py-0.5 text-small font-bold"><FormattedMessage id="admin.ai.alerts.paused" /></span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 text-small text-ink-muted">
        <span>{intl.formatDate(alert.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        {!open && alert.resolution && (
          <span>
            <FormattedMessage
              id="admin.ai.alerts.resolvedBy"
              values={{
                resolution: intl.formatMessage({ id: `admin.ai.alerts.resolution.${alert.resolution}` }),
                name: alert.resolved_by_name ?? '—',
                date: intl.formatDate(alert.resolved_at!, { dateStyle: 'medium', timeStyle: 'short' }),
              }}
            />
          </span>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-caption">
            <span className="sr-only"><FormattedMessage id="admin.ai.alerts.resolutionLabel" /></span>
            <select
              className={`${field} h-10`}
              value={resolution}
              onChange={(e) => setResolution(e.target.value as AiAlertResolution)}
              aria-label={intl.formatMessage({ id: 'admin.ai.alerts.resolutionLabel' })}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>{intl.formatMessage({ id: `admin.ai.alerts.resolution.${r}` })}</option>
              ))}
            </select>
          </label>
          <button type="button" className={btn} disabled={resolve.isPending} onClick={() => resolve.mutate()}>
            <FormattedMessage id="admin.ai.alerts.resolve" />
          </button>
          {alert.user_id && (
            <button type="button" className={btn} disabled={pause.isPending} onClick={() => pause.mutate()}>
              <FormattedMessage id={alert.ai_paused ? 'admin.ai.resume' : 'admin.ai.pause'} />
            </button>
          )}
        </div>
      )}
      {failure !== undefined && <ErrorText error={failure} />}
    </li>
  );
}

export function AiAlertsCard() {
  const [status, setStatus] = useState<AiAlertStatus>('open');
  const alerts = useInfiniteQuery({
    queryKey: ['admin', 'ai-alerts', status],
    queryFn: ({ pageParam }) => adminApi.aiAlerts(status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length >= PAGE ? last[last.length - 1]!.created_at : undefined),
  });
  const rows = alerts.data?.pages.flat() ?? [];

  return (
    <Card title={<FormattedMessage id="admin.ai.alerts.title" />}>
      <p className="m-0 mb-3 text-small text-ink-muted"><FormattedMessage id="admin.ai.alerts.hint" /></p>
      <div role="group" aria-label="status" className="mb-2 flex gap-2">
        {(['open', 'resolved'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`h-10 rounded-card border-2 px-3 text-caption font-bold ${status === s ? 'border-ink bg-bulb-soft text-ink' : 'border-line text-ink-muted'}`}
          >
            <FormattedMessage id={`admin.ai.alerts.status.${s}`} />
          </button>
        ))}
      </div>
      {alerts.isError ? (
        <ErrorText error={alerts.error} />
      ) : rows.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted">
          <FormattedMessage id={alerts.isPending ? 'common.loading' : `admin.ai.alerts.empty.${status}`} />
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </ul>
      )}
      {alerts.hasNextPage && (
        <button type="button" className={`${btn} mt-3`} disabled={alerts.isFetchingNextPage} onClick={() => void alerts.fetchNextPage()}>
          <FormattedMessage id="admin.logs.more" />
        </button>
      )}
    </Card>
  );
}
