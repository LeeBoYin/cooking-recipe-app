// 口味名片：從口味地圖挑出最突出的幾項（13 第五節）。只回傳代碼，文字由畫面從語系檔與字典組出。
import type { TasteDimension, TasteProfile } from './types.ts';

export const CARD_MIN_CONFIDENCE = 0.5; // 把握程度不到這裡的項目不顯示
export const CARD_MIN_AFFINITY = 0.3; // 「愛」至少要有這麼喜歡
export const CARD_DISLIKE_AFFINITY = -0.5; // 很不喜歡才列進「不吃」
export const EXPLORER_ADVENTURE = 0.6; // 挑戰意願達到這裡，而且喜好分散，名稱用探險家
export const EXPLORER_CODE = 'explorer';
export const LIGHT_CODE = 'richness.light'; // 「清爽」：richness.rich 的喜好為負時，名稱前綴用這個代碼

const LOVE_GROUPS = ['seasoning', 'form', 'spice_type', 'protein'] as const;
const MAX_LOVES = 4;
const MAX_TEXTURES = 2;

export interface TasteCard {
  titleCode?: string; // 例 'taste.spicy|cuisine.taiwan'、'taste.spicy'、'cuisine.taiwan'、'explorer'；沒有就用大廚的一句話
  loves: string[]; // 愛的維度 key（調味系統、型態、辣的種類、蛋白質）
  textures: string[]; // 口感的維度 key
  goals: string[]; // 想學：維度 key
  avoids: string[]; // 很不喜歡的食材維度 key（顯示成「不吃」；硬限制另外從飲食限制讀）
}

function solid(profile: TasteProfile, key: string) {
  const d = profile.dims[key];
  return d && d.confidence >= CARD_MIN_CONFIDENCE ? d : undefined;
}

// 依「喜好 × 把握」由高到低挑，同分取 key 字母序小的
function top(profile: TasteProfile, keys: string[], pick: (affinity: number) => boolean, limit: number): string[] {
  return keys
    .flatMap((key) => {
      const d = solid(profile, key);
      return d && pick(d.affinity) ? [{ key, score: Math.abs(d.affinity) * d.confidence }] : [];
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((x) => x.key);
}

export function buildCard(profile: TasteProfile, dimensions: readonly TasteDimension[]): TasteCard {
  const active = dimensions.filter((d) => !d.deprecated);
  const keysOf = (group: string) => active.filter((d) => d.group === group).map((d) => d.key);
  const likes = (a: number) => a >= CARD_MIN_AFFINITY;

  // 名稱：味道前綴 × 菜系後綴
  const prefixCandidates = [
    ...top(profile, keysOf('taste'), likes, 1),
  ];
  const rich = solid(profile, 'richness.rich');
  let prefix = prefixCandidates[0];
  if (rich && Math.abs(rich.affinity) >= CARD_MIN_AFFINITY) {
    const richScore = Math.abs(rich.affinity) * rich.confidence;
    const tasteKey = prefix;
    const tasteScore = tasteKey ? Math.abs(profile.dims[tasteKey]!.affinity) * profile.dims[tasteKey]!.confidence : 0;
    if (richScore > tasteScore) prefix = rich.affinity > 0 ? 'richness.rich' : LIGHT_CODE;
  }
  const suffix = top(profile, keysOf('cuisine'), likes, 1)[0];

  let titleCode: string | undefined;
  if (prefix && suffix) titleCode = `${prefix}|${suffix}`;
  else if (profile.context.adventure >= EXPLORER_ADVENTURE && !suffix) titleCode = EXPLORER_CODE;
  else titleCode = prefix ?? suffix;

  const titleKeys = new Set((titleCode ?? '').split('|'));
  const loves = top(profile, LOVE_GROUPS.flatMap(keysOf), likes, MAX_LOVES + titleKeys.size).filter((k) => !titleKeys.has(k)).slice(0, MAX_LOVES);
  const textures = top(profile, keysOf('texture'), likes, MAX_TEXTURES);
  const avoids = top(profile, keysOf('ingredient'), (a) => a <= CARD_DISLIKE_AFFINITY, 8);
  return { titleCode, loves, textures, goals: [...profile.context.goals], avoids };
}
