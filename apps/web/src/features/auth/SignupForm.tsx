import { useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { signInWithGoogle, signUpWithPassword, type Credential, type InviteError } from '../../data/invite.ts';
import { AuthLayout, ErrorLine, inputClass, primaryButton, secondaryButton } from './AuthLayout.tsx';

const ERROR_MESSAGE: Partial<Record<InviteError, string>> = {
  weak_password: 'signup.error.weakPassword',
  already_registered: 'signup.error.alreadyRegistered',
  email_mismatch: 'signup.error.emailMismatch',
  invalid_invite: 'signup.error.invalidInvite',
  invite_used: 'signup.error.invalidInvite',
  invite_expired: 'signup.error.invalidInvite',
  invalid_code: 'signup.error.invalidInvite',
  code_locked: 'invite.error.codeLocked',
  network: 'signIn.error.network',
};

// ③ 建立帳號（12 ③、02 K）：email 已帶入、不能改；設定密碼，或用 Google 登入。
// 成功後登入狀態改變，App 自動換成新手引導。
export function SignupForm({ email, credential, inviterName = null }: { email: string; credential: Credential; inviterName?: string | null }) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<InviteError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await signUpWithPassword(credential, email, password);
    if (result) {
      setError(result);
      setPending(false);
    }
  }

  async function onGoogle() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await signInWithGoogle(email);
    // 成功時瀏覽器會轉到 Google，回來後由 App 接續
    if (result) {
      setError(result);
      setPending(false);
    }
  }

  return (
    <AuthLayout title={intl.formatMessage({ id: 'signup.title' })} mood="happy">
      {inviterName && (
        <p className="m-0 text-center text-body font-bold">
          <FormattedMessage id="signup.invitedBy" values={{ name: inviterName }} />
        </p>
      )}
      <p className="m-0 text-center text-caption text-ink-muted"><FormattedMessage id="signup.lead" /></p>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 rounded-card bg-surface p-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold"><FormattedMessage id="signIn.email" /></span>
          <input type="email" name="email" autoComplete="username" value={email} readOnly className={`${inputClass} text-ink-muted`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold"><FormattedMessage id="signup.password" /></span>
          <input
            type={show ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <span className="text-small text-ink-muted"><FormattedMessage id="signup.passwordHint" /></span>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-caption">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-5" />
          <FormattedMessage id="signup.showPassword" />
        </label>
        {error && <ErrorLine id={ERROR_MESSAGE[error] ?? 'signup.error.unknown'} />}
        <button type="submit" disabled={pending || [...password].length < 8} className={primaryButton}>
          {intl.formatMessage({ id: pending ? 'signup.submitting' : 'signup.submit' })}
        </button>
      </form>
      <p className="m-0 text-center text-small text-ink-muted"><FormattedMessage id="signup.or" /></p>
      <button type="button" disabled={pending} onClick={() => void onGoogle()} className={secondaryButton}>
        <FormattedMessage id="signup.google" />
      </button>
      <p className="m-0 text-center text-small text-ink-muted"><FormattedMessage id="signup.googleHint" /></p>
    </AuthLayout>
  );
}
