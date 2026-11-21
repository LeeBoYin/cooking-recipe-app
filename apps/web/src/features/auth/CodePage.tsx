import { useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { redeemInviteCode, type InviteError } from '../../data/invite.ts';
import { AuthLayout, ErrorLine, inputClass, linkButton, primaryButton } from './AuthLayout.tsx';
import { SignupForm } from './SignupForm.tsx';

const ERROR_MESSAGE: Partial<Record<InviteError, string>> = {
  invalid_code: 'invite.error.invalidCode',
  code_locked: 'invite.error.codeLocked',
  network: 'signIn.error.network',
};

// 從主畫面打開 App 後輸入邀請碼（12 ②）：兌換後接著建立帳號
export function CodePage({ onBack }: { onBack: () => void }) {
  const intl = useIntl();
  const [code, setCode] = useState('');
  const [error, setError] = useState<InviteError | null>(null);
  const [pending, setPending] = useState(false);
  const [redeemed, setRedeemed] = useState<{ email: string; code: string } | null>(null);

  if (redeemed) return <SignupForm email={redeemed.email} credential={{ code: redeemed.code }} />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await redeemInviteCode(code);
    setPending(false);
    if (r.ok) setRedeemed({ email: r.value.email, code });
    else setError(r.error);
  }

  return (
    <AuthLayout title={intl.formatMessage({ id: 'invite.enter.title' })} mood="idea">
      <p className="m-0 text-center text-caption text-ink-muted"><FormattedMessage id="invite.enter.body" /></p>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 rounded-card bg-surface p-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-bold"><FormattedMessage id="invite.enter.label" /></span>
          <input
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} text-center font-round text-[24px] font-bold tracking-[0.12em] uppercase`}
          />
        </label>
        {error && <ErrorLine id={ERROR_MESSAGE[error] ?? 'invite.error.unknown'} />}
        <button type="submit" disabled={pending || code.replace(/[\s-]/g, '').length < 6} className={primaryButton}>
          {intl.formatMessage({ id: pending ? 'invite.enter.submitting' : 'invite.enter.submit' })}
        </button>
      </form>
      <button type="button" onClick={onBack} className={`mx-auto ${linkButton}`}><FormattedMessage id="auth.backToSignIn" /></button>
    </AuthLayout>
  );
}
