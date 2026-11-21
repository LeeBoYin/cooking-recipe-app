import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emptyProfile, parseTemperaturePref, todayInTimeZone } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { useChef } from '../../chef/useChef.ts';
import {
  useCurrentKitchen, useKitchenEquipment, useMyBookmarks, useMyDietary, useMyIdentity, useMyRecipes, useMySettings, useMyTasteProfile, usePantryItems,
} from '../../data/hooks.ts';
import { ideaOf } from '../../data/bookmarks.ts';
import { AiCallError, fetchHomeIdeas, getLastHomeIdeas } from '../../data/ai.ts';
import { buildPool, hasNextIdeaSet, ideaSet } from './ideas.ts';
import { viewOfAiIdea, viewOfRuleIdea, type IdeaView } from './ideaView.ts';
import { IdeaCard } from './IdeaCard.tsx';
import { IdeaSheet } from './IdeaSheet.tsx';

// 「換一組」換到第幾組：只記在這次開啟的 App（模組變數），不存資料庫；日期換了就從第一組開始
const rounds = new Map<string, number>();
// AI 換太多次（同一個 6 小時內最多 2 次）或失敗後，這一天改用規則評分的候選
const rulesOnly = new Set<string>();

// 登入後的首頁：大廚區塊＋大廚的點子。先顯示上次的點子，再問後端（後端決定用快取或重新想，見 03〈第二階段〉）；
// AI 不能用、被擋下或檢查後一個都不剩時，退回 M0 的規則評分。朋友的動態之後再做
export function HomePage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const { kitchen, isPending: kitchenPending, error: kitchenError } = useCurrentKitchen();
  const identity = useMyIdentity();
  const taste = useMyTasteProfile();
  const dietary = useMyDietary();
  const pantry = usePantryItems(kitchen?.id);
  const equipment = useKitchenEquipment(kitchen?.id);
  const recipes = useMyRecipes('published');
  const bookmarks = useMyBookmarks();
  const [, rerender] = useState(0);
  const [open, setOpen] = useState<IdeaView | null>(null);
  const settings = useMySettings();
  const queryClient = useQueryClient();
  const chef = useChef();

  const ready = !!(kitchen && identity.data && taste.data !== undefined && dietary.data && pantry.data && equipment.data && recipes.data);
  const failed = kitchenError || identity.error || taste.error || dietary.error || pantry.error || equipment.error || recipes.error;
  const profile = taste.data?.profile ?? emptyProfile();

  // 同一個畫面的資料沒變，點子就不重算
  const computed = useMemo(() => {
    if (!ready || !kitchen || !identity.data || !dietary.data || !pantry.data || !equipment.data || !recipes.data) return null;
    const now = new Date();
    const pool = buildPool({
      profile,
      dietary: dietary.data,
      pantry: pantry.data,
      equipment: equipment.data.map((e) => ({ equipmentTypeId: e.equipment_type_id, enabledOptionalTechniques: e.enabled_optional_techniques })),
      recipes: recipes.data,
      region: kitchen.region,
      timezone: kitchen.timezone,
      now,
    });
    return { pool, seedKey: `${identity.data.user_id}|${todayInTimeZone(now, kitchen.timezone)}` };
  }, [ready, kitchen, identity.data, dietary.data, pantry.data, equipment.data, recipes.data, profile]);

  const round = computed ? (rounds.get(computed.seedKey) ?? 0) : 0;
  const ruleIdeas = computed ? ideaSet(computed.pool, computed.seedKey, round) : [];
  const ruleHasNext = computed ? hasNextIdeaSet(computed.pool, computed.seedKey, round) : false;

  // 新手門檻（12）：口味不夠把握、又沒有自己的食譜，不叫 AI，顯示鼓勵文字
  const aiEligible = !!computed && (computed.pool.tasteEnough || (recipes.data?.length ?? 0) > 0);
  const aiKey = ['home-ideas', 'ai', kitchen?.id ?? ''] as const;
  const last = useQuery({ queryKey: ['home-ideas', 'last'], queryFn: getLastHomeIdeas, enabled: aiEligible, staleTime: Infinity, retry: false });
  const ai = useQuery({
    queryKey: aiKey,
    queryFn: () => fetchHomeIdeas(),
    enabled: aiEligible,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const shuffleAi = useMutation({
    mutationFn: () => fetchHomeIdeas(true),
    onSuccess: (result) => {
      if (result.status === 'ok') queryClient.setQueryData(aiKey, result);
      else switchToRules();
    },
    onError: () => switchToRules(),
  });
  function switchToRules() {
    if (!computed) return;
    rulesOnly.add(computed.seedKey);
    rerender((n) => n + 1);
  }

  const aiOk = ai.data?.status === 'ok' ? ai.data : null;
  const useRules = !aiEligible || (!!computed && rulesOnly.has(computed.seedKey)) || ai.isError || (!!ai.data && ai.data.status !== 'ok');
  const aiPending = aiEligible && !useRules && !aiOk;
  const aiShown = useRules ? null : (aiOk ?? last.data ?? null);
  const tempPref = parseTemperaturePref(settings.data?.temperature_unit);
  const views: IdeaView[] = useMemo(
    () => (aiShown ? aiShown.ideas.map((i) => viewOfAiIdea(i, tempPref)) : ruleIdeas.map((i) => viewOfRuleIdea(i, profile, intl, chef.line))),
    // chef.line 與 intl 變了（語氣、語言）也要重算
    [aiShown, ruleIdeas, tempPref, profile, intl, chef.line],
  );
  const hasNext = useRules ? ruleHasNext : !shuffleAi.isPending && !!aiOk;
  // 被速率或合理使用上限擋下時，大廚說一句（其他原因不特別說）
  const limitError = [ai.error, shuffleAi.error].find((e) => e instanceof AiCallError && e.fallback !== 'use_rules');
  const limitLine = limitError instanceof AiCallError ? chef.line(limitError.fallback === 'slow_down' ? 'ideasSlowDown' : 'ideasDailyLimit') : null;
  const homeLine = aiOk?.chefComment ?? chef.line(`home.${chef.band}`);

  // 收藏過的家常菜（同一道每人只有一筆）
  const bookmarkOf = new Map((bookmarks.data ?? []).map((b) => [ideaOf(b).baseDishId, b]));

  function shuffle() {
    if (!computed) return;
    if (!useRules) {
      shuffleAi.mutate();
      return;
    }
    rounds.set(computed.seedKey, round + 1);
    rerender((n) => n + 1);
  }

  return (
    <div className="pt-7">
      <section className="relative flex flex-col gap-2.5 rounded-chef border-2 border-bulb bg-chef-soft px-4 pt-12 pb-4">
        <Chef size={56} className="absolute -top-[30px] left-3" />
        <h1 className="absolute top-2 left-[76px] m-0 font-round text-body font-bold">
          <FormattedMessage id="chef.greeting" />
        </h1>
        {/* 招呼語固定；底下一句依時段與大廚的語氣，同一天固定一句 */}
        {homeLine && <p className="m-0 font-round text-[15px] leading-normal">{homeLine}</p>}
        {/* 輸入框先放著不能打字（和大廚聊聊是 M1a-07） */}
        <label className="flex h-11">
          <span className="sr-only">
            <FormattedMessage id="home.chatLabel" />
          </span>
          <input
            type="text"
            readOnly
            aria-disabled="true"
            tabIndex={-1}
            placeholder={intl.formatMessage({ id: 'home.chatPlaceholder' })}
            className="h-11 flex-1 cursor-default rounded-card border-0 bg-bg px-3 font-[inherit] text-body text-ink placeholder:text-ink-muted"
          />
        </label>
      </section>

      <div className="mt-2">
        <h2 className="sr-only">
          <FormattedMessage id="home.ideasHeading" />
        </h2>
        {failed || (!kitchenPending && !kitchen) ? (
          <p className="m-0 text-caption text-ink-muted">
            <FormattedMessage id="home.loadError" />
          </p>
        ) : !computed ? (
          <p className="m-0 text-caption text-ink-muted">
            <FormattedMessage id="common.loading" />
          </p>
        ) : aiPending && views.length === 0 ? (
          <p role="status" className="m-0 font-round text-caption text-ink-muted">
            <FormattedMessage id="home.ideas.thinking" />
          </p>
        ) : views.length === 0 ? (
          <div className="flex flex-col gap-2.5 rounded-card bg-chef-soft p-3.5">
            <Chef size={40} mood="quiet" />
            <p className="m-0 font-round text-[15px] leading-relaxed">
              {chef.line(computed.pool.tasteEnough ? 'ideasNone' : 'ideasNotEnough')}
            </p>
            {!computed.pool.tasteEnough && (
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
            {limitLine && <p className="m-0 mb-1.5 font-round text-caption text-ink-muted">{limitLine}</p>}
            <ul className="-mx-4 my-0 flex snap-x snap-mandatory scroll-px-4 list-none gap-2 overflow-x-auto px-4 pb-0 [scrollbar-width:none]">
              {views.map((view) => (
                <IdeaCard key={view.key} view={view} bookmarked={!!view.baseDishId && bookmarkOf.has(view.baseDishId)} onOpen={() => setOpen(view)} />
              ))}
            </ul>
            {hasNext && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={shuffle}
                  disabled={shuffleAi.isPending}
                  className="inline-flex h-10 items-center gap-1 border-0 bg-transparent font-[inherit] text-caption text-ink-muted"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" />
                  </svg>
                  <FormattedMessage id="home.ideas.shuffle" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {open && <IdeaSheet view={open} bookmark={open.baseDishId ? bookmarkOf.get(open.baseDishId) : undefined} onClose={() => setOpen(null)} />}
    </div>
  );
}
