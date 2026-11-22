import { useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import type { ExpandInput, RecipeDraft } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { Sheet } from '../../ui/Sheet.tsx';
import { useExpandSteps, useMySettings } from '../../data/hooks.ts';
import { ingredientLines, stepLines, tipsText, unitPrefs } from './draft.ts';
import { ingredientBadges, type IdeaView } from './ideaView.ts';
import { useIdeaBookmark } from './useIdeaBookmark.ts';

// 點子抽屜（首頁與對話共用；收藏的點子是完整頁 SavedIdeaPage，共用下面的 MethodSection）：菜名、理由、食材標籤，接著直接是做法（沒有另外的「看做法」按鈕）。
// 第一次打開要等大廚寫：標籤先顯示，做法區塊放思考中的大廚；寫好、檢查過才一次顯示。寫不出來顯示「大廚需要再想想」。
// 家常菜先顯示骨架（主要食材與手法）。自己的食譜不呼叫 AI，只有「打開食譜」。
// 底部的「收藏／已收藏」和卡片右上角的收藏是同一個狀態（useIdeaBookmark）。
// 外框是共用的 Sheet（可拖曳關閉）。
export function IdeaSheet({ view, onClose }: { view: IdeaView; onClose: () => void }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const reason = view.why;
  const input: ExpandInput | null =
    view.source === 'own' ? null : view.suggestionId ? { suggestionId: view.suggestionId, ideaId: view.key } : null;
  const expand = useExpandSteps(input);
  const draft = expand.data?.draft ?? null;

  const { can, bookmark, toggle, busy, failed } = useIdeaBookmark(view);
  const saved = !!bookmark;

  return (
    <Sheet label={view.title} onClose={onClose}>
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
      {!draft && view.ingredients.length > 0 && (
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
      {!draft && view.others.length > 0 && (
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
      {view.source !== 'own' && (
        <MethodSection
          view={view}
          hasInput={input !== null}
          pending={expand.isPending && input !== null}
          failed={expand.isError}
          retrying={expand.isFetching}
          draft={draft}
          onRetry={() => void expand.refetch()}
        />
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
      {can && (
        <>
          <button
            type="button"
            aria-pressed={saved}
            disabled={busy}
            onClick={toggle}
            className={`h-12 rounded-card border-2 border-ink font-[inherit] text-body font-bold text-ink disabled:opacity-50 ${saved ? 'bg-bulb-soft' : 'bg-surface'}`}
          >
            <FormattedMessage id={saved ? 'home.ideas.bookmarked' : 'idea.sheet.bookmark'} />
          </button>
          {failed && <span role="alert" className="text-small text-error"><FormattedMessage id="idea.card.bookmarkError" /></span>}
        </>
      )}
    </Sheet>
  );
}

// 做法區塊：食材與步驟。三種狀態：思考中（大廚）、寫好了、需要再想想；沒有 AI 可問的家常菜只有骨架
export function MethodSection({ view, hasInput, pending, failed, retrying, draft, onRetry }: {
  view: IdeaView;
  hasInput: boolean;
  pending: boolean;
  failed: boolean;
  retrying: boolean;
  draft: RecipeDraft | null;
  onRetry: () => void;
}) {
  const intl = useIntl();
  const settings = useMySettings();
  const prefs = useMemo(() => unitPrefs(settings.data, intl), [settings.data, intl]);

  if (draft) {
    const lines = ingredientLines(draft, prefs);
    const steps = stepLines(draft, prefs);
    const tips = tipsText(draft, prefs);
    const groups = [...new Set(lines.map((l) => l.group ?? ''))];
    return (
      <section aria-label={intl.formatMessage({ id: 'idea.sheet.method' })} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-caption font-normal text-ink-muted">
            <FormattedMessage id="idea.sheet.method.ingredients" values={{ servings: draft.servings }} />
          </h2>
          {groups.map((g) => (
            <div key={g}>
              {g && <div className="pt-1.5 text-small font-bold text-ink-muted">{g}</div>}
              <ul className="m-0 list-none p-0">
                {lines.filter((l) => (l.group ?? '') === g).map((l) => (
                  <li key={l.id} className="flex min-h-10 items-center justify-between border-b border-line-soft text-body">
                    {l.text}
                    <span className="flex items-center gap-1.5">
                      {l.optional && <span className="text-small text-ink-muted"><FormattedMessage id="idea.sheet.method.optional" /></span>}
                      {(() => {
                        const badge = ingredientBadges(view, l.ingredientId);
                        return (
                          <>
                            {badge.said && (
                              <span className="whitespace-nowrap rounded-tag bg-bulb-soft px-2 py-0.5 text-small font-bold"><FormattedMessage id="idea.sheet.said" /></span>
                            )}
                            {badge.have && (
                              <span className="whitespace-nowrap rounded-tag bg-green-soft px-2 py-0.5 text-small font-bold text-green"><FormattedMessage id="idea.sheet.kitchenHas" /></span>
                            )}
                          </>
                        );
                      })()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-caption font-normal text-ink-muted"><FormattedMessage id="idea.sheet.method.steps" /></h2>
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {steps.map((s, i) => (
              <li key={s.id} className="flex gap-2.5 text-body leading-normal">
                <span aria-hidden="true" className="grid size-6 flex-none place-items-center rounded-full bg-bulb-soft text-small font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  {s.text}
                  {(s.timerMinutes || s.temp) && (
                    <span className="block text-small text-ink-muted">
                      {[s.temp, s.timerMinutes ? intl.formatMessage({ id: 'idea.sheet.method.timer' }, { minutes: s.timerMinutes }) : null].filter(Boolean).join('　')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
        {tips && (
          <div className="rounded-card bg-chef-soft px-3 py-2.5 text-caption leading-normal">
            <b className="mr-1"><FormattedMessage id="idea.sheet.method.tips" /></b>
            {tips.split('\n').map((t) => <span key={t} className="block">{t}</span>)}
          </div>
        )}
      </section>
    );
  }

  // 家常菜的骨架：主要食材（上面的標籤）加手法；步驟等大廚寫完再補上
  const skeleton = view.techniques.length > 0 && (
    <p className="m-0 text-caption text-ink-muted">
      <FormattedMessage id="idea.sheet.techniques" values={{ list: view.techniques.join('、') }} />
    </p>
  );

  if (!hasInput) {
    return (
      <section className="flex flex-col gap-1.5">
        {skeleton}
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="idea.sheet.method.later" /></p>
      </section>
    );
  }
  if (failed && !retrying) {
    return (
      <section className="flex flex-col gap-2.5">
        {skeleton}
        <div role="alert" className="flex items-center gap-2.5 rounded-card bg-chef-soft px-3 py-2.5">
          <Chef size={40} mood="quiet" />
          <span className="font-round text-[15px] leading-normal"><FormattedMessage id="idea.sheet.method.failed" /></span>
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto h-10 flex-none rounded-full border-2 border-ink bg-surface px-3.5 font-[inherit] text-caption font-bold text-ink"
          >
            <FormattedMessage id="idea.sheet.method.retry" />
          </button>
        </div>
      </section>
    );
  }
  return (
    <section aria-busy={pending || retrying} className="flex flex-col gap-2.5">
      {skeleton}
      <div role="status" className="flex items-center gap-2.5 rounded-card border border-dashed border-line-strong px-3 py-3">
        <Chef size={40} mood="thinking" blink />
        <span className="font-round text-[15px] leading-normal text-ink-muted"><FormattedMessage id="idea.sheet.method.thinking" /></span>
      </div>
    </section>
  );
}
