// 後台共用的小元件與樣式。電腦優先，手機也能看（02 L）。
import { useEffect, useState, type ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import QRCode from 'qrcode';
import { adminErrorOf, mailtoUrl, type AdminError } from '../../data/admin.ts';

export const btn = 'h-10 rounded-card border-2 border-ink bg-transparent px-3 text-caption font-bold text-ink disabled:opacity-60';
export const btnPrimary = 'h-10 rounded-card border-0 bg-bulb px-4 text-caption font-bold text-ink disabled:opacity-60';
export const btnDanger = 'h-10 rounded-card border-2 border-error bg-transparent px-3 text-caption font-bold text-error disabled:opacity-60';
export const field = 'h-10 rounded-card border border-line-strong bg-surface px-3 text-body text-ink';

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card bg-surface p-4 ${className}`}>
      {title && <h2 className="m-0 mb-3 font-round text-card-title font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const code: AdminError = adminErrorOf(error);
  return (
    <p role="alert" className="m-0 text-caption text-error">
      <FormattedMessage id={`admin.error.${code}`} defaultMessage="" />
    </p>
  );
}

export function useCopy(): { copied: string | null; copy: (key: string, text: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return {
    copied,
    copy(key, text) {
      void navigator.clipboard
        ?.writeText(text)
        .then(() => setCopied(key))
        .catch(() => undefined);
    },
  };
}

export function QrImage({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(text, { margin: 1, width: 192, errorCorrectionLevel: 'M' }).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [text]);
  return src ? <img src={src} width={192} height={192} alt={label} className="rounded-card border border-line" /> : null;
}

// 產生連結後的結果：連結、可以直接貼上的訊息、複製、分享、用我的信箱寄、QR Code。
// 連結只顯示這一次（資料庫只存雜湊），所以關掉就看不到了。
export function LinkResult({
  url,
  message,
  expiresAt,
  email,
  mailSubject,
  onClose,
}: {
  url: string;
  message: string;
  expiresAt: string;
  email?: string;
  mailSubject?: string;
  onClose: () => void;
}) {
  const intl = useIntl();
  const { copied, copy } = useCopy();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <Card className="border-2 border-bulb">
      <p className="m-0 mb-3 text-caption text-ink-muted">
        <FormattedMessage id="admin.link.onlyOnce" values={{ date: intl.formatDate(expiresAt, { dateStyle: 'medium', timeStyle: 'short' }) }} />
      </p>
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="admin.link.url" /></span>
            <span className="flex gap-2">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${field} min-w-0 flex-1`} />
              <button type="button" className={btn} onClick={() => copy('url', url)}>
                <FormattedMessage id={copied === 'url' ? 'admin.copied' : 'admin.copy'} />
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-bold"><FormattedMessage id="admin.link.message" /></span>
            <textarea readOnly value={message} rows={6} onFocus={(e) => e.currentTarget.select()} className="rounded-card border border-line-strong bg-surface p-3 text-caption leading-relaxed text-ink" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => copy('message', message)}>
              <FormattedMessage id={copied === 'message' ? 'admin.copied' : 'admin.link.copyMessage'} />
            </button>
            {canShare && (
              <button type="button" className={btn} onClick={() => void navigator.share({ text: message }).catch(() => undefined)}>
                <FormattedMessage id="admin.link.share" />
              </button>
            )}
            {email && mailSubject && (
              <a href={mailtoUrl(email, mailSubject, message)} className={`${btn} inline-flex items-center no-underline`}>
                <FormattedMessage id="admin.link.mail" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <QrImage text={url} label={intl.formatMessage({ id: 'admin.link.qr' })} />
          <span className="text-small text-ink-muted"><FormattedMessage id="admin.link.qrHint" /></span>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" className={btn} onClick={onClose}><FormattedMessage id="admin.link.close" /></button>
      </div>
    </Card>
  );
}
