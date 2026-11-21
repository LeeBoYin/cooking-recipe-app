import { useEffect, useState, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { signOut } from '../../data/auth.ts';
import { completeGoogleSignupIfNeeded, type GoogleCompleteResult } from '../../data/invite.ts';
import { AuthLayout, primaryButton, secondaryButton } from './AuthLayout.tsx';

// 登入後先確認註冊資料存在。Google 第一次登入還沒有，這裡呼叫 complete_google_signup 認領邀請並建立；
// 密碼登入的人一定已經有，只多一次讀取。
export function GoogleGate({ userId, children }: { userId: string; children: ReactNode }) {
  const intl = useIntl();
  const [result, setResult] = useState<GoogleCompleteResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setResult(null);
    void completeGoogleSignupIfNeeded(userId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  if (result === 'ready') return <>{children}</>;
  if (!result) return <AuthLayout title={intl.formatMessage({ id: 'googleGate.working' })} mood="idea">{null}</AuthLayout>;
  return (
    <AuthLayout title={intl.formatMessage({ id: 'googleGate.title' })} mood="quiet">
      <p className="m-0 text-center text-[15px] leading-relaxed text-ink-muted">
        <FormattedMessage id={result === 'no_invite' ? 'googleGate.noInvite' : 'googleGate.network'} />
      </p>
      {result === 'network' && (
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={primaryButton}>
          <FormattedMessage id="googleGate.retry" />
        </button>
      )}
      <button type="button" onClick={() => void signOut()} className={result === 'network' ? secondaryButton : primaryButton}>
        <FormattedMessage id="googleGate.signOut" />
      </button>
    </AuthLayout>
  );
}
