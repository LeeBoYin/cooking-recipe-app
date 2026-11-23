// 使用者與邀請 ②：使用者清單。只有帳號資料，沒有任何使用者的食譜、食材、照片。
// 方案可以調整（M1a-03）；可以暫停某人的 AI、設定個人的合理使用上限（M1a-13）。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, fairUseIssue, resetUrl, type AdminUser } from '../../data/admin.ts';
import { btn, btnDanger, btnPrimary, Card, ErrorText, field, LinkResult } from './ui.tsx';

interface Shown {
  url: string;
  expiresAt: string;
  name: string;
}

function parseUsd(v: string): number | null {
  const t = v.trim();
  return t === '' ? null : Number(t);
}

// 個人的合理使用上限：留空的那一邊不改；「回到方案預設」清掉整個覆寫
function FairUseEditor({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const intl = useIntl();
  const qc = useQueryClient();
  const o = user.fair_use_override;
  const [daily, setDaily] = useState(o?.daily_usd === undefined ? '' : String(o.daily_usd));
  const [monthly, setMonthly] = useState(o?.monthly_usd === undefined ? '' : String(o.monthly_usd));
  const [issue, setIssue] = useState<string | null>(null);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () => adminApi.setUserFairUse(user.user_id, { dailyUsd: parseUsd(daily), monthlyUsd: parseUsd(monthly) }),
    onSuccess: done,
  });
  const clear = useMutation({ mutationFn: () => adminApi.setUserFairUse(user.user_id, { clear: true }), onSuccess: done });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = parseUsd(daily);
    const m = parseUsd(monthly);
    // 只填一邊時，另一邊沿用已存的值一起比（資料庫不檢查兩邊的關係，這裡先擋）
    const problem = fairUseIssue(d, m) ?? fairUseIssue(d ?? o?.daily_usd ?? null, m ?? o?.monthly_usd ?? null);
    setIssue(problem);
    if (!problem && !save.isPending) save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-card border border-line p-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-small font-bold"><FormattedMessage id="admin.ai.fairUse.daily" /></span>
          <input type="number" min={0} max={100000} step="0.5" value={daily} onChange={(e) => setDaily(e.target.value)} className={`${field} w-32`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-small font-bold"><FormattedMessage id="admin.ai.fairUse.monthly" /></span>
          <input type="number" min={0} max={100000} step="0.5" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={`${field} w-32`} />
        </label>
      </div>
      <p className="m-0 text-small text-ink-muted"><FormattedMessage id="admin.ai.fairUse.hint" /></p>
      {issue && <p role="alert" className="m-0 text-caption text-error">{intl.formatMessage({ id: `admin.ai.fairUse.issue.${issue}` })}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btnPrimary} disabled={save.isPending}><FormattedMessage id="admin.save" /></button>
        {o && (
          <button type="button" className={btn} disabled={clear.isPending} onClick={() => clear.mutate()}>
            <FormattedMessage id="admin.ai.fairUse.clear" />
          </button>
        )}
        <button type="button" className={btn} onClick={onDone}><FormattedMessage id="admin.cancel" /></button>
      </div>
      {[save, clear].find((m) => m.isError) && <ErrorText error={[save, clear].find((m) => m.isError)!.error} />}
    </form>
  );
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
  const limitText = (v: number | undefined) =>
    v === undefined ? intl.formatMessage({ id: 'admin.ai.fairUse.planValue' }) : intl.formatNumber(v, { style: 'currency', currency: 'USD' });
  const aiPause = useMutation({ mutationFn: () => adminApi.setUserAiPaused(user.user_id, !user.ai_paused), onSuccess: refresh });
  const [editingLimit, setEditingLimit] = useState(false);
  const isAdmin = user.role === 'system_admin';
  const failure = [status, reset, plan, aiPause].find((m) => m.isError)?.error;

  return (
    <li className="flex flex-col gap-2 border-t border-line-soft py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold">{user.display_name ?? '—'}</span>
        <span className="min-w-0 text-caption break-all text-ink-muted">{user.email}</span>
        <span className="rounded-full bg-line-soft px-2 py-0.5 text-small font-bold">
          <FormattedMessage id={`admin.user.plan.${user.plan}`} />
        </span>
        {isAdmin && <span className="rounded-full bg-bulb-soft px-2 py-0.5 text-small font-bold"><FormattedMessage id="admin.user.admin" /></span>}
        {user.ai_paused && <span className="rounded-full bg-bulb-soft px-2 py-0.5 text-small font-bold"><FormattedMessage id="admin.ai.alerts.paused" /></span>}
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
        <span>
          {user.fair_use_override ? (
            <FormattedMessage
              id="admin.ai.fairUse.current"
              values={{
                daily: limitText(user.fair_use_override.daily_usd),
                monthly: limitText(user.fair_use_override.monthly_usd),
              }}
            />
          ) : (
            <FormattedMessage id="admin.ai.fairUse.byPlan" />
          )}
        </span>
      </div>
      {!isAdmin && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={plan.isPending} onClick={() => plan.mutate()}>
            <FormattedMessage id={user.plan === 'plus' ? 'admin.user.plan.toFree' : 'admin.user.plan.toPlus'} />
          </button>
          <button type="button" className={btn} disabled={aiPause.isPending} onClick={() => aiPause.mutate()}>
            <FormattedMessage id={user.ai_paused ? 'admin.ai.resume' : 'admin.ai.pause'} />
          </button>
          <button type="button" className={btn} aria-expanded={editingLimit} onClick={() => setEditingLimit((v) => !v)}>
            <FormattedMessage id="admin.ai.fairUse.edit" />
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
      {editingLimit && !isAdmin && <FairUseEditor user={user} onDone={() => setEditingLimit(false)} />}
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
