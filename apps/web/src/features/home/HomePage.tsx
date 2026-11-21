import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { emptyProfile, todayInTimeZone, type Idea } from '@zhusha/core';
import { Chef } from '../../chef/Chef.tsx';
import { signOut } from '../../data/auth.ts';
import {
  useCurrentKitchen, useKitchenEquipment, useMyBookmarks, useMyDietary, useMyIdentity, useMyRecipes, useMyTasteProfile, usePantryItems,
} from '../../data/hooks.ts';
import { ideaOf } from '../../data/bookmarks.ts';
import { buildPool, hasNextIdeaSet, ideaSet } from './ideas.ts';
import { IdeaCard } from './IdeaCard.tsx';
import { IdeaSheet } from './IdeaSheet.tsx';

// 「換一組」換到第幾組：只記在這次開啟的 App（模組變數），不存資料庫；日期換了就從第一組開始
const rounds = new Map<string, number>();

// 登入後的首頁：大廚區塊＋大廚的點子（M0 由程式依規則挑，見 03）。朋友的動態之後再做
export function HomePage() {
  const queryClient = useQueryClient();
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
  const [open, setOpen] = useState<Idea | null>(null);

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
  const ideas = computed ? ideaSet(computed.pool, computed.seedKey, round) : [];
  const hasNext = computed ? hasNextIdeaSet(computed.pool, computed.seedKey, round) : false;

  // 收藏過的家常菜（同一道每人只有一筆）
  const bookmarkOf = new Map((bookmarks.data ?? []).map((b) => [ideaOf(b).baseDishId, b]));

  async function onSignOut() {
    await signOut();
    queryClient.clear();
  }

  function shuffle() {
    if (!computed) return;
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
        {/* M0 沒有 AI，輸入框先放著不能打字（M1a 才接上和大廚聊聊） */}
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
        ) : ideas.length === 0 ? (
          <div className="flex flex-col gap-2.5 rounded-card bg-chef-soft p-3.5">
            <p className="m-0 font-round text-[15px] leading-relaxed">
              <FormattedMessage id={computed.pool.tasteEnough ? 'home.ideas.none' : 'home.ideas.notEnough'} />
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
            <ul className="-mx-4 my-0 flex snap-x snap-mandatory scroll-px-4 list-none gap-2 overflow-x-auto px-4 pb-0 [scrollbar-width:none]">
              {ideas.map((idea) => (
                <IdeaCard key={idea.key} idea={idea} profile={profile} bookmarked={idea.source === 'dish' && bookmarkOf.has(idea.id)} onOpen={() => setOpen(idea)} />
              ))}
            </ul>
            {hasNext && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={shuffle}
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

      {open && <IdeaSheet idea={open} profile={profile} bookmark={open.source === 'dish' ? bookmarkOf.get(open.id) : undefined} onClose={() => setOpen(null)} />}

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="mt-6 min-h-11 border-0 bg-transparent px-0 text-caption font-bold text-ink underline underline-offset-4"
      >
        <FormattedMessage id="signOut" />
      </button>
    </div>
  );
}
