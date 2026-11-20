// 門檻與權重（08〈需要實測後再調整的數值〉）
export const IDEA_MIN_SCORE = 0.5;
export const IDEA_MAX_OWN = 2;
export const IDEA_MAX_DISH = 3;
export const IDEA_MAX_TOTAL = 5;
export const IDEA_TOP_POOL = 15; // 從分數最高的幾個裡抽
export const TASTE_CONFIDENT = 0.5; // 把握程度夠的門檻
export const TASTE_MIN_DIMENSIONS = 3; // 夠把握的喜好維度至少幾個才給基礎菜色
export const NEUTRAL = 0.5; // 沒有資料時的中間值

export const DISH_WEIGHTS = { taste: 0.45, coverage: 0.3, priority: 0.15, season: 0.1 } as const;
export const OWN_WEIGHTS = { tag: 0.5, longAgo: 0.3, coverage: 0.2 } as const;

export const OWN_UNTAGGED = 0.3; // 沒標「值得再做」「家人最愛」的食譜，標籤項的值
export const LONG_AGO_FROM_DAYS = 30; // 30 天內是 0
export const LONG_AGO_TO_DAYS = 180; // 180 天以上是 1
export const EXPIRY_SOON_DAYS = 3; // 幾天內到期算「手邊優先」
export const DEFAULT_RECENT_DAYS = 7; // 食材字典沒寫時，剛買幾天內算「最近買的」

// 食材覆蓋率只看「主要食材」：調味、醬料、香料、油不算
export const SEASONING_CATEGORIES: readonly string[] = ['seasoning', 'sauce', 'spice', 'oil'];
