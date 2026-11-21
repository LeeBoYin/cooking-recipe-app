import {
  DISH_WEIGHTS, EXPIRY_SOON_DAYS, IDEA_MIN_SCORE, LONG_AGO_FROM_DAYS, LONG_AGO_TO_DAYS, NEUTRAL,
  OWN_UNTAGGED, OWN_WEIGHTS, SEASONING_CATEGORIES, TASTE_CONFIDENT, TASTE_MIN_DIMENSIONS,
} from './constants.ts';
import type {
  Idea, IdeaBaseDish, IdeaContext, IdeaIngredient, IdeaInput, IdeaLimits, IdeaOwnRecipe, IdeaPool, IdeaReason,
} from './types.ts';
import type { TasteProfile } from '../taste/types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

// 夠把握的喜好維度（把握程度 ≥ 0.5 且喜歡）數量；夠不夠給基礎菜色看它
export function confidentLikeCount(profile: TasteProfile): number {
  return Object.values(profile.dims).filter((d) => d.confidence >= TASTE_CONFIDENT && d.affinity > 0).length;
}

export function isTasteEnough(profile: TasteProfile): boolean {
  return confidentLikeCount(profile) >= TASTE_MIN_DIMENSIONS;
}

// 過敏原、飲食原則、不吃的食物、不用料理酒：有一項碰到就排除
export function violatesLimits(
  ingredientIds: string[],
  extra: { allergenIds?: string[]; traits?: string[] },
  limits: IdeaLimits,
  ingredients: ReadonlyMap<string, IdeaIngredient>,
): boolean {
  const allergens = new Set(limits.allergenIds);
  const traits = new Set(limits.excludedTraits);
  if (limits.noCookingAlcohol) traits.add('alcohol');
  const excludedIds = new Set([...limits.excludedIngredientIds, ...limits.dislikeIngredientIds]);
  if ((extra.allergenIds ?? []).some((a) => allergens.has(a))) return true;
  if ((extra.traits ?? []).some((t) => traits.has(t))) return true;
  for (const id of ingredientIds) {
    if (excludedIds.has(id)) return true;
    const ing = ingredients.get(id);
    if (!ing) continue;
    if (ing.allergenIds.some((a) => allergens.has(a))) return true;
    if (ing.traits.some((t) => traits.has(t))) return true;
  }
  return false;
}

export function mainIngredientIds(ids: string[], ingredients: ReadonlyMap<string, IdeaIngredient>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ing = ingredients.get(id);
    if (ing && SEASONING_CATEGORIES.includes(ing.category)) continue;
    out.push(id);
  }
  return out;
}

// 食材有沒有：過期的不算（03 硬性排除「已過有效日期的食材」）
function availableIngredientIds(input: IdeaInput): Set<string> {
  const today = dayNumber(input.context.today);
  const out = new Set<string>();
  for (const item of input.pantry) {
    if (item.expiresOn && dayNumber(item.expiresOn) < today) continue;
    out.add(item.ingredientId);
  }
  return out;
}

// 手邊優先：想先用掉、快到期
function priorityIngredientIds(input: IdeaInput): Set<string> {
  const today = dayNumber(input.context.today);
  const out = new Set<string>();
  for (const item of input.pantry) {
    if (item.expiresOn) {
      const left = dayNumber(item.expiresOn) - today;
      if (left < 0) continue;
      if (left <= EXPIRY_SOON_DAYS) out.add(item.ingredientId);
    }
    if (item.wantToUseSoon) out.add(item.ingredientId);
  }
  return out;
}

function coverageOf(main: string[], have: Set<string>, pantryKnown: boolean): number {
  if (!pantryKnown || main.length === 0) return NEUTRAL;
  return main.filter((id) => have.has(id)).length / main.length;
}

// 菜的口味標籤：菜系、主要蛋白質、做法、形式、特定食材，用來對上口味地圖的維度
const PROTEIN_BY_TRAIT: Record<string, string> = {
  pork: 'protein.pork', beef: 'protein.beef', lamb: 'protein.lamb', poultry: 'protein.chicken',
  shellfish: 'protein.shellfish', egg: 'protein.egg',
};
const FORM_BY_TECHNIQUE: Record<string, string> = {
  'stir-fry': 'form.stir_fry', steam: 'form.steamed', braise: 'form.stew_braise', 'soy-braise': 'form.stew_braise',
  'red-braise': 'form.stew_braise', grill: 'form.grill', 'deep-fry': 'form.fried', toss: 'form.cold_dish',
};
const TASTE_BY_FLAVOR: Record<string, string> = {
  spicy: 'taste.spicy', sour: 'taste.sour', sweet: 'taste.sweet', aromatic: 'taste.aromatic', bitter: 'taste.bitter',
};

