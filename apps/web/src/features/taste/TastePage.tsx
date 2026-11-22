import { track } from '../../data/track.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate, useSearchParams } from 'react-router';
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
import { getAllergen, regionChain } from '@zhusha/ingredients';
import { preferenceDimensions, quizItems } from '@zhusha/taste';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, useMyHardLimits, useMyTasteProfile, useSaveTasteProfile } from '../../data/hooks.ts';
import { CardView } from './CardView.tsx';
import { progressPercent, reactionFor, type ReactionKey } from './logic.ts';
import { QuestionView } from './QuestionView.tsx';

// 口味探索（12 ⑤、13 第四、五節）：快速模式約 2 分鐘，做完拿口味名片，可以「再多聊幾題」。
// 按「結束」或「先這樣」時一次寫入；中途關掉不保留。
export function TastePage({ onFinish, doneId }: { onFinish?: () => void; doneId?: string } = {}) {
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
  return <Explore onFinish={onFinish} doneId={doneId} initial={stored.data.profile} allergenNames={limits.data.allergenIds.map((id) => getAllergen(id)?.name['zh-TW'] ?? id)} previousContext={stored.data.context} env={env} />;
}

const itemById = new Map(quizItems.map((q) => [q.id, q]));

type Result = { profile: TasteProfile; card: TasteCard };

function Explore({ onFinish, doneId, initial: stored, allergenNames, previousContext, env }: { onFinish?: () => void; doneId?: string; initial: TasteProfile; allergenNames: string[]; previousContext: Parameters<ReturnType<typeof useSaveTasteProfile>['mutate']>[0]['previousContext']; env: QuizEnv }) {
  const intl = useIntl();
  const chef = useChef();
  const navigate = useNavigate();
  const save = useSaveTasteProfile();
  // ?mode=deep：再多聊幾題（接續目前的口味地圖）；?mode=redo：重新探索（題目重問一次，自己設定的項目不會被蓋掉）
  const [params] = useSearchParams();
  const mode = params.get('mode');
  const initial = useMemo(() => (mode === 'redo' ? { ...stored, answeredItemIds: [] } : stored), [stored, mode]);
  const seed = useRef(newId());
  const [session, setSession] = useState<QuizSession>(() => startSession(initial, mode === 'deep' ? 'deep' : 'quick', seed.current, env));
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
      if (onFinish) onFinish();
      else void navigate(-1); // 什麼都沒答，不存
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
    const questionType = step.items[0]?.type;
    if (questionType) track('taste.answered', { questionType });
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
        allergens={allergenNames}
        saveState={save.isPending ? 'saving' : save.isError ? 'error' : 'saved'}
        onDone={() =>
          save.isError ? save.mutate({ profile: result.profile, cardTitle: result.card.titleCode ?? null, previousContext }) : onFinish ? onFinish() : void navigate('/')
        }
        onMore={more}
        doneId={doneId}
      />
    );
  }
  if (step.kind === 'done') return null;

  const pct = progressPercent(session, step, contextAnswered);
  const line = chef.line(reaction ? `tasteReact.${reaction}` : `tasteAsk.${step.items[0]?.type ?? 'dish_card'}`);
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
        <Chef size={40} mood={reaction ? 'happy' : 'normal'} />
        <p className="m-0 rounded-chef rounded-bl bg-bulb-soft px-3 py-2 font-round text-body">
          {line}
        </p>
      </div>
      <QuestionView key={step.items.map((i) => i.id).join(',')} items={step.items.flatMap((i) => itemById.get(i.id) ?? [])} onAnswer={answer} />
    </div>
  );
}
