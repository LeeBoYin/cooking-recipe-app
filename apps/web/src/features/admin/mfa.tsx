// 兩步驟驗證（TOTP）：第一次進後台時綁定驗證器 App，之後每次登入都要輸入驗證碼（02 L「安全」、04 ADR-15）。
import { useEffect, useState, type FormEvent } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { enrollTotp, verifyTotp, type MfaError, type TotpEnrollment } from '../../data/admin.ts';
import { AuthLayout, ErrorLine, inputClass, primaryButton } from '../auth/AuthLayout.tsx';
import { useCopy } from './ui.tsx';

function CodeForm({ factorId, submitId, onDone }: { factorId: string; submitId: string; onDone: () => void }) {
  const intl = useIntl();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MfaError | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || code.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await verifyTotp(factorId, code);
    if (result) {
      setError(result);
      setCode('');
      setPending(false);
    } else onDone();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 rounded-card bg-surface p-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-bold"><FormattedMessage id="admin.mfa.code" /></span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${inputClass} text-center font-round text-title tracking-[0.3em]`}
          aria-label={intl.formatMessage({ id: 'admin.mfa.code' })}
          autoFocus
        />
      </label>
      {error && <ErrorLine id={error === 'invalid_code' ? 'admin.mfa.invalidCode' : 'admin.error.network'} />}
      <button type="submit" disabled={pending || code.length !== 6} className={primaryButton}>
        <FormattedMessage id={submitId} />
      </button>
    </form>
  );
}

// 之後每次登入：輸入驗證碼
export function MfaVerify({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const intl = useIntl();
  return (
    <AuthLayout title={intl.formatMessage({ id: 'admin.mfa.verify.title' })} mood="quiet">
      <p className="m-0 text-center text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="admin.mfa.verify.body" /></p>
      <CodeForm factorId={factorId} submitId="admin.mfa.verify.submit" onDone={onDone} />
    </AuthLayout>
  );
}

// 第一次：掃 QR Code（或手動輸入密鑰）綁定驗證器 App，再輸入第一組驗證碼確認
export function MfaEnroll({ onDone }: { onDone: () => void }) {
  const intl = useIntl();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [failed, setFailed] = useState(false);
  const { copied, copy } = useCopy();

  useEffect(() => {
    let live = true;
    enrollTotp().then(
      (e) => live && setEnrollment(e),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <AuthLayout title={intl.formatMessage({ id: 'admin.mfa.enroll.title' })} mood="idea">
      <p className="m-0 text-center text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="admin.mfa.enroll.body" /></p>
      {failed && <ErrorLine id="admin.error.network" />}
      {enrollment && (
        <>
          <div className="flex flex-col items-center gap-2 rounded-card bg-surface p-4">
            <img src={enrollment.qrCode} alt={intl.formatMessage({ id: 'admin.mfa.enroll.qr' })} width={176} height={176} />
            <span className="text-small text-ink-muted"><FormattedMessage id="admin.mfa.enroll.manual" /></span>
            <button type="button" onClick={() => copy('secret', enrollment.secret)} className="max-w-full border-0 bg-transparent p-1 font-mono text-small break-all text-ink underline underline-offset-4">
              {copied === 'secret' ? intl.formatMessage({ id: 'admin.copied' }) : enrollment.secret}
            </button>
          </div>
          <CodeForm factorId={enrollment.factorId} submitId="admin.mfa.enroll.submit" onDone={onDone} />
        </>
      )}
    </AuthLayout>
  );
}
