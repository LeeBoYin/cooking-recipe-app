import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Outlet, useOutletContext } from 'react-router';
import { Icon } from '../shell/Icon.tsx';
import { SegmentNav } from '../shell/SegmentNav.tsx';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type RecipesContext = { query: string };
export const useRecipesQuery = () => useOutletContext<RecipesContext>().query;

// 食譜分頁：搜尋列在左、「我的食譜｜收藏」分段在右，同一行。
// 兩個分頁共用同一個搜尋字，切換分頁時保留（17 我的食譜）
export function RecipesPage() {
  const intl = useIntl();
  const [input, setInput] = useState('');
  const query = useDebounced(input.trim(), 300);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-11 items-stretch gap-2">
        <label className="box-border flex h-full min-w-0 flex-1 items-center gap-2 rounded-card bg-surface pr-1 pl-3 focus-within:outline-2 focus-within:outline-ink">
          <Icon name="search" size={20} className="shrink-0 text-ink-muted" />
          <span className="sr-only"><FormattedMessage id="recipes.search.label" /></span>
          <input
            type="text"
            enterKeyHint="search"
            value={input}
            placeholder={intl.formatMessage({ id: 'recipes.search.placeholder' })}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
          />
          {input && (
            <button
              type="button"
              aria-label={intl.formatMessage({ id: 'recipes.search.clear' })}
              onClick={() => setInput('')}
              className="flex size-9 shrink-0 items-center justify-center border-0 bg-transparent text-ink"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
        <div className="flex h-full shrink-0 [&>nav]:h-full">
          <SegmentNav
            ariaLabel={intl.formatMessage({ id: 'recipes.tabs.aria' })}
            items={[
              { to: '/recipes', end: true, label: <FormattedMessage id="recipes.tab.mine" /> },
              { to: '/recipes/saved', label: <FormattedMessage id="recipes.tab.saved" /> },
            ]}
          />
        </div>
      </div>
      <Outlet context={{ query } satisfies RecipesContext} />
    </div>
  );
}
