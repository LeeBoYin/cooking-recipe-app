import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { Chef } from '../../chef/Chef.tsx';
import type { IdeaView } from './ideaView.ts';

// 點子抽屜（首頁與對話共用）：菜名、理由、食材（你說的、廚房有）、其他材料與替代說明，最下面「就聊這道」。
// 抽屜裡沒有收藏（收藏在卡片右上角）；自己的食譜多一顆「打開食譜」。做法是 M1a-09。
export function IdeaSheet({ view, onClose, onChat, chatDisabled }: {
  view: IdeaView;
  onClose: () => void;
  onChat: (view: IdeaView) => void;
  chatDisabled?: boolean;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const reason = view.why;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/45" onClick={onClose}>
      <div
        role="dialog"
        aria-label={view.title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-3.5 overflow-y-auto rounded-t-2xl bg-bg px-5 pt-2.5 pb-[calc(28px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="h-[5px] w-10 flex-none self-center rounded-sm bg-line-strong" />
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap rounded-tag bg-bulb-soft px-2 py-0.5 text-small font-bold">
            <FormattedMessage id={view.source === 'own' ? 'idea.sheet.ownBadge' : 'idea.sheet.badge'} />
          </span>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: 'idea.sheet.close' })}
            onClick={onClose}
            className="ml-auto h-11 w-11 border-0 bg-transparent text-[20px] text-ink-muted"
          >
            ×
          </button>
        </div>
        <b className="-mt-2 text-[24px]">{view.title}</b>
        <div className="flex items-center gap-2.5 rounded-card bg-chef-soft px-3 py-2.5">
          <Chef size={40} mood="idea" />
          <span className="font-round text-[15px] leading-normal" >
            {/[。！？」」…]$/.test(reason) ? reason : `${reason}。`}
          </span>
        </div>
        {view.ingredients.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="m-0 text-caption font-normal text-ink-muted">
              <FormattedMessage id="idea.sheet.ingredients" />
            </h2>
            <ul className="m-0 list-none p-0">
              {view.ingredients.map((ing) => (
                <li key={ing.name} className="flex min-h-10 items-center justify-between border-b border-line-soft text-body">
                  {ing.name}
                  {ing.said && (
                    <span className="whitespace-nowrap rounded-tag bg-bulb-soft px-2 py-0.5 text-small font-bold">
                      <FormattedMessage id="idea.sheet.said" />
                    </span>
                  )}
                  {ing.have && (
                    <span className="whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green">
                      <FormattedMessage id="idea.sheet.kitchenHas" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {view.others.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="m-0 text-caption font-normal text-ink-muted">
              <FormattedMessage id="idea.sheet.others" />
            </h2>
            <p className="m-0 text-body">{view.others.join('、')}</p>
          </section>
        )}
        {view.substitutions.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-caption text-ink-muted">
            {view.substitutions.map((s) => (
              <li key={s.need}>
                <FormattedMessage id="idea.sheet.substitute" values={{ need: s.need, use: s.use }} />
              </li>
            ))}
          </ul>
        )}
        {view.source === 'own' && view.recipeId && (
          <button
            type="button"
            onClick={() => void navigate(`/recipes/${view.recipeId}`)}
            className="h-11 rounded-card border-2 border-ink bg-surface font-[inherit] text-body font-bold text-ink"
          >
            <FormattedMessage id="idea.sheet.openRecipe" />
          </button>
        )}
        <button
          type="button"
          disabled={chatDisabled}
          onClick={() => onChat(view)}
          className="h-12 rounded-card border-2 border-ink bg-bulb font-[inherit] text-body font-bold text-ink disabled:border-line disabled:bg-line disabled:text-ink-muted"
        >
          <FormattedMessage id="idea.sheet.chat" />
        </button>
      </div>
    </div>
  );
}
