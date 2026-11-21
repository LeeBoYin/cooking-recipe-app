import { useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { DEFAULT_CHEF_PERSONA, hourInTimeZone, isChefPersona, pickChefLine, timeBand, todayInTimeZone, type TimeBand } from '@zhusha/core';
import { useCurrentKitchen, useMyIdentity, useMySettings } from '../data/hooks.ts';
import { chefCatalog } from '../i18n/index.ts';

export type ChefLineFn = (situation: string, values?: Record<string, string | number>, extraSeed?: string) => string | null;

// 大廚的情境句子：依使用者選的語氣、時段挑一句；同一天同一情境固定一句（挑選規則在 core 的 chef/pick.ts）。
// 設定還沒讀到時 ready 是 false、line 回傳 null，畫面先不放句子，避免讀到後換一句
export function useChef(): { ready: boolean; band: TimeBand; line: ChefLineFn } {
  const intl = useIntl();
  const settings = useMySettings();
  const identity = useMyIdentity();
  const { kitchen } = useCurrentKitchen();
  const ready = !!settings.data && !!identity.data;
  const persona = isChefPersona(settings.data?.chef_persona) ? settings.data.chef_persona : DEFAULT_CHEF_PERSONA;
  const userId = identity.data?.user_id ?? '';
  const timeZone = kitchen?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { seedKey, band } = useMemo(() => {
    const now = new Date();
    return { seedKey: `${userId}|${todayInTimeZone(now, timeZone)}`, band: timeBand(hourInTimeZone(now, timeZone)) };
  }, [userId, timeZone]);

  const line = useCallback<ChefLineFn>(
    (situation, values, extraSeed) => {
      if (!ready) return null;
      const id = pickChefLine(chefCatalog, { situation, persona, seedKey: extraSeed ? `${seedKey}|${extraSeed}` : seedKey });
      return id ? intl.formatMessage({ id }, values) : null;
    },
    [ready, persona, seedKey, intl],
  );
  return { ready, band, line };
}
