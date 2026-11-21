import { FormattedMessage, useIntl } from 'react-intl';
import { useCurrentKitchen, useMyDeletedRecipes, useRecentlyRemovedPantry } from '../../data/hooks.ts';
import { SubPage } from '../shell/SubPage.tsx';
import { TrashPantry } from './TrashPantry.tsx';
import { TrashRecipes } from './TrashRecipes.tsx';

// 「我的 → 最近刪除」：食譜（含草稿）與目前廚房的食材，保留期限內都可以復原。廚具是直接刪除，不在這裡
export function TrashPage() {
  const intl = useIntl();
  const { kitchen } = useCurrentKitchen();
  const recipes = useMyDeletedRecipes();
  const pantry = useRecentlyRemovedPantry(kitchen?.id);
  const bothEmpty = recipes.isSuccess && pantry.isSuccess && recipes.data.length === 0 && (pantry.data ?? []).length === 0;
  return (
    <SubPage title={intl.formatMessage({ id: 'trash.title' })}>
      <div className="flex flex-col gap-6">
        {bothEmpty ? (
          <p className="m-0 text-body text-ink-muted"><FormattedMessage id="trash.empty" /></p>
        ) : (
          <>
            <TrashRecipes />
            <TrashPantry />
          </>
        )}
      </div>
    </SubPage>
  );
}
