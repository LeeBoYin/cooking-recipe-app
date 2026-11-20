import { useCallback, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useMySettings, useUpdateSettings } from '../../data/hooks.ts';
import { DietaryEditor } from '../me/DietaryEditor.tsx';
import { Chef } from '../../chef/Chef.tsx';
import { TastePage } from '../taste/TastePage.tsx';
import { InstallStep } from './InstallStep.tsx';
import { barPosition, isLastStep, nextStepId, type StepId } from './steps.ts';
import { VisionStep } from './VisionStep.tsx';

function ProgressBar({ now, total }: { now: number; total: number }) {
  const intl = useIntl();
  return (
    <div
      role="progressbar"
      aria-label={intl.formatMessage({ id: 'onboarding.progress' })}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={now}
      className="flex gap-1"
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1 flex-1 rounded-sm ${i < now ? 'bg-bulb' : 'bg-line'}`} />
      ))}
    </div>
  );
}

// 新手引導（12 第三節）。登入後 onboarding_completed_at 是空的就進來；做完的步驟記在 onboarding_completed_steps，
// 再進來時跳過。走完最後一步才填 onboarding_completed_at。redo：「我的」頁重新跑一次，每步都走、已填的資料帶入，不改完成狀態。
export function Onboarding({ redo = false }: { redo?: boolean }) {
  const settings = useMySettings();
  if (settings.isPending) return null;
  if (settings.isError || !settings.data) {
    return <p role="alert" className="m-0 px-5 pt-16 text-center text-caption text-error"><FormattedMessage id="onboarding.loadError" /></p>;
  }
  return <Steps completed={settings.data.onboarding_completed_steps} redo={redo} />;
}

function Steps({ completed, redo }: { completed: string[]; redo: boolean }) {
  const navigate = useNavigate();
  const update = useUpdateSettings();
  const [current, setCurrent] = useState<StepId | null>(() => nextStepId(null, completed, redo));
  const [done, setDone] = useState<string[]>(completed);

  // mark：記成已完成（自動跳過的步驟不記）。重跑時不動設定
  const advance = useCallback(
    (id: StepId, mark: boolean) => {
      const steps = mark && !done.includes(id) ? [...done, id] : done;
      const next = nextStepId(id, steps, redo);
      if (!redo) {
        const patch = {
          ...(steps !== done ? { onboarding_completed_steps: steps } : {}),
          ...(next === null && isLastStep(id) ? { onboarding_completed_at: new Date().toISOString() } : {}),
        };
        if (Object.keys(patch).length > 0) update.mutate(patch);
      }
      setDone(steps);
      if (next) setCurrent(next);
      else void navigate(redo ? '/me' : '/', { replace: true });
    },
    [done, redo, update, navigate],
  );

  if (current === null) return null;
  const bar = barPosition(current);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-4 px-5 pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      {bar && <ProgressBar now={bar[0]} total={bar[1]} />}
      {current === 'vision' && <VisionStep onDone={() => advance('vision', true)} onSkip={() => advance('vision', true)} />}
      {current === 'install' && <InstallStep onDone={() => advance('install', true)} onAutoSkip={() => advance('install', false)} />}
      {current === 'diet' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <Chef size={40} />
            <h1 className="m-0 font-round text-heading leading-[1.4]"><FormattedMessage id="diet.heading" /></h1>
          </div>
          <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="diet.intro" /></p>
          <DietaryEditor onDone={() => advance('diet', true)} />
        </div>
      )}
      {current === 'taste' && <TastePage onFinish={() => advance('taste', true)} doneId="onboarding.taste.continue" />}
    </div>
  );
}
