import { useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from 'react-router';
import { resetPassword, type InviteError } from '../../data/invite.ts';
import { AuthLayout, ErrorLine, inputClass, primaryButton } from './AuthLayout.tsx';

const ERROR_MESSAGE: Partial<Record<InviteError, string>> = {
  weak_password: 'signup.error.weakPassword',
  invalid_link: 'reset.error.invalidLink',
  network: 'signIn.error.network',
};

// 重設密碼（02 K）：管理員產生的連結，24 小時、只能用一次。改完回到登入頁，不自動登入。
export function ResetPage() {
  const intl = useIntl();
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<InviteError | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await resetPassword(token, password);
    setPending(false);
    if (result) setError(result);
    else setDone(true);
  }

  if (done) {
    return (
      <AuthLayout title={intl.formatMessage({ id: 'reset.done.title' })} mood="happy">
        <p className="m-0 text-center text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="reset.done.body" /></p>
        <a href="/" className={`${primaryButton} mt-2 grid place-items-center no-underline`}><FormattedMessage id="reset.done.button" /></a>
      </AuthLayout>
    );
  }

  const dead = error === 'invalid_link';
  return (
    <AuthLayout title={intl.formatMessage({ id: dead ? 'reset.dead.title' : 'reset.title' })} mood={dead ? 'quiet' : 'normal'}>
      {dead ? (
        <>
          <p className="m-0 text-center text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="reset.dead.body" /></p>
          <a href="/" className="mt-2 grid h-12 place-items-center rounded-card border-2 border-ink text-body font-bold text-ink no-underline">
            <FormattedMessage id="auth.backToSignIn" />
          </a>
        </>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 rounded-card bg-surface p-4" noValidate>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="reset.password" /></span>
            <input
              type={show ? 'text' : 'password'}
              name="password"
              autoComplete="new-password"
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
          {error && <ErrorLine id={ERROR_MESSAGE[error] ?? 'reset.error.unknown'} />}
          <button type="submit" disabled={pending || [...password].length < 8} className={primaryButton}>
            {intl.formatMessage({ id: pending ? 'reset.submitting' : 'reset.submit' })}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
