import { FormattedMessage } from 'react-intl';
import { mainIngredientTags, type IdeaView } from './ideaView.ts';

// 點子卡片的標籤列（首頁、對話、收藏共用）：主要食材最多 3 個加「+N」；沒有食材時放難易度
export function IdeaTags({ view, tone = 'surface' }: { view: Pick<IdeaView, 'ingredients' | 'difficulty'>; tone?: 'surface' | 'bg' }) {
  const { names, extra } = mainIngredientTags(view);
  if (names.length > 0) {
    return (
      <span className="mt-0.5 flex flex-wrap gap-1">
        {names.map((name) => (
          <span key={name} className="whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green">
            {name}
          </span>
        ))}
        {extra > 0 && (
          <span className="whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green">
            <FormattedMessage id="home.ideas.tagMore" values={{ count: extra }} />
          </span>
        )}
      </span>
    );
  }
  if (!view.difficulty) return null;
  return (
    <span className={`mt-0.5 whitespace-nowrap rounded-tag px-2 py-0.5 text-small text-ink-muted ${tone === 'bg' ? 'bg-bg' : 'bg-surface'}`}>
      <FormattedMessage id="home.ideas.difficulty" values={{ value: view.difficulty }} />
    </span>
  );
}
