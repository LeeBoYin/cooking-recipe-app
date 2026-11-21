// 操作紀錄：誰、什麼時間、做了什麼。只能看，不能修改或刪除（資料庫只能新增）。
import { useInfiniteQuery } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, type AuditLog } from '../../data/admin.ts';
import { btn, Card, ErrorText } from './ui.tsx';

function shortId(id: string | null): string {
  return id ? id.slice(-6) : '';
}

// 設定的修改要看得到前後的值；其他操作的細節只有代號與數字
function Detail({ log }: { log: AuditLog }) {
  const d = log.detail;
  if (log.action === 'config.update') {
    const before = (d.before ?? {}) as Record<string, number | boolean>;
    const after = (d.after ?? {}) as Record<string, number | boolean>;
    const keys = Object.keys(after).filter((k) => before[k] !== after[k]);
    return (
      <>
        {keys.map((k) => (
          <span key={k}>
            <FormattedMessage id={`admin.logs.config.${k}`} defaultMessage={k} />：{String(before[k])} → {String(after[k])}
          </span>
        ))}
      </>
    );
  }
  if (log.action === 'user.plan') {
    return (
      <>
        <FormattedMessage id={`admin.user.plan.${String(d.before)}`} defaultMessage={String(d.before)} /> →{' '}
        <FormattedMessage id={`admin.user.plan.${String(d.after)}`} defaultMessage={String(d.after)} />
      </>
    );
  }
  if (log.action === 'invite.send') {
    return <FormattedMessage id="admin.logs.inviteSend" values={{ plan: String(d.plan), befriend: d.befriend_inviter === true ? 'yes' : 'no' }} />;
  }
  if (log.action === 'invite.extend') return <FormattedMessage id="admin.logs.extend" values={{ days: Number(d.days) }} />;
  return null;
}

export function LogsPage() {
  const intl = useIntl();
  const logs = useInfiniteQuery({
    queryKey: ['admin', 'logs'],
    queryFn: ({ pageParam }) => adminApi.auditLogs(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length >= 50 ? last[last.length - 1]!.created_at : undefined),
  });
  const rows = logs.data?.pages.flat() ?? [];

  return (
    <Card title={<FormattedMessage id="admin.logs.title" />}>
      <p className="m-0 mb-2 text-small text-ink-muted"><FormattedMessage id="admin.logs.hint" /></p>
      {logs.isError ? (
        <ErrorText error={logs.error} />
      ) : rows.length === 0 ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id={logs.isPending ? 'common.loading' : 'admin.logs.empty'} /></p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 border-t border-line-soft py-2.5 first:border-t-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-bold"><FormattedMessage id={`admin.action.${l.action}`} defaultMessage={l.action} /></span>
                {l.target_id && <span className="font-mono text-small text-ink-muted">{l.target_type}:{shortId(l.target_id)}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 text-small text-ink-muted">
                <span>{intl.formatDate(l.created_at, { dateStyle: 'medium', timeStyle: 'medium' })}</span>
                <span>{l.admin_name ?? '—'}</span>
                <Detail log={l} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {logs.hasNextPage && (
        <button type="button" className={`${btn} mt-3`} disabled={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
          <FormattedMessage id="admin.logs.more" />
        </button>
      )}
    </Card>
  );
}
