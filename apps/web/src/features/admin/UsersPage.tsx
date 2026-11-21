// 使用者與邀請 ②：使用者清單。只有帳號資料，沒有任何使用者的食譜、食材、照片。
// 方案可以調整（M1a-03）；個人的合理使用上限、暫停 AI 等 M1a-04 再加。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, resetUrl, type AdminUser } from '../../data/admin.ts';
import { btn, btnDanger, Card, ErrorText, LinkResult } from './ui.tsx';

interface Shown {
  url: string;
  expiresAt: string;
  name: string;
}

function UserRow({ user, onLink }: { user: AdminUser; onLink: (shown: Shown) => void }) {
  const intl = useIntl();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const suspended = user.status === 'suspended';
  const status = useMutation({ mutationFn: () => adminApi.setUserStatus(user.user_id, suspended ? 'active' : 'suspended'), onSuccess: refresh });
  const plan = useMutation({
    mutationFn: () => adminApi.setUserPlan(user.user_id, user.plan === 'plus' ? 'free' : 'plus'),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: () => adminApi.createResetLink(user.user_id),
    onSuccess: (r) => onLink({ url: resetUrl(window.location.origin, r.token), expiresAt: r.expires_at, name: user.display_name ?? '' }),
  });
  const isAdmin = user.role === 'system_admin';
  const failure = [status, reset, plan].find((m) => m.isError)?.error;

  return (
    <li className="flex flex-col gap-2 border-t border-line-soft py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold">{user.display_name ?? '—'}</span>
        <span className="min-w-0 text-caption break-all text-ink-muted">{user.email}</span>
        <span className="rounded-full bg-line-soft px-2 py-0.5 text-small font-bold">
          <FormattedMessage id={`admin.user.plan.${user.plan}`} />
        </span>
        {isAdmin && <span className="rounded-full bg-bulb-soft px-2 py-0.5 text-small font-bold"><FormattedMessage id="admin.user.admin" /></span>}
        <span className={`rounded-full px-2 py-0.5 text-small font-bold ${suspended ? 'bg-line-soft text-error' : 'bg-green-soft text-green'}`}>
          <FormattedMessage id={`admin.user.status.${user.status}`} />
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted">
        <span><FormattedMessage id="admin.user.createdAt" values={{ date: intl.formatDate(user.created_at, { dateStyle: 'medium' }) }} /></span>
        <span>
          {user.last_active_at ? (
            <FormattedMessage id="admin.user.lastActive" values={{ date: intl.formatDate(user.last_active_at, { dateStyle: 'medium', timeStyle: 'short' }) }} />
          ) : (
            <FormattedMessage id="admin.user.neverActive" />
          )}
        </span>
        {user.accepted_via && <span><FormattedMessage id={`admin.user.via.${user.accepted_via}`} /></span>}
      </div>
      {!isAdmin && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={plan.isPending} onClick={() => plan.mutate()}>
            <FormattedMessage id={user.plan === 'plus' ? 'admin.user.plan.toFree' : 'admin.user.plan.toPlus'} />
          </button>
          {!suspended && (
            <button type="button" className={btn} disabled={reset.isPending} onClick={() => reset.mutate()}>
              <FormattedMessage id="admin.user.resetLink" />
            </button>
          )}
          {suspended ? (
            <button type="button" className={btn} disabled={status.isPending} onClick={() => status.mutate()}>
              <FormattedMessage id="admin.user.restore" />
            </button>
          ) : (
            <button
              type="button"
              className={btnDanger}
              disabled={status.isPending}
              onClick={() => window.confirm(intl.formatMessage({ id: 'admin.user.suspendConfirm' })) && status.mutate()}
            >
              <FormattedMessage id="admin.user.suspend" />
            </button>
          )}
        </div>
      )}
      {failure !== undefined && <ErrorText error={failure} />}
    </li>
  );
}

export function UsersPage() {
  const intl = useIntl();
  const [shown, setShown] = useState<Shown | null>(null);
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.users });

  return (
    <div className="flex flex-col gap-4">
      {shown && (
        <LinkResult
          url={shown.url}
          message={intl.formatMessage({ id: 'admin.user.resetMessage' }, { url: shown.url })}
          expiresAt={shown.expiresAt}
          onClose={() => setShown(null)}
        />
      )}
      <Card title={<FormattedMessage id="admin.user.list.title" />}>
        {users.isError ? (
          <ErrorText error={users.error} />
        ) : users.isPending ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
        ) : (
          <ul className="m-0 list-none p-0">
            {users.data.map((u) => (
              <UserRow key={u.user_id} user={u} onLink={setShown} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
