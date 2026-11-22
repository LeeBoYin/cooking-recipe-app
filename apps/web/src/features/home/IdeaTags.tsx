import { FormattedMessage, useIntl } from 'react-intl';
import type { ChatMention } from '@zhusha/core';
import { mainIngredientTags, mentionUsed, type IdeaView } from './ideaView.ts';

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

// 對話裡的點子卡片：列出使用者提到的每一樣食材，這道有用到的綠色、沒用到的灰色（灰色另外有文字給讀螢幕的人）
export function MentionedTags({ view, mentioned }: { view: Pick<IdeaView, 'ingredients' | 'others' | 'title'>; mentioned: readonly ChatMention[] }) {
  const intl = useIntl();
  if (mentioned.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-col gap-1">
      <span className="text-small text-ink-muted">
        <FormattedMessage id="chat.mentioned" />
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {mentioned.map((m) => {
          const used = mentionUsed(view, m);
          return (
            <li key={m.text} className={`whitespace-nowrap rounded-tag px-2 py-0.5 text-small ${used ? 'bg-green-soft font-bold text-green' : 'bg-bg text-ink-muted'}`}>
              {m.text}
              <span className="sr-only">{intl.formatMessage({ id: used ? 'chat.mentioned.used' : 'chat.mentioned.unused' })}</span>
            </li>
          );
        })}
      </ul>
    </span>
  );
}
