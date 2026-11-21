import type { IdeaReason, TasteProfile } from '@zhusha/core';
import { getIngredient } from '@zhusha/ingredients';
import { getDimension } from '@zhusha/taste';

import type { IntlShape } from 'react-intl';
import type { ChefLineFn } from '../../chef/useChef.ts';

// 理由的文字。「手邊的食材」「當季」兩種依大廚的語氣挑一句（chef.line.*）；其他用固定的模板。
// 設定還沒讀到時，語氣的那兩種先退回固定模板，避免讀到後換一句
export function reasonText(reason: IdeaReason, profile: TasteProfile, intl: IntlShape, chefLine: ChefLineFn, seed: string): string {
  if (reason.code === 'pantry_priority' || reason.code === 'in_season') {
    const ingredient = getIngredient(reason.ingredientId)?.name['zh-TW'] ?? '';
    const picked = chefLine(reason.code === 'pantry_priority' ? 'reasonPantry' : 'reasonSeason', { ingredient }, seed);
    if (picked) return picked;
  }
  const m = reasonMessage(reason, profile);
  return intl.formatMessage({ id: m.id }, m.values);
}

// 理由模板的訊息代碼與參數（文字放語系檔）
export function reasonMessage(reason: IdeaReason, profile: TasteProfile): { id: string; values?: Record<string, string> } {
  switch (reason.code) {
    case 'taste': {
      const dimension = getDimension(reason.dimensionKey)?.name['zh-TW'] ?? '';
      const love = (profile.dims[reason.dimensionKey]?.affinity ?? 0) >= 0.75;
      return { id: love ? 'idea.reason.tasteLove' : 'idea.reason.taste', values: { dimension } };
    }
    case 'pantry_priority':
      return { id: 'chef.line.reasonPantry.warm.1', values: { ingredient: getIngredient(reason.ingredientId)?.name['zh-TW'] ?? '' } };
    case 'in_season':
      return { id: 'chef.line.reasonSeason.warm.1', values: { ingredient: getIngredient(reason.ingredientId)?.name['zh-TW'] ?? '' } };
    case 'have_ingredients':
      return { id: 'idea.reason.haveIngredients' };
    case 'tag_family_favorite':
      return { id: 'idea.reason.tagFamilyFavorite' };
    case 'tag_make_again':
      return { id: 'idea.reason.tagMakeAgain' };
    case 'long_time':
      return { id: 'idea.reason.longTime' };
    case 'fits_you':
      return { id: 'idea.reason.fitsYou' };
  }
}
