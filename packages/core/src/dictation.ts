// 用說的（M1b-03，03〈用說的：口述整理成食譜〉）：`ai` 函式 dictation 任務的輸入、回傳，
// 以及「保留作者已經填的內容、只補新的」的合併規則。前端（心得還是原話的判斷）與 Edge Functions（合併）共用。
import type { DifficultyValues } from './difficulty.ts';

export const DICTATION_MAX_CHARS = 1000; // 每次口述的字數上限
export const DICTATION_LIMITS = { title: 80, story: 2000, tips: 1000, ingredient: 200, step: 500, ingredients: 60, steps: 10 } as const;
export const DICTATION_HIGHLIGHTS = ['first_time', 'hosted_friends', 'improved', 'family_favorite', 'festive', 'make_again', 'funny_flop'] as const;

// 編輯頁上目前已經填的欄位（空的欄位是空字串或空陣列；食材與步驟各項已去掉空白、略過空的）
export interface DictationCurrent {
  title: string;
  story: string;
  tips: string;
  ingredients: string[];
  steps: string[];
  highlights: string[];
  // 作者動過難易度就是 'author'（AI 不再覆寫）；AI 估的是 'ai'；還沒有是 null
  difficultySource: 'author' | 'ai' | null;
}

export interface DictationInput {
  text: string;
  lang: string; // 口述用的語言（介面語言）
  current: DictationCurrent;
}

// 合併後的一項：from 是它在作者原本清單裡的位置（作者寫的）；null 就是這次口述新加的
export interface DictationItem {
  text: string;
  from: number | null;
}

export interface DictationResult {
  title: string;
  story: string;
  tips: string;
  ingredients: DictationItem[];
  steps: DictationItem[];
  highlights: string[];
  difficulty: DifficultyValues | null; // 作者動過難易度（source 為 author）時是 null
}

export type DictationResponse = { status: 'ok'; result: DictationResult };

const norm = (s: string): string => s.trim();
const cut = (s: string, max: number): string => ([...s].length > max ? [...s].slice(0, max).join('') : s);

// 模型回傳「作者原本的項目＋新補的項目」合併後的清單，程式比對：
// - 作者原本的每一項都要原樣（去掉前後空白）依原本的順序出現，模型改到、刪掉、換順序就整份不採用（回 null）；
// - 其他的就是新的；和作者原本的項目重複的（模型又寫了一次）直接拿掉；
// - 超過上限時從最後面的新項目開始拿掉；單項過長就截短（只會截到新的項目）。
export function mergeKeepingOriginals(original: readonly string[], output: readonly string[], maxItems: number, maxChars: number): DictationItem[] | null {
  const originals = original.map(norm);
  const originalSet = new Set(originals);
  const items: DictationItem[] = [];
  let next = 0;
  for (const raw of output) {
    const text = norm(raw);
    if (text === '') continue;
    if (next < originals.length && text === originals[next]) {
      items.push({ text: original[next] as string, from: next });
      next++;
    } else if (!originalSet.has(text) && !items.some((i) => i.from === null && i.text === cut(text, maxChars))) {
      items.push({ text: cut(text, maxChars), from: null });
    }
  }
  if (next !== originals.length) return null;
  while (items.length > maxItems) {
    const last = items.map((i) => i.from).lastIndexOf(null);
    if (last < 0) break;
    items.splice(last, 1);
  }
  return items;
}

// AI 不能用時，原話放進心得：心得已經有字就接在後面（空一行）
export function storyWithDictation(story: string, dictation: string): string {
  return story.trim() === '' ? dictation : `${story.trimEnd()}\n\n${dictation}`;
}

// 心得裡還留著原話嗎？（之後按「讓大廚整理」再跑一次的條件）。傳回拿掉原話之後的心得（作者自己寫的部分）；
// 心得裡沒有原話就是 null。心得「只有原話」時回傳空字串，當成空的。
export function storyWithoutDictation(story: string, dictation: string): string | null {
  const text = dictation.trim();
  if (text === '') return null;
  const s = story.trim();
  if (s === text) return '';
  if (s.endsWith(`\n\n${text}`)) return s.slice(0, s.length - text.length).trimEnd();
  return null;
}
