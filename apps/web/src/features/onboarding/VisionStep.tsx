import { useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';

const CARDS = ['1', '2', '3'] as const;

// ① 願景卡（12 ①）：三張左右滑的卡片，右上角「跳過」，最後一張按鈕「開始」
export function VisionStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const intl = useIntl();
  const chef = useChef();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const last = index === CARDS.length - 1;

  const goTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" onClick={onSkip} className="h-11 border-0 bg-transparent px-1 font-[inherit] text-[15px] text-ink-muted">
          <FormattedMessage id="onboarding.skip" />
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="-mx-5 flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CARDS.map((n) => (
          <section
            key={n}
            aria-label={intl.formatMessage({ id: 'onboarding.vision.position' }, { index: Number(n), total: CARDS.length })}
            className="flex w-full shrink-0 snap-center flex-col gap-4 px-5"
          >
            <div className="flex justify-center pt-6"><Chef size={96} mood={n === '1' ? 'happy' : 'normal'} /></div>
            <h1 className="m-0 whitespace-pre-line font-round text-display leading-[1.4]">
              <FormattedMessage id={`onboarding.vision.${n}.title`} />
            </h1>
            <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id={`onboarding.vision.${n}.body`} /></p>
            {n === '2' && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-relaxed">
                <li><FormattedMessage id="onboarding.vision.2.recipes" values={{ b: (c) => <b>{c}</b> }} /></li>
                <li><FormattedMessage id="onboarding.vision.2.kitchen" values={{ b: (c) => <b>{c}</b> }} /></li>
              </ul>
            )}
            {n === '3' && (
              <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] leading-relaxed">
                <li><FormattedMessage id="onboarding.vision.3.a" /></li>
                <li><FormattedMessage id="onboarding.vision.3.b" /></li>
                <li><FormattedMessage id="onboarding.vision.3.c" /></li>
              </ol>
            )}
            <p className="m-0 rounded-chef rounded-bl bg-surface px-3.5 py-3 font-round text-body leading-relaxed">
              {chef.line(`vision${n}`)}
            </p>
          </section>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div role="group" aria-label={intl.formatMessage({ id: 'onboarding.vision.position' }, { index: index + 1, total: CARDS.length })} className="flex justify-center gap-1.5">
          {CARDS.map((n, i) => (
            <span key={n} className={`h-1.5 rounded-[3px] transition-[width] ${i === index ? 'w-[18px] bg-ink' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (last ? onDone() : goTo(index + 1))}
          className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink"
        >
          <FormattedMessage id={last ? 'onboarding.vision.start' : 'onboarding.vision.next'} />
        </button>
      </div>
    </div>
  );
}
