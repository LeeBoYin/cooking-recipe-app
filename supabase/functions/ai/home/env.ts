// 把 ai_home_context 的資料組成算首頁點子要用的一切：L1 候選、送給 AI 的食材與廚具、檢查要用的限制。
// 純函式（沒有網路與資料庫），評估集與單元測試直接餵資料。
// 組裝的做法和前端 apps/web/src/features/home/ideas.ts 一致（規則評分的輸入）；改規則時兩邊一起改。
import {
  buildIdeaPool, buildIngredientIndex, difficultyOverall, emptyProfile, hourInTimeZone, isChefPersona, isTasteEnough, DEFAULT_CHEF_PERSONA,
  timeBand, todayInTimeZone, violatesLimits, IDEA_TOP_POOL,
  type ChefPersona, type DimensionState, type Idea, type IdeaIngredient, type IdeaInput, type IdeaLimits, type IdeaOwnRecipe, type IdeaPool,
  type IngredientIndex, type TasteProfile, type TimeBand,
} from '../../../../packages/core/src/index.ts';
import { canDo, doableTechniques, equipmentTypes, getEquipmentType, onboardingModeFor, techniques, type OwnedEquipment } from '../../../../packages/equipment/src/index.ts';
import {
  allergenWithAncestors, allergens, dietaryRestrictions, ingredients as ingredientDict, type DietaryRestriction,
} from '../../../../packages/ingredients/src/index.ts';
import { baseDishes, preferenceDimensions } from '../../../../packages/taste/src/index.ts';
import type { HomeContextRow } from './types.ts';

export const dimensionKeys: ReadonlySet<string> = new Set(preferenceDimensions.filter((d) => !d.deprecated).map((d) => d.key));

export const ideaIngredients: ReadonlyMap<string, IdeaIngredient> = new Map(
  ingredientDict.map((i) => [
    i.id,
    {
      id: i.id,
      category: i.category,
      traits: i.traits,
      allergenIds: [...new Set((i.allergenIds ?? []).flatMap((a) => allergenWithAncestors(a)))],
      seasonMonths: i.seasonMonths,
      flavorTags: i.flavorTags,
    },
  ]),
);
export const ingredientIndex: IngredientIndex = buildIngredientIndex(ingredientDict);
const ingredientById = new Map(ingredientDict.map((i) => [i.id, i]));
export const ingredientName = (id: string): string => ingredientById.get(id)?.name['zh-TW'] ?? id;

export function limitsFrom(d: HomeContextRow['dietary'], restrictions: readonly DietaryRestriction[] = dietaryRestrictions): IdeaLimits {
  const chosen = restrictions.filter((r) => d?.restriction_ids.includes(r.id));
  return {
    allergenIds: d?.allergen_ids ?? [],
    excludedTraits: [...new Set(chosen.flatMap((r) => r.excludesTraits))],
    excludedIngredientIds: [...new Set(chosen.flatMap((r) => r.excludesIngredientIds ?? []))],
    dislikeIngredientIds: d?.dislike_ingredient_ids ?? [],
    noCookingAlcohol: d?.no_cooking_alcohol ?? false,
  };
}

export function profileFrom(taste: HomeContextRow['taste']): { profile: TasteProfile; occasional: boolean } {
  if (!taste) return { profile: emptyProfile(), occasional: false };
  const dims: Record<string, DimensionState> = {};
  for (const [key, v] of Object.entries(taste.dims)) dims[key] = { affinity: v.affinity, confidence: v.confidence, source: v.source, updatedAt: v.updated_at };
  const c = taste.context as {
    time_preference?: 'quick' | 'normal' | 'relaxed';
    cooks_for?: ('self' | 'partner' | 'family' | 'guests')[];
    adventure?: number;
    goals?: string[];
    festive_dishes?: boolean;
    cooking_frequency?: string;
  };
  return {
    profile: {
      dims,
      context: { timePreference: c.time_preference, cooksFor: c.cooks_for, adventure: c.adventure ?? 0.2, goals: c.goals ?? [], festiveDishes: c.festive_dishes ?? false },
      answeredItemIds: [],
    },
    occasional: c.cooking_frequency === 'occasional',
  };
}

function ownRecipeFrom(r: HomeContextRow['recipes'][number]): IdeaOwnRecipe | null {
  if (!r.title) return null;
  const rows = (Array.isArray(r.ingredients) ? r.ingredients : []) as { declared_allergen_ids?: string[]; declared_traits?: string[] }[];
  const dates = [...r.cooked_dates].sort();
  return {
    id: r.id,
    title: r.title,
    ingredientIds: r.ingredient_ids,
    declaredAllergenIds: [...new Set(rows.flatMap((x) => x.declared_allergen_ids ?? []))],
    declaredTraits: [...new Set(rows.flatMap((x) => x.declared_traits ?? []))],
    highlights: r.highlights,
    lastCookedAt: dates.at(-1) ?? r.cooked_at ?? r.published_at,
    difficulty: r.difficulty ? (r.difficulty.overall ?? difficultyOverall(r.difficulty)) : undefined,
  };
}

