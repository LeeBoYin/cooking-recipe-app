// 口味探索畫面用的純函式：進度、名片文字、大廚的反應。
import { STOP, type QuizAnswer, type QuizSession, type QuizStep, type TasteCard } from '@zhusha/core';

// 進度條：喜好題占 0–85%，情境題每題 +5%，結束 100%
export function progressPercent(session: QuizSession, step: QuizStep, contextAnswered: number): number {
  if (step.kind === 'done') return 100;
  const answered = session.baseCount + session.asked;
  const max = STOP[session.mode].maxAnswered;
  if (step.phase === 'context') return 85 + Math.min(contextAnswered, 3) * 5;
  return Math.min(85, Math.round((answered / max) * 85));
}

export type ReactionKey = 'remember' | 'teach' | 'next';

// 每答一題，大廚回一句：「想試試」是「這個我可以教你」，其他輪流「記住了」「好，換下一道」
export function reactionFor(answers: readonly QuizAnswer[], step: number): ReactionKey {
  if (answers.some((a) => a.type === 'dish_card' && a.value === 'try')) return 'teach';
  return step % 2 === 0 ? 'remember' : 'next';
}

export type CardName =
  | { kind: 'explorer' }
  | { kind: 'composed'; prefix?: string; suffix?: string }
  | { kind: 'none' };

// 名稱代碼：'taste.spicy|cuisine.taiwan'、'taste.spicy'、'cuisine.taiwan'、'explorer'
export function parseCardTitle(code: string | undefined): CardName {
  if (!code) return { kind: 'none' };
  if (code === 'explorer') return { kind: 'explorer' };
  const parts = code.split('|');
  if (parts.length === 2) return { kind: 'composed', prefix: parts[0], suffix: parts[1] };
  const only = parts[0] ?? '';
  return only.startsWith('cuisine.') ? { kind: 'composed', suffix: only } : { kind: 'composed', prefix: only };
}

// 「偶爾想挑戰○○」：想學裡第一個菜系
export function challengeCuisine(card: Pick<TasteCard, 'goals'>): string | undefined {
  return card.goals.find((g) => g.startsWith('cuisine.'));
}
