import { FormattedMessage } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';

// 收藏：朋友的食譜與大廚的點子（M2 才有），目前只有空狀態
export function SavedTab() {
  return (
    <div className="flex flex-col items-center gap-3.5 px-8 pt-20 text-center">
      <Chef size={96} />
      <p className="m-0 font-round text-card-title"><FormattedMessage id="recipes.saved.empty.title" /></p>
      <p className="m-0 text-[15px] leading-[1.7] text-ink-muted"><FormattedMessage id="recipes.saved.empty.body" /></p>
    </div>
  );
}