export interface Candidate {
  ref: string; // c1…c15：送給 AI 的短代號
  idea: Idea;
}

export interface HomeEnv {
  ctx: HomeContextRow;
  now: Date;
  today: string;
  month: number;
  band: TimeBand;
  persona: ChefPersona;
  occasional: boolean;
  profile: TasteProfile;
  limits: IdeaLimits;
  input: IdeaInput;
  pool: IdeaPool;
  candidates: Candidate[];
  hasOwnRecipes: boolean;
  // 新手門檻（12）：口味不夠把握、又沒有自己的食譜，不叫 AI
  notEnough: boolean;
  // 送出去的食材：沒過期的；想先用掉的與 3 天內到期的標出來
  pantry: { id: string; name: string; soon: boolean; expiring: boolean; seasoning: boolean }[];
  pantryIds: Set<string>;
  priorityIds: Set<string>;
  // 廚具：沒記任何廚具時 owned 是 null（不檢查）
  owned: OwnedEquipment[] | null;
  techniqueEnum: string[];
  equipmentEnum: string[];
  // 程式檢查用：碰到就拿掉的字詞（過敏原、飲食限制、不用料理酒、不吃的食物）
  hardIds: string[];
  hardTerms: string[];
  dislikeTerms: string[];
}

const SEASONING_CATEGORIES = new Set(['seasoning', 'sauce', 'spice', 'oil']);
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
// 時間與溫度要明確：舒肥等需要時間溫度的做法（time-temp）M1a 不送這個選項
const BANNED_TECHNIQUE_GROUPS = new Set(['time-temp']);
export const bannedTechniqueIds: ReadonlySet<string> = new Set(techniques.filter((t) => BANNED_TECHNIQUE_GROUPS.has(t.group)).map((t) => t.id));

// 字典沒收的泛稱：碰到某種限制時，菜名與其他材料裡的這些字也不行（例：雞肉菇菇煲、蒜香）
const TRAIT_WORDS: Record<string, string[]> = {
  animal: ['肉', '豬', '牛', '羊', '雞', '鴨', '鵝', '魚', '蝦', '蟹', '蛤', '貝', '蠔', '花枝', '海鮮', '蛋', '奶', '起司', '乳酪', '蜂蜜', '高湯', '豬油', '骨'],
  meat: ['肉', '豬', '牛', '羊', '雞', '鴨', '鵝', '培根', '火腿', '香腸', '骨'],
  pork: ['豬', '培根', '火腿', '香腸', '五花', '里肌', '肋排', '滷肉'],
  beef: ['牛'],
  lamb: ['羊'],
  poultry: ['雞', '鴨', '鵝', '火雞'],
  seafood: ['魚', '蝦', '蟹', '蛤', '貝', '蠔', '花枝', '章魚', '海鮮', '干貝'],
  shellfish: ['蝦', '蟹', '蛤', '貝', '蠔', '干貝'],
  egg: ['蛋'],
  dairy: ['奶', '起司', '乳酪', '優格', '乳'],
  honey: ['蜂蜜'],
  alcohol: ['酒', '味醂', '味淋'],
  allium: ['蔥', '蒜', '韭', '洋蔥', '紅蔥'],
};

export function termsOf(id: string, minAlias = 2): string[] {
  const i = ingredientById.get(id);
  if (!i) return [];
  const names = Object.values(i.name);
  const aliases = Object.values(i.aliases).flat().filter((a) => [...a].length >= minAlias);
  return [...names, ...aliases];
}

