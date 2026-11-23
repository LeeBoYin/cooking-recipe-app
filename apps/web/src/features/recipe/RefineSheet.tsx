import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { REFINE_MAX_CHARS, type RefineChange } from '@zhusha/core';
import { Sheet } from '../../ui/Sheet.tsx';
import { track } from '../../data/track.ts';
import { describeChange } from './refine.ts';

type Phase = { kind: 'speak' } | { kind: 'busy' } | { kind: 'confirm'; changes: RefineChange[] } | { kind: 'empty' } | { kind: 'unavailable' };

// 再跟大廚說（M1b-04a）：說一句要改的地方 → 大廚列出「會改這些」→ 作者確認後才套進編輯頁還沒儲存的狀態。
// 和說話面板一樣：文字框自動對焦，請使用者按手機鍵盤上的麥克風聽寫，不錄音。
// 大廚現在不能用：顯示目前無法使用，請改用手動編輯（不暫存指令）。
export function RefineSheet({
  onPropose,
  onApply,
  onClose,
}: {
  onPropose: (text: string) => Promise<{ status: 'ok'; changes: RefineChange[] } | { status: 'unavailable' }>;
  onApply: (changes: RefineChange[]) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'speak' });
  const length = [...text].length;
  const busy = phase.kind === 'busy';

  async function submit() {
    setPhase({ kind: 'busy' });
    const res = await onPropose(text.trim());
    if (res.status === 'unavailable') setPhase({ kind: 'unavailable' });
    else setPhase(res.changes.length === 0 ? { kind: 'empty' } : { kind: 'confirm', changes: res.changes });
  }

  const kindLabel = (kind: RefineChange['kind'], field?: string): string =>
    intl.formatMessage({ id: kind === 'field' ? `refine.field.${field}` : `refine.kind.${kind}` });

  return (
    <Sheet label={intl.formatMessage({ id: 'refine.title' })} onClose={onClose} locked={busy}>
      {(requestClose) => (
        <div className="flex flex-col gap-3">
          <h2 className="m-0 font-round text-card-title"><FormattedMessage id={phase.kind === 'confirm' ? 'refine.confirm.title' : 'refine.title'} /></h2>

          {(phase.kind === 'speak' || phase.kind === 'busy' || phase.kind === 'empty') && (
            <>
              <p className="m-0 text-caption text-ink-muted"><FormattedMessage id={phase.kind === 'empty' ? 'refine.empty' : 'refine.hint'} /></p>
              <textarea
                autoFocus
                rows={4}
                value={text}
                maxLength={REFINE_MAX_CHARS}
                disabled={busy}
                aria-label={intl.formatMessage({ id: 'refine.title' })}
                placeholder={intl.formatMessage({ id: 'refine.placeholder' })}
                onChange={(e) => {
                  setText(e.target.value);
                  if (phase.kind === 'empty') setPhase({ kind: 'speak' });
                }}
                className="w-full resize-none rounded-card border border-line bg-surface px-3 py-2.5 text-body leading-relaxed text-ink"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-small text-ink-muted" aria-live="polite">
                  {busy ? <FormattedMessage id="refine.working" /> : <FormattedMessage id="dictation.count" values={{ count: length, max: REFINE_MAX_CHARS }} />}
                </span>
                <button
                  type="button"
                  disabled={text.trim() === '' || busy}
                  onClick={() => void submit()}
                  className="min-h-12 rounded-full border-0 bg-bulb px-5 text-body font-bold font-[inherit] text-ink disabled:bg-line disabled:text-ink-muted"
                >
                  <FormattedMessage id="refine.submit" />
                </button>
              </div>
            </>
          )}

          {phase.kind === 'confirm' && (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {phase.changes.map((c, i) => {
                  const d = describeChange(c);
                  const label = kindLabel(d.kind, d.field);
                  const id = d.op === 'field' ? (d.to === '' ? 'refine.change.clear' : 'refine.change.field') : `refine.change.${d.op}`;
                  return (
                    <li key={i} className="rounded-card bg-surface px-3 py-2 text-body leading-normal text-ink">
                      <FormattedMessage id={id} values={{ label, from: d.from ?? '', to: d.to ?? '' }} />
                    </li>
                  );
                })}
              </ul>
              <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="refine.confirm.note" /></p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    track('recipe.refine_by_voice', { result: 'cancelled', changeCount: Math.min(phase.changes.length, 30) });
                    requestClose();
                  }}
                  className="min-h-12 rounded-full border border-line bg-transparent px-5 text-body font-[inherit] text-ink"
                >
                  <FormattedMessage id="common.cancel" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(phase.changes);
                    requestClose();
                  }}
                  className="min-h-12 rounded-full border-0 bg-bulb px-5 text-body font-bold font-[inherit] text-ink"
                >
                  <FormattedMessage id="refine.apply" />
                </button>
              </div>
            </>
          )}

          {phase.kind === 'unavailable' && (
            <>
              <p role="status" className="m-0 text-body leading-normal text-ink"><FormattedMessage id="refine.unavailable" /></p>
              <div className="flex justify-end">
                <button type="button" onClick={requestClose} className="min-h-12 rounded-full border border-line bg-transparent px-5 text-body font-[inherit] text-ink">
                  <FormattedMessage id="common.close" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
