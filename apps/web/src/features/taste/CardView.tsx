import { FormattedMessage, useIntl } from 'react-intl';
import type { TasteCard } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { cardTitleText, dimName } from './cardTitle.ts';
import { challengeCuisine, parseCardTitle } from './logic.ts';

function Row({ id, keys, names }: { id: string; keys?: string[]; names?: string[] }) {
  const labels = names ?? (keys ?? []).map(dimName);
  if (labels.length === 0) return null;
  return (
    <div className="flex gap-2.5 border-t border-line-soft px-3 py-2 text-caption first:border-t-0">
      <dt className="w-[4.5em] shrink-0 text-ink-muted"><FormattedMessage id={id} /></dt>
      <dd className="m-0 flex flex-wrap gap-1">
        {labels.map((label) => (
          <span key={label} className="rounded-tag bg-line-soft px-2 text-small">{label}</span>
        ))}
      </dd>
    </div>
  );
}

// 口味名片：名稱、愛、口感、想學、不吃、過敏（過敏來自飲食限制，由呼叫的畫面傳入名稱）
export function CardView({ card, allergens = [], onDone, onMore, saveState, doneId = 'taste.card.start' }: { doneId?: string; card: TasteCard; allergens?: string[]; onDone: () => void; onMore: () => void; saveState: 'saving' | 'error' | 'saved' }) {
  const intl = useIntl();
  const name = parseCardTitle(card.titleCode);
  const cuisine = challengeCuisine(card);
  const title = cardTitleText(intl, card.titleCode);
  const goalKeys = card.goals.filter((g) => g !== cuisine);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-end gap-2">
        <Chef size={40} />
        <p className="m-0 rounded-chef rounded-bl bg-bulb-soft px-3 py-2 font-round text-body">
          <FormattedMessage id={title ? 'taste.card.done' : 'taste.card.noName'} />
        </p>
      </div>
      {title && (
        <section className="flex flex-col gap-2.5 rounded-chef border-2 border-bulb bg-chef-soft px-4 pt-[18px] pb-4">
          <h2 className="m-0 font-round text-display font-bold leading-[1.3]">{title}</h2>
          {cuisine && name.kind === 'composed' && (
            <p className="m-0 text-body">
              <FormattedMessage id="taste.card.subtitle" values={{ cuisine: dimName(cuisine) }} />
            </p>
          )}
          <dl className="m-0 flex flex-col overflow-hidden rounded-card bg-surface">
            <Row id="taste.card.loves" keys={card.loves} />
            <Row id="taste.card.textures" keys={card.textures} />
            <Row id="taste.card.goals" keys={goalKeys} />
            <Row id="taste.card.avoids" keys={card.avoids} />
            <Row id="taste.card.allergens" names={allergens} />
          </dl>
        </section>
      )}
      <p className="m-0 text-center text-small text-ink-muted"><FormattedMessage id="taste.card.footer" /></p>
      {saveState === 'error' && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="taste.saveError" /></p>
      )}
      <button type="button" onClick={onDone} disabled={saveState === 'saving'} className="h-12 w-full rounded-card border-0 bg-bulb font-[inherit] text-body font-bold text-ink disabled:opacity-50">
        <FormattedMessage id={saveState === 'saving' ? 'taste.saving' : saveState === 'error' ? 'taste.retry' : doneId} />
      </button>
      {saveState === 'saved' && (
        <button type="button" onClick={onMore} className="h-12 w-full rounded-card border-0 bg-surface font-[inherit] text-body text-ink">
          <FormattedMessage id="taste.card.more" />
        </button>
      )}
    </div>
  );
}
