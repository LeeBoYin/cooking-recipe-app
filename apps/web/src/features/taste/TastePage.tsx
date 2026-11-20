import { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import {
  buildCard,
  finishSession,
  newId,
  nextStep,
  startSession,
  submitAnswers,
  type QuizAnswer,
  type QuizEnv,
  type QuizMode,
  type QuizSession,
  type TasteCard,
  type TasteProfile,
} from '@zhusha/core';
import { regionChain } from '@zhusha/ingredients';
import { preferenceDimensions, quizItems } from '@zhusha/taste';
import { Chef } from '../../chef/Chef.tsx';
import { useCurrentKitchen, useMyHardLimits, useMyTasteProfile, useSaveTasteProfile } from '../../data/hooks.ts';
import { CardView } from './CardView.tsx';
import { progressPercent, reactionFor, type ReactionKey } from './logic.ts';
import { QuestionView } from './QuestionView.tsx';

// 口味探索（12 ⑤、13 第四、五節）：快速模式約 2 分鐘，做完拿口味名片，可以「再多聊幾題」。
// 按「結束」或「先這樣」時一次寫入；中途關掉不保留。
export function TastePage() {
  const stored = useMyTasteProfile();
  const limits = useMyHardLimits();
  const { kitchen, isPending: kitchenPending } = useCurrentKitchen();
  if (stored.isPending || limits.isPending || kitchenPending) {
    return <p className="m-0 pt-16 text-center text-caption text-ink-muted"><FormattedMessage id="taste.loading" /></p>;
  }
  if (stored.isError || limits.isError || !stored.data) {
    return <p role="alert" className="m-0 pt-16 text-center text-caption text-error"><FormattedMessage id="taste.loadError" /></p>;
  }
  const env: QuizEnv = {
    items: quizItems,
    dimensions: preferenceDimensions,
    regionCodes: regionChain(kitchen?.region ?? 'TW'),
    allergenIds: limits.data.allergenIds,
    restrictionIds: limits.data.restrictionIds,
  };
  return <Explore initial={stored.data.profile} previousContext={stored.data.context} env={env} />;
}

const itemById = new Map(quizItems.map((q) => [q.id, q]));

type Result = { profile: TasteProfile; card: TasteCard };

function Explore({ initial, previousContext, env }: { initial: TasteProfile; previousContext: Parameters<ReturnType<typeof useSaveTasteProfile>['mutate']>[0]['previousContext']; env: QuizEnv }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const save = useSaveTasteProfile();
  const seed = useRef(newId());
  const [session, setSession] = useState<QuizSession>(() => startSession(initial, 'quick', seed.current, env));
  const [contextAnswered, setContextAnswered] = useState(0);
  const [reaction, setReaction] = useState<ReactionKey | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const finished = useRef(false);

  const step = useMemo(() => nextStep(session, env), [session, env]);

  const finish = (from: QuizSession) => {
    if (finished.current) return;
    finished.current = true;
    const { profile } = finishSession(from, new Date().toISOString());
    const card = buildCard(profile, env.dimensions);
    if (from.profile.answeredItemIds.length === initial.answeredItemIds.length && !result) {
      void navigate(-1); // 什麼都沒答，不存
      return;
    }
    setResult({ profile, card });
    save.mutate({ profile, cardTitle: card.titleCode ?? null, previousContext });
  };

  // 題目問完（夠了解、到上限、沒題目可出）就自動結束
  useEffect(() => {
    if (step.kind === 'done' && !result) finish(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  const answer = (answers: QuizAnswer[]) => {
    if (step.kind !== 'items') return;
    if (step.phase === 'context') setContextAnswered((n) => n + 1);
    setReaction(reactionFor(answers, session.step));
    setSession(submitAnswers(session, step, answers, env, new Date().toISOString()));
  };

  const more = () => {
    if (!result) return;
    finished.current = false;
    save.reset();
    setContextAnswered(0);
    setReaction(null);
    setSession(startSession(result.profile, 'deep' satisfies QuizMode, newId(), env));
    setResult(null);
  };

  if (result) {
    return (
      <CardView
        card={result.card}
        saveState={save.isPending ? 'saving' : save.isError ? 'error' : 'saved'}
        onDone={() =>
          save.isError ? save.mutate({ profile: result.profile, cardTitle: result.card.titleCode ?? null, previousContext }) : void navigate('/')
        }
        onMore={more}
      />
    );
  }
  if (step.kind === 'done') return null;

  const pct = progressPercent(session, step, contextAnswered);
  const lineId = reaction ? `taste.react.${reaction}` : `taste.chef.${step.items[0]?.type ?? 'dish_card'}`;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label={intl.formatMessage({ id: 'taste.progress' })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 flex-1 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-bulb transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <button type="button" onClick={() => finish(session)} className="min-h-11 border-0 bg-transparent px-1 font-[inherit] text-caption font-bold text-ink underline">
          <FormattedMessage id="taste.skip" />
        </button>
      </div>
      <div className="flex items-end gap-2" aria-live="polite">
        <Chef size={40} />
        <p className="m-0 rounded-chef rounded-bl bg-bulb-soft px-3 py-2 font-round text-body">
          <FormattedMessage id={lineId} />
        </p>
      </div>
      <QuestionView key={step.items.map((i) => i.id).join(',')} items={step.items.flatMap((i) => itemById.get(i.id) ?? [])} onAnswer={answer} />
    </div>
  );
}
