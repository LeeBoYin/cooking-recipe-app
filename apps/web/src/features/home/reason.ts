import type { IdeaReason, TasteProfile } from '@zhusha/core';
import { getIngredient } from '@zhusha/ingredients';
import { getDimension } from '@zhusha/taste';

// 理由模板的訊息代碼與參數（文字放語系檔）
export function reasonMessage(reason: IdeaReason, profile: TasteProfile): { id: string; values?: Record<string, string> } {
  switch (reason.code) {
    case 'taste': {
      const dimension = getDimension(reason.dimensionKey)?.name['zh-TW'] ?? '';
      const love = (profile.dims[reason.dimensionKey]?.affinity ?? 0) >= 0.75;
      return { id: love ? 'idea.reason.tasteLove' : 'idea.reason.taste', values: { dimension } };
    }
    case 'pantry_priority':
      return { id: 'idea.reason.pantryPriority', values: { ingredient: getIngredient(reason.ingredientId)?.name['zh-TW'] ?? '' } };
    case 'in_season':
      return { id: 'idea.reason.inSeason', values: { ingredient: getIngredient(reason.ingredientId)?.name['zh-TW'] ?? '' } };
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
