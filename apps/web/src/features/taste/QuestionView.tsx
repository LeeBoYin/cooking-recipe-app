import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { QuizAnswer } from '@zhusha/core';
import type { QuizItem } from '@zhusha/taste';

const OPT = 'flex min-h-12 w-full items-center gap-2.5 rounded-card border-0 bg-surface px-3.5 py-2.5 text-left font-[inherit] text-body text-ink';
const OPT_ON = 'bg-bulb-soft outline-2 outline-bulb';
const PRIMARY = 'h-12 w-full rounded-card border-0 bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50';

type Props = { items: QuizItem[]; onAnswer: (answers: QuizAnswer[]) => void };

// 一個畫面的題目：菜卡、二選一、光譜、情境點一下就送出；快問快答一組、複選的情境題要按「下一組／下一題」
export function QuestionView({ items, onAnswer }: Props) {
  const first = items[0];
  if (!first) return null;
  switch (first.type) {
    case 'dish_card':
      return <DishCard item={first} onAnswer={onAnswer} />;
    case 'this_or_that':
      return <ThisOrThat item={first} onAnswer={onAnswer} />;
    case 'spectrum':
      return <Spectrum item={first} onAnswer={onAnswer} />;
    case 'quick_fire':
      return <QuickFire items={items} onAnswer={onAnswer} />;
    case 'context':
      return <Context item={first} onAnswer={onAnswer} />;
    default:
      return null;
  }
}

function Question({ kind, title, hint }: { kind?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-surface px-3.5 py-4">
      {kind && <span className="text-small text-ink-muted">{kind}</span>}
      <h2 className="m-0 font-round text-heading font-bold leading-[1.3]">{title}</h2>
      {hint && <p className="m-0 text-body text-ink-muted">{hint}</p>}
    </div>
  );
}

const DISH_ANSWERS = [
  { value: 'love', emoji: '😋' },
  { value: 'try', emoji: '🤩' },
  { value: 'ok', emoji: '🙂' },
  { value: 'nope', emoji: '🙅' },
] as const;

function DishCard({ item, onAnswer }: { item: QuizItem; onAnswer: Props['onAnswer'] }) {
  const intl = useIntl();
  return (
    <>
      <Question kind={intl.formatMessage({ id: 'taste.kind.dish_card' })} title={item.title['zh-TW']} hint={item.description?.['zh-TW']} />
      <div className="flex flex-col gap-2">
        {DISH_ANSWERS.map((a) => (
          <button key={a.value} type="button" className={OPT} onClick={() => onAnswer([{ type: 'dish_card', value: a.value }])}>
            <span aria-hidden="true" className="text-xl">{a.emoji}</span>
            <FormattedMessage id={`taste.answer.${a.value}`} />
          </button>
        ))}
      </div>
    </>
  );
}

function ThisOrThat({ item, onAnswer }: { item: QuizItem; onAnswer: Props['onAnswer'] }) {
  const intl = useIntl();
  return (
    <>
      <Question kind={intl.formatMessage({ id: 'taste.kind.this_or_that' })} title={item.title['zh-TW']} />
      <div className="flex flex-col gap-2">
        {(item.options ?? []).map((o, i) => (
          <button key={i} type="button" className={`${OPT} min-h-16 font-round text-card-title`} onClick={() => onAnswer([{ type: 'this_or_that', choice: i === 0 ? 0 : 1 }])}>
            {o.label['zh-TW']}
          </button>
        ))}
      </div>
    </>
  );
}

function Spectrum({ item, onAnswer }: { item: QuizItem; onAnswer: Props['onAnswer'] }) {
  const intl = useIntl();
  return (
    <>
      <Question kind={intl.formatMessage({ id: 'taste.kind.spectrum' })} title={item.title['zh-TW']} />
      <div className="flex flex-col gap-2">
        {(item.spectrum?.labels ?? []).map((l, i) => (
          <button key={i} type="button" className={OPT} onClick={() => onAnswer([{ type: 'spectrum', point: Math.min(i, 4) as 0 | 1 | 2 | 3 | 4 }])}>
            {l['zh-TW']}
          </button>
        ))}
      </div>
    </>
  );
}

const QF = ['love', 'ok', 'no'] as const;

function QuickFire({ items, onAnswer }: { items: QuizItem[]; onAnswer: Props['onAnswer'] }) {
  const [picked, setPicked] = useState<Record<string, (typeof QF)[number]>>({});
  const ready = items.every((i) => picked[i.id]);
  return (
    <>
      <ul className="m-0 flex list-none flex-col rounded-card bg-surface p-0">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 border-t border-line-soft py-2 pr-2.5 pl-3.5 first:border-t-0">
            <b className="min-w-[4em] flex-1 text-body">{item.title['zh-TW']}</b>
            <div role="group" aria-label={item.title['zh-TW']} className="flex gap-1.5">
              {QF.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={picked[item.id] === v}
                  onClick={() => setPicked((p) => ({ ...p, [item.id]: v }))}
                  className={`h-11 min-w-[52px] rounded-full border border-line px-3 font-[inherit] text-caption text-ink ${picked[item.id] === v ? 'border-bulb bg-bulb-soft font-bold' : 'bg-surface'}`}
                >
                  <FormattedMessage id={`taste.qf.${v}`} />
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className={PRIMARY} disabled={!ready} onClick={() => onAnswer(items.map((i) => ({ type: 'quick_fire', value: picked[i.id] ?? 'ok' })))}>
        <FormattedMessage id="taste.nextGroup" />
      </button>
      <p className="m-0 text-small text-ink-muted"><FormattedMessage id="taste.qf.help" /></p>
    </>
  );
}

function Context({ item, onAnswer }: { item: QuizItem; onAnswer: Props['onAnswer'] }) {
  const intl = useIntl();
  const multi = item.contextField === 'cooks_for';
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <>
      <Question kind={intl.formatMessage({ id: 'taste.kind.context' })} title={item.title['zh-TW']} hint={multi ? intl.formatMessage({ id: 'taste.multi' }) : undefined} />
      <div className="flex flex-col gap-2">
        {(item.options ?? []).map((o, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={multi ? picked.includes(i) : undefined}
            className={`${OPT} ${multi && picked.includes(i) ? OPT_ON : ''}`}
            onClick={() => (multi ? toggle(i) : onAnswer([{ type: 'context', choices: [i] }]))}
          >
            {multi && <span aria-hidden="true">{picked.includes(i) ? '●' : '○'}</span>}
            {o.label['zh-TW']}
          </button>
        ))}
      </div>
      {multi && (
        <button type="button" className={PRIMARY} disabled={picked.length === 0} onClick={() => onAnswer([{ type: 'context', choices: picked }])}>
          <FormattedMessage id="taste.next" />
        </button>
      )}
    </>
  );
}
