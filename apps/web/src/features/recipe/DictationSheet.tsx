import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { DICTATION_MAX_CHARS } from '@zhusha/core';
import { Sheet } from '../../ui/Sheet.tsx';

// 說話面板（M1b-03）：文字框自動對焦，請使用者按手機鍵盤上的麥克風聽寫。不錄音、不顯示錄音動畫。
// 按「請大廚整理」後面板留著顯示「大廚整理中…」，整理完（或 AI 不能用）才關；結果由上層處理。
export function DictationSheet({ onSubmit, onClose }: { onSubmit: (text: string) => Promise<void>; onClose: () => void }) {
  const intl = useIntl();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const length = [...text].length;
  const canSubmit = text.trim() !== '' && !busy;

  return (
    <Sheet label={intl.formatMessage({ id: 'dictation.title' })} onClose={onClose} locked={busy}>
      {(requestClose) => (
        <div className="flex flex-col gap-3">
          <h2 className="m-0 font-round text-card-title"><FormattedMessage id="dictation.title" /></h2>
          <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="dictation.hint" /></p>
          <textarea
            autoFocus
            rows={6}
            value={text}
            maxLength={DICTATION_MAX_CHARS}
            disabled={busy}
            aria-label={intl.formatMessage({ id: 'dictation.title' })}
            placeholder={intl.formatMessage({ id: 'dictation.placeholder' })}
            onChange={(e) => setText(e.target.value)}
            className="w-full resize-none rounded-card border border-line bg-surface px-3 py-2.5 text-body leading-relaxed text-ink"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-small text-ink-muted" aria-live="polite">
              {busy ? <FormattedMessage id="dictation.working" /> : <FormattedMessage id="dictation.count" values={{ count: length, max: DICTATION_MAX_CHARS }} />}
            </span>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                setBusy(true);
                void onSubmit(text.trim()).then(requestClose, requestClose);
              }}
              className="min-h-12 rounded-full border-0 bg-bulb px-5 text-body font-bold font-[inherit] text-ink disabled:bg-line disabled:text-ink-muted"
            >
              <FormattedMessage id="dictation.submit" />
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