export function buildHomeEnv(ctx: HomeContextRow, now: Date): HomeEnv {
  const { profile, occasional } = profileFrom(ctx.taste);
  const limits = limitsFrom(ctx.dietary);
  const today = todayInTimeZone(now, ctx.kitchen.timezone);
  const owned: OwnedEquipment[] | null =
    ctx.equipment.length === 0 ? null : ctx.equipment.map((e) => ({ equipmentTypeId: e.equipment_type_id, enabledOptionalTechniques: e.enabled_optional_techniques }));

  const input: IdeaInput = {
    profile,
    limits,
    pantry: ctx.pantry.map((p) => ({ ingredientId: p.ingredient_id, wantToUseSoon: p.want_to_use_soon, expiresOn: p.expires_at })),
    canDoTechnique: (t) => (owned === null ? null : canDo(t, owned)),
    ingredients: ideaIngredients,
    baseDishes: baseDishes.filter((d) => !d.deprecated).map((d) => ({
      id: d.id,
      name: d.name['zh-TW'],
      regions: d.regions,
      cuisineKeys: d.cuisineKeys,
      ingredientIds: d.ingredientIds,
      techniques: d.techniques,
      difficulty: difficultyOverall({
        ingredients: d.difficulty.ingredients, equipment: d.difficulty.equipment, time: d.difficulty.time,
        technique: d.difficulty.technique, failure_risk: d.difficulty.failureRisk,
      }),
    })),
    ownRecipes: ctx.recipes.flatMap((r) => ownRecipeFrom(r) ?? []),
    context: { region: ctx.kitchen.region, month: Number(today.slice(5, 7)), today, now: now.toISOString() },
  };
  const pool = buildIdeaPool(input, dimensionKeys);
  const candidates = pool.ideas.slice(0, IDEA_TOP_POOL).map((idea, i) => ({ ref: `c${i + 1}`, idea }));
  const hasOwnRecipes = input.ownRecipes.length > 0;

  // 食材：已過有效日期的不送（03 硬性排除），也不提醒它過期
  const todayN = day(today);
  const priorityIds = new Set<string>();
  const pantry: HomeEnv['pantry'] = [];
  const seen = new Set<string>();
  for (const p of ctx.pantry) {
    if (!ingredientById.has(p.ingredient_id) || seen.has(p.ingredient_id)) continue;
    const left = p.expires_at ? day(p.expires_at) - todayN : null;
    if (left !== null && left < 0) continue;
    // 排除清單裡的食材（過敏、飲食限制、不吃、料理酒）不給 AI 看，免得被拿去用
    if (violatesLimits([p.ingredient_id], {}, limits, ideaIngredients)) continue;
    seen.add(p.ingredient_id);
    const expiring = left !== null && left <= 3;
    if (p.want_to_use_soon || expiring) priorityIds.add(p.ingredient_id);
    pantry.push({
      id: p.ingredient_id,
      name: ingredientName(p.ingredient_id),
      soon: p.want_to_use_soon,
      expiring,
      seasoning: SEASONING_CATEGORIES.has(ideaIngredients.get(p.ingredient_id)?.category ?? ''),
    });
  }
  // 沒過期的才算「有」；同一種食材如果有一份過期、一份沒過期，沒過期的那份會留下
  const pantryIds = new Set(pantry.map((p) => p.id));

  // 廚具與手法的限定代碼：記了廚具就只有做得到的；沒記就用字典的基本選項（不含需要時間溫度的）
  const doable = owned === null ? techniques.map((t) => t.id) : doableTechniques(owned);
  const techniqueEnum = doable.filter((t) => !bannedTechniqueIds.has(t));
  const equipmentEnum =
    owned === null
      ? equipmentTypes.filter((e) => !e.deprecated && onboardingModeFor(e, ctx.kitchen.region) === 'default-on').map((e) => e.id)
      : [...new Set(owned.flatMap((o) => (o.equipmentTypeId && getEquipmentType(o.equipmentTypeId) ? [o.equipmentTypeId] : [])))];

  // 檢查用的字詞：碰到過敏原、飲食限制、不用料理酒的食材，名稱與別名都算；不吃的食物只比兩個字以上的別名
  const noDislike: IdeaLimits = { ...limits, dislikeIngredientIds: [] };
  const hard = new Set<string>();
  const hardIds: string[] = [];
  const dislike = new Set<string>();
  for (const i of ingredientDict) {
    if (violatesLimits([i.id], {}, noDislike, ideaIngredients)) {
      hardIds.push(i.id);
      for (const t of termsOf(i.id, 1)) hard.add(t);
    }
    else if (limits.dislikeIngredientIds.includes(i.id)) for (const t of termsOf(i.id)) dislike.add(t);
  }
  // 過敏原本身的名稱（「蝦」「花生」）也掃：食材字典沒收的說法（蝦醬、花生粉）靠它抓到
  for (const a of allergens) {
    if (!limits.allergenIds.some((chosen) => allergenWithAncestors(a.id).includes(chosen))) continue;
    for (const t of Object.values(a.name)) hard.add(t.replace(/（.*）/, ''));
    for (const t of Object.values(a.aliases).flat()) hard.add(t);
  }

  for (const trait of limits.excludedTraits) for (const t of TRAIT_WORDS[trait] ?? []) hard.add(t);
  // 不用料理酒：字典沒收的說法（料理酒、紹興）也掃
  if (limits.noCookingAlcohol) for (const t of ['料理酒', '紹興', '黃酒', '米酒', '味醂', '味淋', '清酒', '白酒', '紅酒', '啤酒']) hard.add(t);

  return {
    ctx, now, today,
    month: input.context.month,
    band: timeBand(hourInTimeZone(now, ctx.kitchen.timezone)),
    persona: isChefPersona(ctx.settings.chef_persona) ? ctx.settings.chef_persona : DEFAULT_CHEF_PERSONA,
    occasional, profile, limits, input, pool, candidates, hasOwnRecipes,
    notEnough: !isTasteEnough(profile) && !hasOwnRecipes,
    pantry, pantryIds, priorityIds,
    owned, techniqueEnum, equipmentEnum,
    hardIds,
    hardTerms: [...hard].filter((t) => t.length > 0),
    dislikeTerms: [...dislike],
  };
}
