// 點子的產品事件（14）：只記來源（首頁、對話、靈感彩蛋）與槽位，不記菜名、理由、食材，也不記點子的 ID。
import { track } from '../../data/track.ts';
import type { IdeaView } from './ideaView.ts';

export type IdeaSource = 'home' | 'chat' | 'egg'; // egg：首頁的靈感彩蛋

type IdeaEvent = 'suggestion.shown' | 'suggestion.opened' | 'suggestion.bookmarked';

export function trackIdea(name: IdeaEvent, view: IdeaView, source: IdeaSource): void {
  if (view.slot) track(name, { source, slot: view.slot });
}

// 同一張卡片這一次打開 App 只算顯示一次（輪播重畫、對話重新載入都不重複記）
const shown = new Set<string>();
export function trackIdeaShown(view: IdeaView, source: IdeaSource): void {
  const key = `${source}:${view.key}`;
  if (shown.has(key)) return;
  shown.add(key);
  trackIdea('suggestion.shown', view, source);
}
