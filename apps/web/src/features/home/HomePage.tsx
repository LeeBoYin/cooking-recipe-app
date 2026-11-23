import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseTemperaturePref } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import { useCurrentKitchen, useMySettings } from '../../data/hooks.ts';
import { AiCallError, fetchEgg, fetchHomeIdeas, getLastHomeIdeas } from '../../data/ai.ts';
import { renderMarks, viewOfAiIdea, type IdeaView } from './ideaView.ts';
import { IdeaCard } from './IdeaCard.tsx';
import { IdeaCarousel } from './IdeaCarousel.tsx';
import { IdeaSkeletons } from './IdeaSkeletons.tsx';
import { IdeaSheet } from './IdeaSheet.tsx';
import { useResumableChat } from '../chat/useChat.ts';
import { trackIdea, trackIdeaShown, type IdeaSource } from './trackIdea.ts';

// 登入後的首頁：大廚區塊＋大廚的點子。先顯示上次的點子，再問後端（後端決定用快取或重新想，見 03〈第二階段〉）。
// AI 不能用時不退回別的挑法：有上次的點子就繼續顯示並說想不出新的，沒有就只說現在想不出來；朋友的動態之後再做
export function HomePage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const { kitchen, isPending: kitchenPending, error: kitchenError } = useCurrentKitchen();
  const [open, setOpen] = useState<{ view: IdeaView; source: IdeaSource } | null>(null);
  const settings = useMySettings();
  const queryClient = useQueryClient();
  const chef = useChef();

  const aiKey = ['home-ideas', 'ai', kitchen?.id ?? ''] as const;
  const last = useQuery({ queryKey: ['home-ideas', 'last'], queryFn: getLastHomeIdeas, enabled: !!kitchen, staleTime: Infinity, retry: false });
  const ai = useQuery({
    queryKey: aiKey,
    queryFn: () => fetchHomeIdeas(),
    enabled: !!kitchen,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const shuffleAi = useMutation({
    mutationFn: () => fetchHomeIdeas(true),
    onSuccess: (result) => {
      if (result.status === 'ok') queryClient.setQueryData(aiKey, result);
    },
  });

  const aiOk = ai.data?.status === 'ok' ? ai.data : null;

  // 靈感彩蛋：首頁點子載好（後端回了 ok）之後才另外問，不拖慢首頁；AI 不能用或這一輪沒有就什麼都不顯示
  const egg = useQuery({
    queryKey: ['home-egg', kitchen?.id ?? ''],
    queryFn: fetchEgg,
    enabled: !!kitchen && !!aiOk,
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // 新手門檻：口味不夠把握、又沒有自己的食譜，後端不叫 AI（12）
  const notEnough = ai.data?.status === 'not_enough';
  const aiShown = notEnough ? null : (aiOk ?? last.data ?? null);
  const aiPending = !!kitchen && ai.isPending && !last.data;
  const tempPref = parseTemperaturePref(settings.data?.temperature_unit);
  const views: IdeaView[] = useMemo(
    () => (aiShown ? aiShown.ideas.map((i) => viewOfAiIdea(i, tempPref, aiShown.suggestionId)) : []),
    [aiShown, tempPref],
  );

  useEffect(() => {
    for (const view of views) trackIdeaShown(view, 'home');
  }, [views]);

  const eggView: IdeaView | null = useMemo(
    () => (egg.data?.status === 'ok' ? viewOfAiIdea(egg.data.idea, tempPref, egg.data.suggestionId) : null),
    [egg.data, tempPref],
  );
  useEffect(() => {
    if (eggView) trackIdeaShown(eggView, 'egg');
  }, [eggView]);

  // AI 現在不能用：問後端失敗、後端說這一輪不給新的，或「換一組」失敗。原因只分「太快」「今天用多了」和其他
  const shuffleDown = shuffleAi.isError || shuffleAi.data?.status === 'unavailable';
  const down = ai.isError || ai.data?.status === 'unavailable' || shuffleDown;
  const downError = [ai.error, shuffleAi.error].find((e) => e instanceof AiCallError);
  const downSituation =
    downError?.code === 'rate_limited' ? 'ideasSlowDown'
      : downError?.code === 'over_limit' ? 'ideasDailyLimit'
        : views.length > 0 ? 'ideasStale' : 'ideasUnavailable';
  const downLine = down ? chef.line(downSituation) : null;
  const hasNext = !down && !shuffleAi.isPending && !!aiOk;
  const homeLine = aiOk?.chefComment ?? chef.line(`home.${chef.band}`);

  // 接著聊：6 小時內、同一個廚房的上一段對話，顯示大廚的上一句話
  const resumable = useResumableChat(kitchen?.id);
  const lastChef = resumable ? [...resumable.messages].reverse().find((m) => m.role === 'chef') : undefined;
  const resumeLine = lastChef ? renderMarks(lastChef.ask?.question ?? lastChef.text, tempPref) : null;

  return (
    <div className="pt-7">
      <section className="relative flex flex-col gap-2.5 rounded-chef border-2 border-bulb bg-chef-soft px-4 pt-12 pb-4">
        <Chef size={56} className="absolute -top-[30px] left-3" />
        <h1 className="absolute top-2 left-[76px] m-0 font-round text-body font-bold">
          <FormattedMessage id="chef.greeting" />
        </h1>
        {/* 招呼語固定；底下一句依時段與大廚的語氣，同一天固定一句 */}
        {homeLine && <p className="m-0 font-round text-[15px] leading-normal">{homeLine}</p>}
        {/* 接著聊：大廚的上一句話（一行，超過用刪節號）加「接著聊 ›」，不放頭像 */}
        {resumable && resumeLine && (
          <button
            type="button"
            onClick={() => void navigate('/chat', { state: { resume: true } })}
            aria-label={intl.formatMessage({ id: 'home.chat.resumeLabel' }, { line: resumeLine })}
            className="flex h-11 items-center gap-2 rounded-card border-0 bg-surface px-3 text-left font-[inherit] text-[14px] text-ink"
          >
            <span className="min-w-0 flex-1 truncate">{resumeLine}</span>
            <span className="whitespace-nowrap text-small text-ink-muted">
              <FormattedMessage id="home.chat.resume" /> ›
            </span>
          </button>
        )}
        {/* 輸入框：點了進到全螢幕的對話頁，一律開新的一段 */}
        <label className="flex h-11">
          <span className="sr-only">
            <FormattedMessage id="home.chatLabel" />
          </span>
          <input
            type="text"
            readOnly
            onFocus={(e) => {
              e.currentTarget.blur();
              void navigate('/chat');
            }}
            placeholder={intl.formatMessage({ id: resumable ? 'home.chatPlaceholderResume' : 'home.chatPlaceholder' })}
            className="h-11 flex-1 cursor-pointer rounded-card border-0 bg-bg px-3 font-[inherit] text-body text-ink placeholder:text-ink-muted"
          />
        </label>
      </section>

      <div className="mt-2">
        <h2 className="sr-only">
          <FormattedMessage id="home.ideasHeading" />
        </h2>
        {kitchenError || (!kitchenPending && !kitchen) ? (
          <p className="m-0 text-caption text-ink-muted">
            <FormattedMessage id="home.loadError" />
          </p>
        ) : !kitchen || (aiPending && views.length === 0) || shuffleAi.isPending ? (
          <IdeaSkeletons />
        ) : views.length === 0 ? (
          <div className="flex flex-col gap-2.5 rounded-card bg-chef-soft p-3.5">
            <Chef size={40} mood="quiet" />
            <p className="m-0 font-round text-[15px] leading-relaxed">{chef.line(notEnough ? 'ideasNotEnough' : downSituation)}</p>
            {notEnough && (
              <button
                type="button"
                onClick={() => void navigate('/taste')}
                className="h-11 self-start rounded-card border-2 border-ink bg-surface px-4 font-[inherit] text-[15px] font-bold text-ink"
              >
                <FormattedMessage id="home.ideas.continueTaste" />
              </button>
            )}
          </div>
        ) : (
          <>
            {downLine && <p className="m-0 mb-1.5 font-round text-caption text-ink-muted">{downLine}</p>}
            <IdeaCarousel count={views.length + (hasNext ? 1 : 0)} resetKey={views.map((v) => v.key).join('|')}>
              {views.map((view, i) => (
                <IdeaCard key={view.key} index={i} view={view} source="home" onOpen={() => { trackIdea('suggestion.opened', view, 'home'); setOpen({ view, source: 'home' }); }} />
              ))}
              {hasNext && (
                <li data-index={views.length} className="w-full flex-none snap-center snap-always">
                  <button
                    type="button"
                    onClick={() => shuffleAi.mutate()}
                    className="flex h-full min-h-[117px] w-full flex-col items-center justify-center gap-1 rounded-card border-0 bg-chef-soft font-[inherit] text-body font-bold text-ink"
                  >
                    <Chef size={40} />
                    <FormattedMessage id="home.ideas.shuffle" />
                  </button>
                </li>
              )}
            </IdeaCarousel>
          </>
        )}
        {/* 靈感彩蛋：偶爾才有，不放次數、不催促；點開和大廚的點子一樣 */}
        {eggView && views.length > 0 && !down && (
          <section aria-labelledby="home-egg-label" className="mt-3">
            <h2 id="home-egg-label" className="m-0 mb-1.5 font-round text-caption text-ink-muted">
              <FormattedMessage id="home.egg.label" />
            </h2>
            <ul className="m-0 flex list-none p-0">
              <IdeaCard view={eggView} source="egg" onOpen={() => { trackIdea('suggestion.opened', eggView, 'egg'); setOpen({ view: eggView, source: 'egg' }); }} />
            </ul>
          </section>
        )}
      </div>

      {open && <IdeaSheet view={open.view} source={open.source} onClose={() => setOpen(null)} />}
    </div>
  );
}
