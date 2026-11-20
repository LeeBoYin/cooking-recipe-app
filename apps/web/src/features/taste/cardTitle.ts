import type { IntlShape } from 'react-intl';
import { getDimension } from '@zhusha/taste';
import { challengeCuisine, parseCardTitle } from './logic.ts';

export const dimName = (key: string) => getDimension(key)?.name['zh-TW'] ?? key;

// 名稱代碼 → 顯示文字（「香辣台式派」）；沒有名稱時是 null
export function cardTitleText(intl: IntlShape, code: string | null | undefined): string | null {
  const name = parseCardTitle(code ?? undefined);
  if (name.kind === 'explorer') return intl.formatMessage({ id: 'taste.card.explorer' });
  if (name.kind !== 'composed') return null;
  return intl.formatMessage(
    { id: 'taste.card.name' },
    {
      prefix: name.prefix ? intl.formatMessage({ id: `taste.card.prefix.${name.prefix}`, defaultMessage: dimName(name.prefix) }) : '',
      suffix: name.suffix ? intl.formatMessage({ id: `taste.card.suffix.${name.suffix}`, defaultMessage: dimName(name.suffix) }) : '',
    },
  );
}

// 名片副標：「偶爾想挑戰泰式」
export function challengeText(intl: IntlShape, goals: string[]): string | null {
  const cuisine = challengeCuisine({ goals });
  return cuisine ? intl.formatMessage({ id: 'taste.card.subtitle' }, { cuisine: dimName(cuisine) }) : null;
}
