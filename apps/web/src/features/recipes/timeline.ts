// 我的食譜的時間軸（純函式，方便測試）：依記錄日期由新到舊，依月分組，不顯示日期（02 時間軸）。
import type { CookNote, Highlight } from '@zhusha/shared-types';
import type { RecipePhotoLite } from '../../data/photos.ts';
import type { Recipe } from '../../data/recipes.ts';
import { knownHighlights } from '../recipe/model.ts';

export type TimelineEntry = {
  key: string; // 食譜 ID，或「食譜 ID:又做了一次的 ID」
  recipeId: string;
  kind: 'recipe' | 'cook_note';
  date: string; // YYYY-MM-DD（只用來排序與分月，畫面不顯示）
  title: string | null;
  text: string | null; // 食譜是心得；又做了一次是那一次的一句話
  highlights: Highlight[]; // 最多 2 個
  photoCount: number;
  thumbPath?: string; // 縮圖：食譜是封面，又做了一次是那次的第一張
};

export type MonthGroup<T extends { date: string } = TimelineEntry> = {
  key: string; year: number; month: number; showYear: boolean; entries: T[];
};

// 某個時間點在指定時區的日期（YYYY-MM-DD）
export function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function buildTimeline(recipes: Recipe[], photos: RecipePhotoLite[], timeZone: string): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const r of recipes) {
    // 上方的照片：沒有 cook_note_id 的，依順序，第一張是封面
    const own = photos.filter((p) => p.owner_id === r.id && !p.cook_note_id).sort((a, b) => a.sort_order - b.sort_order);
    entries.push({
      key: r.id,
      recipeId: r.id,
      kind: 'recipe',
      // 記錄日期：料理時間；沒有（沒有照片的拍攝時間）就用發佈的日子
      date: r.cooked_on ?? localDate(r.published_at ?? r.created_at, timeZone),
      title: r.title?.trim() || null,
      text: r.story?.trim() || null,
      highlights: knownHighlights(r.highlights).slice(0, 2),
      photoCount: own.length,
      thumbPath: own[0]?.thumb_path,
    });
    for (const n of r.cook_notes as CookNote[]) {
      const notePhotos = photos.filter((p) => p.owner_id === r.id && p.cook_note_id === n.id).sort((a, b) => a.sort_order - b.sort_order);
      entries.push({
        key: `${r.id}:${n.id}`,
        recipeId: r.id,
        kind: 'cook_note',
        date: n.cooked_on,
        title: r.title?.trim() || null,
        text: n.text?.trim() || null,
        highlights: [],
        photoCount: notePhotos.length,
        thumbPath: notePhotos[0]?.thumb_path,
      });
    }
  }
  return entries.sort((a, b) => (a.date === b.date ? (a.key < b.key ? 1 : -1) : a.date < b.date ? 1 : -1));
}

// 依月分組（輸入要已經排好）。today 是今天的日期（YYYY-MM-DD），不是今年的月標題才要寫年
export function groupByMonth<T extends { date: string }>(entries: T[], today: string): MonthGroup<T>[] {
  const thisYear = Number(today.slice(0, 4));
  const groups: MonthGroup<T>[] = [];
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (g?.key !== key) {
      const year = Number(key.slice(0, 4));
      g = { key, year, month: Number(key.slice(5, 7)), showYear: year !== thisYear, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

// 還剩幾天可以復原（至少 0）
export function daysLeft(deletedAt: string, retentionDays: number, now: Date = new Date()): number {
  const end = new Date(deletedAt).getTime() + retentionDays * 86_400_000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}
