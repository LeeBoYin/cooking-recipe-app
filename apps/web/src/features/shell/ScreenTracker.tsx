import { useEffect } from 'react';
import { useLocation } from 'react-router';
import type { TrackScreen } from '@zhusha/core';
import { startTracking, trackScreen } from '../../data/track.ts';

// 路徑 → 固定的畫面代碼（14 的 `screen`）。只用路徑的形狀，不帶 ID 或任何內容；沒列到的算 other
const SCREENS: [RegExp, TrackScreen][] = [
  [/^\/$/, 'home'],
  [/^\/chat$/, 'chat'],
  [/^\/recipes$/, 'recipes'],
  [/^\/recipes\/saved$/, 'recipes_saved'],
  [/^\/recipes\/drafts$/, 'recipes_drafts'],
  [/^\/recipes\/saved\/[^/]+$/, 'saved_idea'],
  [/^\/(record|recipes\/new)$/, 'record'],
  [/^\/recipes\/import$/, 'record_import'],
  [/^\/recipes\/[^/]+\/edit$/, 'recipe_edit'],
  [/^\/recipes\/[^/]+$/, 'recipe'],
  [/^\/kitchen$/, 'kitchen'],
  [/^\/kitchen\/equipment$/, 'kitchen_equipment'],
  [/^\/kitchen\/settings$/, 'kitchen_settings'],
  [/^\/kitchen\/pantry\/add$/, 'pantry_add'],
  [/^\/kitchen\/pantry\/inventory$/, 'pantry_inventory'],
  [/^\/kitchen\/pantry\/[^/]+$/, 'pantry_edit'],
  [/^\/kitchen\/equipment\/add$/, 'equipment_add'],
  [/^\/kitchen\/equipment\/inventory$/, 'equipment_inventory'],
  [/^\/kitchen\/equipment\/[^/]+$/, 'equipment_edit'],
  [/^\/me$/, 'me'],
  [/^\/me\/taste$/, 'me_taste'],
  [/^\/me\/diet$/, 'me_diet'],
  [/^\/me\/trash$/, 'me_trash'],
  [/^\/taste$/, 'taste'],
  [/^\/onboarding$/, 'onboarding'],
];

export function screenOf(pathname: string): TrackScreen {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return SCREENS.find(([re]) => re.test(path))?.[1] ?? 'other';
}

// 登入後放在路由旁：開始記錄事件，換頁時記 screen.view。後台（/admin）不記
export function ScreenTracker() {
  const { pathname } = useLocation();

  useEffect(() => startTracking(), []);
  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    trackScreen(screenOf(pathname));
  }, [pathname]);

  return null;
}
