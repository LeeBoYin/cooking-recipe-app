import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Sheet } from '../../ui/Sheet.tsx';

export type ShoppingLine = { id: string; text: string; have: boolean };

// 「列出要買的」：這道菜的所有食材，廚房有的標「廚房有」、先不勾，其他先勾好。
// 送出的只有勾選的，一行一樣；不會改到廚房的食材清單。
export function ShoppingSheet({ title, lines, onClose }: { title: string; lines: ShoppingLine[]; onClose: () => void }) {
  const intl = useIntl();
  const [checked, setChecked] = useState(() => new Set(lines.filter((l) => !l.have).map((l) => l.id)));
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const text = lines.filter((l) => checked.has(l.id)).map((l) => l.text).join('\n');

  function toggle(id: string) {
    setNotice(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('copied');
    } catch {
      setNotice('failed');
    }
  }

  async function share() {
    try {
      await navigator.share({ title, text });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return; // 使用者自己關掉分享選單
      await copy(); // 分享不成功就退回複製
    }
  }

  const BTN = 'flex h-12 flex-1 items-center justify-center rounded-card border-0 text-body font-bold disabled:opacity-40';
  return (
    <Sheet label={intl.formatMessage({ id: 'recipe.buy.title' })} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 font-round text-card-title">{title}</h2>
        <span className="text-small text-ink-muted"><FormattedMessage id="recipe.buy.hint" /></span>
      </div>
      <ul className="m-0 list-none rounded-card bg-surface px-3 py-0.5">
        {lines.map((l) => (
          <li key={l.id} className="border-b border-line-soft last:border-b-0">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-[15px]">
              <input
                type="checkbox"
                checked={checked.has(l.id)}
                onChange={() => toggle(l.id)}
                className="size-5 flex-none accent-ink"
              />
              <span className="flex-1">{l.text}</span>
              {l.have && (
                <span className="whitespace-nowrap rounded-tag bg-line-soft px-2 py-0.5 text-small text-ink-muted">
                  <FormattedMessage id="recipe.buy.have" />
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <p role="status" className="m-0 min-h-5 text-small text-ink-muted">
        {notice === 'copied' && <FormattedMessage id="recipe.buy.copied" />}
        {notice === 'failed' && <FormattedMessage id="recipe.buy.copyFailed" />}
      </p>
      <div className="flex gap-2.5">
        <button type="button" disabled={checked.size === 0} onClick={() => void copy()} className={`${BTN} ${canShare ? 'bg-surface text-ink' : 'bg-bulb text-ink'}`}>
          <FormattedMessage id="recipe.buy.copy" />
        </button>
        {canShare && (
          <button type="button" disabled={checked.size === 0} onClick={() => void share()} className={`${BTN} bg-bulb text-ink`}>
            <FormattedMessage id="recipe.buy.share" />
          </button>
        )}
      </div>
    </Sheet>
  );
}