export function dishDimensionKeys(
  dish: Pick<IdeaBaseDish, 'cuisineKeys' | 'ingredientIds' | 'techniques'>,
  ingredients: ReadonlyMap<string, IdeaIngredient>,
  dimensionKeys: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  const add = (key: string | undefined) => {
    if (key && dimensionKeys.has(key)) out.add(key);
  };
  for (const key of dish.cuisineKeys) {
    // 菜系連上層一起算：cuisine.taiwan.home → cuisine.taiwan
    const parts = key.split('.');
    for (let i = parts.length; i >= 2; i -= 1) add(parts.slice(0, i).join('.'));
  }
  for (const t of dish.techniques) add(FORM_BY_TECHNIQUE[t]);
  for (const id of dish.ingredientIds) {
    add(`ingredient.${id.replaceAll('-', '_')}`);
    const ing = ingredients.get(id);
    if (!ing) continue;
    for (const trait of ing.traits) add(PROTEIN_BY_TRAIT[trait]);
    if (ing.category === 'tofu-bean') add('protein.tofu_soy');
    if (ing.category === 'noodle') add('form.noodles');
    if (id === 'rice') add('form.rice');
    if (ing.category === 'seafood' && !ing.traits.includes('shellfish')) add('protein.fish');
    for (const tag of ing.flavorTags ?? []) add(TASTE_BY_FLAVOR[tag]);
  }
  return [...out];
}

// 口味相似度（0–1）：只看把握程度 ≥ 0.5 的維度；沒有任何維度對得上時是中間值
export function tasteSimilarity(
  keys: string[],
  profile: TasteProfile,
): { value: number; topKey?: string } {
  let sum = 0;
  let n = 0;
  let top: { key: string; weight: number } | undefined;
  for (const key of keys) {
    const d = profile.dims[key];
    if (!d || d.confidence < TASTE_CONFIDENT) continue;
    sum += (d.affinity + 1) / 2;
    n += 1;
    const weight = d.affinity * d.confidence;
    if (d.affinity > 0 && (!top || weight > top.weight)) top = { key, weight };
  }
  return { value: n === 0 ? NEUTRAL : sum / n, topKey: top?.key };
}

function seasonality(main: string[], input: IdeaInput): { value: number; ingredientId?: string } {
  const withData = main.filter((id) => input.ingredients.get(id)?.seasonMonths?.[input.context.region]);
  if (withData.length === 0) return { value: NEUTRAL };
  const inSeason = withData.filter((id) =>
    input.ingredients.get(id)?.seasonMonths?.[input.context.region]?.includes(input.context.month),
  );
  return { value: inSeason.length / withData.length, ingredientId: inSeason[0] };
}

type Contribution = { weight: number; reason: IdeaReason | null };

function strongest(list: Contribution[]): IdeaReason {
  let best: Contribution | undefined;
  for (const c of list) {
    if (!c.reason || c.weight <= 0) continue;
    if (!best || c.weight > best.weight) best = c; // 同分取先列的
  }
  return best?.reason ?? { code: 'fits_you' };
}

export function scoreBaseDish(dish: IdeaBaseDish, input: IdeaInput, have: Set<string>, priority: Set<string>, dimensionKeys: ReadonlySet<string>): Idea {
  const main = mainIngredientIds(dish.ingredientIds, input.ingredients);
  const pantryKnown = input.pantry.length > 0;
  const taste = tasteSimilarity(dishDimensionKeys(dish, input.ingredients, dimensionKeys), input.profile);
  const coverage = coverageOf(main, have, pantryKnown);
  const priorityIds = main.filter((id) => priority.has(id));
  const priorityValue = pantryKnown ? clamp01(priorityIds.length / 2) : 0;
  const season = seasonality(main, input);
  const score =
    DISH_WEIGHTS.taste * taste.value +
    DISH_WEIGHTS.coverage * coverage +
    DISH_WEIGHTS.priority * priorityValue +
    DISH_WEIGHTS.season * season.value;
  // 理由取貢獻最大的一項；「中間值」不算理由
  const reason = strongest([
    { weight: DISH_WEIGHTS.taste * taste.value, reason: taste.topKey ? { code: 'taste', dimensionKey: taste.topKey } : null },
    {
      weight: DISH_WEIGHTS.priority * priorityValue,
      reason: priorityIds[0] ? { code: 'pantry_priority', ingredientId: priorityIds[0] } : null,
    },
    {
      weight: DISH_WEIGHTS.coverage * coverage,
      reason: pantryKnown && coverage >= 0.5 ? { code: 'have_ingredients' } : null,
    },
    {
      weight: DISH_WEIGHTS.season * season.value,
      reason: season.ingredientId ? { code: 'in_season', ingredientId: season.ingredientId } : null,
    },
  ]);
  return {
    key: `dish:${dish.id}`,
    source: 'dish',
    id: dish.id,
    title: dish.name,
    score,
    reason,
    mainIngredientIds: main,
    haveIngredientIds: main.filter((id) => have.has(id)),
    allInKitchen: pantryKnown && main.length > 0 && main.every((id) => have.has(id)),
    difficulty: dish.difficulty,
  };
}

