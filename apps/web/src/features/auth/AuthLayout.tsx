import type { ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';
import { Chef, type ChefMood } from '../../chef/Chef.tsx';

// 登入、註冊、重設密碼共用的版面：大廚、標題、內容
export function AuthLayout({ title, mood = 'normal', children }: { title: string; mood?: ChefMood; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center px-4 pt-[calc(48px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <Chef size={96} mood={mood} />
      <h1 className="mt-3 mb-0 text-center font-round text-display leading-tight font-bold">{title}</h1>
      <div className="mt-4 flex w-full flex-1 flex-col gap-3">{children}</div>
    </main>
  );
}

export function ErrorLine({ id }: { id: string }) {
  return (
    <p role="alert" className="m-0 flex items-start gap-2 text-caption text-error">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-0.5 shrink-0">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
      <span>
        <FormattedMessage id={id} />
      </span>
    </p>
  );
}

export const primaryButton = 'h-12 rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-60';
export const secondaryButton = 'h-12 rounded-card border-2 border-ink bg-transparent text-body font-bold text-ink disabled:opacity-60';
export const inputClass = 'h-12 rounded-card border-0 bg-bg px-3 text-body text-ink';
export const linkButton = 'min-h-11 border-0 bg-transparent px-2 text-caption font-bold text-ink underline underline-offset-4';

// 說明為什麼不能繼續的畫面（邀請連結失效、邀請碼不對…）：大廚語氣的說明加「回登入」
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <AuthLayout title={title} mood="quiet">
      <p className="m-0 text-center text-[15px] leading-relaxed text-ink-muted">{body}</p>
      <a href="/" className="mt-2 grid h-12 place-items-center rounded-card border-2 border-ink text-body font-bold text-ink no-underline">
        <FormattedMessage id="auth.backToSignIn" />
      </a>
    </AuthLayout>
  );
}
