// 使用者與邀請 ①：產生邀請連結、邀請清單（02 K）。M1a 只發一般邀請，不顯示「也邀請他加入我的廚房」。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { adminApi, inviteUrl, type AdminInvite, type InviteState } from '../../data/admin.ts';
import { btn, btnDanger, btnPrimary, Card, ErrorText, field, LinkResult } from './ui.tsx';

interface Shown {
  url: string;
  expiresAt: string;
  email: string;
}

const STATES: Array<InviteState | 'all'> = ['all', 'pending', 'accepted', 'expired', 'revoked'];

function useInviteMessage() {
  const intl = useIntl();
  return (url: string) => intl.formatMessage({ id: 'admin.invite.message' }, { url });
}

function CreateForm({ onCreated }: { onCreated: (shown: Shown) => void }) {
  const intl = useIntl();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState<'free' | 'plus'>('free');
  const [befriend, setBefriend] = useState(true);
  const create = useMutation({
    mutationFn: () => adminApi.createInvite({ email, note, plan, befriendInviter: befriend }),
    onSuccess: (r) => {
      onCreated({ url: inviteUrl(window.location.origin, r.token), expiresAt: r.expires_at, email });
      setEmail('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!create.isPending) create.mutate();
  }

  return (
    <Card title={<FormattedMessage id="admin.invite.create.title" />}>
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold"><FormattedMessage id="admin.invite.email" /></span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold"><FormattedMessage id="admin.invite.note" /></span>
          <input
            value={note}
            maxLength={100}
            onChange={(e) => setNote(e.target.value)}
            placeholder={intl.formatMessage({ id: 'admin.invite.notePlaceholder' })}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold"><FormattedMessage id="admin.invite.plan" /></span>
          <select value={plan} onChange={(e) => setPlan(e.target.value as 'free' | 'plus')} className={field}>
            <option value="free">{intl.formatMessage({ id: 'admin.plan.free' })}</option>
            <option value="plus">{intl.formatMessage({ id: 'admin.plan.plus' })}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-body">
          <input type="checkbox" checked={befriend} onChange={(e) => setBefriend(e.target.checked)} className="size-5" />
          <FormattedMessage id="admin.invite.befriend" />
        </label>
        <div className="flex flex-col gap-2 md:col-span-2 md:flex-row md:items-center">
          <button type="submit" disabled={create.isPending || !email} className={btnPrimary}>
            <FormattedMessage id="admin.invite.create.submit" />
          </button>
          {create.isError && <ErrorText error={create.error} />}
        </div>
      </form>
    </Card>
  );
}

function InviteRow({ invite, onLink }: { invite: AdminInvite; onLink: (shown: Shown) => void }) {
  const intl = useIntl();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(invite.email);
  const done = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const open = invite.state === 'pending' || invite.state === 'expired';

  const regenerate = useMutation({
    mutationFn: () => adminApi.regenerateInvite(invite.id),
    onSuccess: (r) => {
      onLink({ url: inviteUrl(window.location.origin, r.token), expiresAt: r.expires_at, email: invite.email });
      done();
    },
  });
  const revoke = useMutation({ mutationFn: () => adminApi.revokeInvite(invite.id), onSuccess: done });
  const extend = useMutation({ mutationFn: () => adminApi.extendInvite(invite.id, 7), onSuccess: done });
  const rename = useMutation({
    mutationFn: () => adminApi.updateInviteEmail(invite.id, email),
    onSuccess: () => {
      setEditing(false);
      done();
    },
  });
  const failure = [regenerate, revoke, extend, rename].find((m) => m.isError)?.error;

  return (
    <li className="flex flex-col gap-2 border-t border-line-soft py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {editing ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              rename.mutate();
            }}
          >
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} aria-label={intl.formatMessage({ id: 'admin.invite.email' })} />
            <button type="submit" disabled={rename.isPending} className={btnPrimary}><FormattedMessage id="admin.save" /></button>
            <button type="button" className={btn} onClick={() => { setEditing(false); setEmail(invite.email); }}><FormattedMessage id="admin.cancel" /></button>
          </form>
        ) : (
          <span className="min-w-0 font-bold break-all">{invite.email}</span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-small font-bold ${invite.state === 'pending' ? 'bg-bulb-soft' : invite.state === 'accepted' ? 'bg-green-soft text-green' : 'bg-line-soft text-ink-muted'}`}>
          <FormattedMessage id={`admin.invite.state.${invite.state}`} />
        </span>
        <span className="text-small text-ink-muted"><FormattedMessage id={`admin.plan.${invite.plan}`} /></span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted">
        {invite.note && <span>{invite.note}</span>}
        <span><FormattedMessage id="admin.invite.createdAt" values={{ date: intl.formatDate(invite.created_at, { dateStyle: 'medium' }) }} /></span>
        {invite.state === 'accepted' && invite.accepted_at ? (
          <span><FormattedMessage id="admin.invite.acceptedAt" values={{ date: intl.formatDate(invite.accepted_at, { dateStyle: 'medium' }) }} /></span>
        ) : (
          <span><FormattedMessage id="admin.invite.expiresAt" values={{ date: intl.formatDate(invite.expires_at, { dateStyle: 'medium', timeStyle: 'short' }) }} /></span>
        )}
        {invite.inviter_name && <span><FormattedMessage id="admin.invite.by" values={{ name: invite.inviter_name }} /></span>}
        {invite.befriend_inviter && <span><FormattedMessage id="admin.invite.befriendTag" /></span>}
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
            <FormattedMessage id="admin.invite.regenerate" />
          </button>
          <button type="button" className={btn} disabled={extend.isPending} onClick={() => extend.mutate()}>
            <FormattedMessage id="admin.invite.extend" />
          </button>
          <button type="button" className={btn} onClick={() => setEditing(true)}>
            <FormattedMessage id="admin.invite.editEmail" />
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={revoke.isPending}
            onClick={() => window.confirm(intl.formatMessage({ id: 'admin.invite.revokeConfirm' })) && revoke.mutate()}
          >
            <FormattedMessage id="admin.invite.revoke" />
          </button>
        </div>
      )}
      {failure !== undefined && <ErrorText error={failure} />}
    </li>
  );
}

export function InvitesPage() {
  const intl = useIntl();
  const message = useInviteMessage();
  const [shown, setShown] = useState<Shown | null>(null);
  const [filter, setFilter] = useState<InviteState | 'all'>('all');
  const invites = useQuery({ queryKey: ['admin', 'invites'], queryFn: adminApi.invites });
  const list = (invites.data ?? []).filter((i) => filter === 'all' || i.state === filter);

  return (
    <div className="flex flex-col gap-4">
      <CreateForm onCreated={setShown} />
      {shown && (
        <LinkResult
          url={shown.url}
          message={message(shown.url)}
          expiresAt={shown.expiresAt}
          email={shown.email}
          mailSubject={intl.formatMessage({ id: 'admin.invite.mailSubject' })}
          onClose={() => setShown(null)}
        />
      )}
      <Card title={<FormattedMessage id="admin.invite.list.title" />}>
        <div role="tablist" className="mb-2 flex flex-wrap gap-2">
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={filter === s}
              onClick={() => setFilter(s)}
              className={`h-9 rounded-full border-0 px-3 text-caption font-bold ${filter === s ? 'bg-ink text-surface' : 'bg-line-soft text-ink'}`}
            >
              <FormattedMessage id={`admin.invite.filter.${s}`} />
            </button>
          ))}
        </div>
        {invites.isError ? (
          <ErrorText error={invites.error} />
        ) : list.length === 0 ? (
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id={invites.isPending ? 'common.loading' : 'admin.invite.empty'} /></p>
        ) : (
          <ul className="m-0 list-none p-0">
            {list.map((i) => (
              <InviteRow key={i.id} invite={i} onLink={setShown} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
