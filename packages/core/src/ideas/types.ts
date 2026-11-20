// 首頁點子的規則評分（03〈M0：沒有 AI 時的首頁點子〉）。純函式，輸入由呼叫端用字典與資料庫的資料組好，
// core 不依賴字典套件，M1a 的 Edge Function 沿用同一份。
import type { TasteProfile } from './../taste/types.ts';

// 食材字典裡評分用得到的欄位。allergenIds 要先展開上層（選了「甲殼類」的人，標了「蝦」的食材也要排除）
export interface IdeaIngredient {
  id: string;
  category: string;
  traits: string[];
  allergenIds: string[];
  seasonMonths?: Partial<Record<string, number[]>> | undefined;
  recentDays?: number | undefined;
  flavorTags?: string[] | undefined;
}

// 硬限制，已經從字典解開：飲食原則排除的特性與食材
export interface IdeaLimits {
  allergenIds: string[];
  excludedTraits: string[];
  excludedIngredientIds: string[];
  dislikeIngredientIds: string[];
  noCookingAlcohol: boolean;
}

export interface IdeaPantryItem {
  ingredientId: string;
  wantToUseSoon: boolean;
  expiresOn?: string | null; // YYYY-MM-DD，廚房時區
  addedOn?: string | null; // YYYY-MM-DD
}

export interface IdeaBaseDish {
  id: string;
  name: string; // 已經挑好語言的名稱
  regions: string[];
  cuisineKeys: string[];
  ingredientIds: string[];
  techniques: string[];
  difficulty?: number | undefined; // 1–10
}

export interface IdeaOwnRecipe {
  id: string;
  title: string;
  ingredientIds: string[]; // 主要食材要靠它判斷，已對應到字典的
  declaredAllergenIds: string[];
  declaredTraits: string[];
  highlights: string[];
  lastCookedAt: string | null; // ISO 時間
  difficulty?: number | undefined; // 1–10
}

export interface IdeaContext {
  region: string;
  month: number; // 廚房時區的月份 1–12
  today: string; // YYYY-MM-DD，廚房時區
  now: string; // ISO 時間，算「多久沒做」
}

export interface IdeaInput {
  profile: TasteProfile;
  limits: IdeaLimits;
  pantry: IdeaPantryItem[];
  canDoTechnique: (technique: string) => boolean | null; // null：廚房沒記任何廚具，不檢查
  ingredients: ReadonlyMap<string, IdeaIngredient>;
  baseDishes: IdeaBaseDish[];
  ownRecipes: IdeaOwnRecipe[];
  context: IdeaContext;
}

// 理由模板代碼；文字放語系檔
export type IdeaReason =
  | { code: 'taste'; dimensionKey: string }
  | { code: 'pantry_priority'; ingredientId: string }
  | { code: 'in_season'; ingredientId: string }
  | { code: 'have_ingredients' }
  | { code: 'tag_family_favorite' }
  | { code: 'tag_make_again' }
  | { code: 'long_time' }
  | { code: 'fits_you' };

export interface Idea {
  key: string; // own:<recipeId> 或 dish:<dishId>
  source: 'own' | 'dish';
  id: string;
  title: string;
  score: number;
  reason: IdeaReason;
  mainIngredientIds: string[];
  haveIngredientIds: string[]; // 主要食材裡廚房有的（抽屜標「廚房有」）
  allInKitchen: boolean; // 主要食材都在廚房裡
  difficulty?: number | undefined; // 1–10，主要食材不是都在廚房時卡片上放這個
}

export interface IdeaPool {
  tasteEnough: boolean;
  ideas: Idea[]; // 分數 ≥ 門檻，由高到低
}
