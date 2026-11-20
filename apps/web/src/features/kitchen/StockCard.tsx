import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router';
import { useMySettings, useUpdateSettings } from '../../data/hooks.ts';
import { STOCK_CARD_HINT, STOCK_LATER } from '../onboarding/steps.ts';

// 「30 秒盤點」小卡（12 ⑦）：新手引導選了「之後再說」的人，第一次打開廚房的食材或廚具時看到。
// 只在這一頁還是空的時候出現，不跳提醒；關掉之後不再出現。
export function StockCard({ kind }: { kind: 'pantry' | 'equipment' }) {
  const settings = useMySettings();
  const update = useUpdateSettings();
  const s = settings.data;
  if (!s || !s.onboarding_completed_steps.includes(STOCK_LATER) || s.seen_hints.includes(STOCK_CARD_HINT)) return null;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-bulb-soft p-3">
      <b className="text-body"><FormattedMessage id="stockCard.title" /></b>
      <p className="m-0 text-caption text-ink-muted"><FormattedMessage id={`stockCard.${kind}`} /></p>
      <div className="flex items-center gap-2">
        <Link
          to={kind === 'pantry' ? '/kitchen/pantry/inventory' : '/kitchen/equipment/inventory'}
          className="flex h-11 items-center rounded-card border-2 border-ink bg-bulb px-4 text-caption font-bold text-ink no-underline"
        >
          <FormattedMessage id="stockCard.start" />
        </Link>
        <button
          type="button"
          onClick={() => update.mutate({ seen_hints: [...s.seen_hints, STOCK_CARD_HINT] })}
          className="h-11 border-0 bg-transparent px-2 font-[inherit] text-caption text-ink-muted"
        >
          <FormattedMessage id="stockCard.dismiss" />
        </button>
      </div>
    </div>
  );
}