export function longAgoValue(lastCookedAt: string | null, nowIso: string): number {
  if (!lastCookedAt) return NEUTRAL;
  const days = (Date.parse(nowIso) - Date.parse(lastCookedAt)) / DAY_MS;
  if (Number.isNaN(days)) return NEUTRAL;
  return clamp01((days - LONG_AGO_FROM_DAYS) / (LONG_AGO_TO_DAYS - LONG_AGO_FROM_DAYS));
}

export function scoreOwnRecipe(recipe: IdeaOwnRecipe, input: IdeaInput, have: Set<string>): Idea {
  const main = mainIngredientIds(recipe.ingredientIds, input.ingredients);
  const pantryKnown = input.pantry.length > 0;
  const favorite = recipe.highlights.includes('family_favorite');
  const again = recipe.highlights.includes('make_again');
  const tagged = favorite || again;
  const tag = tagged ? 1 : OWN_UNTAGGED;
  const longAgo = longAgoValue(recipe.lastCookedAt, input.context.now);
  const coverage = coverageOf(main, have, pantryKnown);
  const score = OWN_WEIGHTS.tag * tag + OWN_WEIGHTS.longAgo * longAgo + OWN_WEIGHTS.coverage * coverage;
  const reason = strongest([
    {
      weight: OWN_WEIGHTS.tag * tag,
      reason: tagged ? { code: favorite ? 'tag_family_favorite' : 'tag_make_again' } : null,
    },
    { weight: OWN_WEIGHTS.longAgo * longAgo, reason: longAgo >= 0.5 ? { code: 'long_time' } : null },
    {
      weight: OWN_WEIGHTS.coverage * coverage,
      reason: pantryKnown && coverage >= 0.5 ? { code: 'have_ingredients' } : null,
    },
  ]);
  return {
    key: `own:${recipe.id}`,
    source: 'own',
    id: recipe.id,
    title: recipe.title,
    score,
    reason,
    mainIngredientIds: main,
    haveIngredientIds: main.filter((id) => have.has(id)),
    allInKitchen: pantryKnown && main.length > 0 && main.every((id) => have.has(id)),
    difficulty: recipe.difficulty,
  };
}

// 候選 → 先排除 → 算分 → 只留分數 ≥ 門檻，由高到低。口味不夠把握時不給基礎菜色
export function buildIdeaPool(input: IdeaInput, dimensionKeys: ReadonlySet<string>): IdeaPool {
  const tasteEnough = isTasteEnough(input.profile);
  const have = availableIngredientIds(input);
  const priority = priorityIngredientIds(input);
  const ideas: Idea[] = [];

  for (const recipe of input.ownRecipes) {
    if (violatesLimits(recipe.ingredientIds, { allergenIds: recipe.declaredAllergenIds, traits: recipe.declaredTraits }, input.limits, input.ingredients)) continue;
    ideas.push(scoreOwnRecipe(recipe, input, have));
  }

  if (tasteEnough) {
    for (const dish of input.baseDishes) {
      if (dish.regions.length > 0 && !dish.regions.includes(input.context.region)) continue;
      if (violatesLimits(dish.ingredientIds, {}, input.limits, input.ingredients)) continue;
      // 廚房沒記任何廚具時不檢查（和食材一樣，空的清單不當成「什麼都做不到」）
      if (dish.techniques.some((t) => input.canDoTechnique(t) === false)) continue;
      ideas.push(scoreBaseDish(dish, input, have, priority, dimensionKeys));
    }
  }

  return {
    tasteEnough,
    ideas: ideas.filter((i) => i.score >= IDEA_MIN_SCORE).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)),
  };
}

export type { IdeaContext };
