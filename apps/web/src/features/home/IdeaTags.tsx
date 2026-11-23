import { useLayoutEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { ChatMention } from '@zhusha/core';
import { fitTagCount, mainIngredientNames, mentionUsed, type IdeaView } from './ideaView.ts';

// 點子卡片的標籤列（首頁、對話、收藏共用）：主要食材只排一行、不換行，依實際寬度放得下幾個放幾個，其餘算進「+N」；沒有食材時放難易度
const TAG = 'whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green';
const GAP = 4; // gap-1

export function IdeaTags({ view, tone = 'surface' }: { view: Pick<IdeaView, 'ingredients' | 'difficulty'>; tone?: 'surface' | 'bg' }) {
  const names = mainIngredientNames(view);
  const key = names.join('\u0000');
  const wrap = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(names.length);

  useLayoutEffect(() => {
    const w = wrap.current;
    const m = measure.current;
    if (!w || !m) return;
    const calc = () => {
      const kids = [...m.children] as HTMLElement[];
      const moreEl = kids.pop();
      const widths = kids.map((k) => k.getBoundingClientRect().width);
      const moreW = moreEl?.getBoundingClientRect().width ?? 0;
      setCount(fitTagCount(widths, w.clientWidth, GAP, () => moreW));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(w);
    return () => ro.disconnect();
  }, [key]);

  if (names.length > 0) {
    const shown = Math.min(count, names.length);
    const extra = names.length - shown;
    return (
      <span ref={wrap} className="relative mt-0.5 block min-w-0 max-w-full">
        <span className="flex flex-nowrap gap-1 overflow-hidden">
          {names.slice(0, shown).map((name) => (
            <span key={name} className={`${TAG} min-w-0 flex-none`}>
              {name}
            </span>
          ))}
          {extra > 0 && (
            <span className={`${TAG} flex-none`}>
              <FormattedMessage id="home.ideas.tagMore" values={{ count: extra }} />
            </span>
          )}
        </span>
        {/* 量寬度用：全部的標籤加上最寬的「+N」，看不見也不佔位 */}
        <span ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex h-0 gap-1 overflow-hidden">
          {names.map((name) => (
            <span key={name} className={`${TAG} flex-none`}>
              {name}
            </span>
          ))}
          <span className={`${TAG} flex-none`}>
            <FormattedMessage id="home.ideas.tagMore" values={{ count: names.length }} />
          </span>
        </span>
      </span>
    );
  }
  if (!view.difficulty) return null;
  return (
    <span className={`mt-0.5 whitespace-nowrap rounded-tag px-2 py-0.5 text-small text-ink-muted ${tone === 'bg' ? 'bg-bg' : 'bg-surface'}`}>
      <FormattedMessage id="home.ideas.difficulty" values={{ value: view.difficulty }} />
    </span>
  );
}

// 對話裡的點子卡片：列出使用者提到的每一樣食材，這道有用到的綠色、沒用到的灰色（灰色另外有文字給讀螢幕的人）
export function MentionedTags({ view, mentioned }: { view: Pick<IdeaView, 'ingredients' | 'others' | 'title'>; mentioned: readonly ChatMention[] }) {
  const intl = useIntl();
  if (mentioned.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-col gap-1">
      <span className="text-small text-ink-muted">
        <FormattedMessage id="chat.mentioned" />
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {mentioned.map((m) => {
          const used = mentionUsed(view, m);
          return (
            <li key={m.text} className={`whitespace-nowrap rounded-tag px-2 py-0.5 text-small ${used ? 'bg-green-soft font-bold text-green' : 'bg-bg text-ink-muted'}`}>
              {m.text}
              <span className="sr-only">{intl.formatMessage({ id: used ? 'chat.mentioned.used' : 'chat.mentioned.unused' })}</span>
            </li>
          );
        })}
      </ul>
    </span>
  );
}
