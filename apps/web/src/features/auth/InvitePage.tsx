import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from 'react-router';
import { openInvite, type InviteError, type OpenedInvite } from '../../data/invite.ts';
import { InstallGuide } from '../../pwa/InstallGuide.tsx';
import { installMode } from '../../pwa/install.ts';
import { AuthLayout, Notice, primaryButton } from './AuthLayout.tsx';
import { SignupForm } from './SignupForm.tsx';

const NOTICE: Partial<Record<InviteError, string>> = {
  invite_used: 'invite.used',
  invite_expired: 'invite.expired',
  network: 'invite.network',
};

// 空格分成 3 碼＋3 碼，容易讀、容易輸入（K7Q 2MX）
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

// 打開邀請連結（02 K、12 ②③）。iPhone 的 Safari：先教安裝並顯示邀請碼，再建立帳號。
export function InvitePage() {
  const intl = useIntl();
  const { token = '' } = useParams();
  const [state, setState] = useState<{ invite: OpenedInvite } | { error: InviteError } | null>(null);
  // iPhone 的 Safari（還沒從主畫面打開）才需要接續用的邀請碼
  const [showInstall, setShowInstall] = useState(() => installMode() === 'ios');

  useEffect(() => {
    let live = true;
    void openInvite(token).then((r) => live && setState(r.ok ? { invite: r.value } : { error: r.error }));
    return () => {
      live = false;
    };
  }, [token]);

  if (!state) return <AuthLayout title={intl.formatMessage({ id: 'common.loading' })}>{null}</AuthLayout>;
  if ('error' in state) {
    const id = NOTICE[state.error] ?? 'invite.invalid';
    return <Notice title={intl.formatMessage({ id: `${id}.title` })} body={intl.formatMessage({ id: `${id}.body` })} />;
  }

  const { invite } = state;
  if (showInstall) {
    return (
      <AuthLayout title={intl.formatMessage({ id: 'invite.install.title' })} mood="idea">
        <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="invite.install.body" /></p>
        <InstallGuide />
        <section className="flex flex-col items-center gap-1 rounded-card bg-surface p-4 text-center" aria-labelledby="invite-code-label">
          <span id="invite-code-label" className="text-caption font-bold"><FormattedMessage id="invite.code.label" /></span>
          <span className="font-round text-[32px] leading-tight font-bold tracking-[0.12em]" aria-label={invite.code.split('').join(' ')}>
            {formatCode(invite.code)}
          </span>
          <span className="text-small text-ink-muted"><FormattedMessage id="invite.code.usage" /></span>
        </section>
        <div className="mt-auto flex flex-col gap-1 pt-2">
          <button type="button" onClick={() => setShowInstall(false)} className={primaryButton}>
            <FormattedMessage id="invite.install.continue" />
          </button>
          <p className="m-0 text-center text-small text-ink-muted"><FormattedMessage id="invite.install.laterNote" /></p>
        </div>
      </AuthLayout>
    );
  }
  return <SignupForm email={invite.email} credential={{ token }} inviterName={invite.inviterName ?? null} />;
}

