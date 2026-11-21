import { useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';
import { signIn, type SignInError } from '../../data/auth.ts';
import { takeGoogleReturnError } from '../../data/invite.ts';
import { CodePage } from './CodePage.tsx';
import { ErrorLine, linkButton } from './AuthLayout.tsx';

// Google 登入被擋下後會帶著錯誤回到網址；只在 App 開啟時讀一次
const googleReturnError = takeGoogleReturnError();

const ERROR_MESSAGE: Record<SignInError, string> = {
  invalid_credentials: 'signIn.error.invalidCredentials',
  network: 'signIn.error.network',
  unknown: 'signIn.error.unknown',
};

export function SignInPage() {
  const intl = useIntl();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<SignInError | null>(null);
  const [pending, setPending] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showCode, setShowCode] = useState(false);
  if (showCode) return <CodePage onBack={() => setShowCode(false)} />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await signIn(email, password);
    // 成功時登入狀態會改變，畫面自動換成首頁
    if (result) {
      setError(result);
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center px-4 pt-[calc(48px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <Chef size={96} />
      <h1 className="mt-3 mb-0 font-round text-display leading-tight font-bold">
        <FormattedMessage id="app.name" />
      </h1>
      <p className="mt-2 mb-0 text-center text-caption text-ink-muted">
        <FormattedMessage id="signIn.tagline" />
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 flex w-full flex-col gap-3 rounded-card bg-surface p-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold">
            <FormattedMessage id="signIn.email" />
          </span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-card border-0 bg-bg px-3 text-body text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold">
            <FormattedMessage id="signIn.password" />
          </span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-card border-0 bg-bg px-3 text-body text-ink"
          />
        </label>

        {error && <ErrorLine id={ERROR_MESSAGE[error]} />}
        {!error && googleReturnError && (
          <ErrorLine id={googleReturnError === 'invite_required' ? 'signIn.error.googleInviteRequired' : 'signIn.error.googleOther'} />
        )}

        <button
          type="submit"
          disabled={pending || email.trim() === '' || password === ''}
          className="mt-1 h-12 rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-60"
        >
          {intl.formatMessage({ id: pending ? 'signIn.submitting' : 'signIn.submit' })}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setShowForgot((v) => !v)}
        aria-expanded={showForgot}
        className="mt-4 min-h-11 border-0 bg-transparent px-2 text-caption font-bold text-ink underline underline-offset-4"
      >
        <FormattedMessage id="signIn.forgot" />
      </button>
      {showForgot && (
        <p className="m-0 text-center text-caption text-ink-muted">
          <FormattedMessage id="signIn.forgotHelp" />
        </p>
      )}
      <button type="button" onClick={() => setShowCode(true)} className={`mt-1 ${linkButton}`}>
        <FormattedMessage id="signIn.haveCode" />
      </button>
      <p className="mt-auto mb-0 max-w-[320px] pt-8 text-center text-small text-ink-muted">
        <FormattedMessage id="signIn.inviteOnly" />
      </p>
    </main>
  );
}
