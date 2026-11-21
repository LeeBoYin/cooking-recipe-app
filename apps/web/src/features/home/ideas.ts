// 首頁點子：把資料庫與字典的資料組成 core 評分要的輸入，再算出點子。評分本身在 core（純函式）。
import {
  buildIdeaPool, difficultyOverall, ideaSet, hasNextIdeaSet, todayInTimeZone,
  type Idea, type IdeaIngredient, type IdeaInput, type IdeaLimits, type IdeaOwnRecipe, type IdeaPool, type TasteProfile,
} from '@zhusha/core';
import { canDo, type OwnedEquipment } from '@zhusha/equipment';
import {
  allergenWithAncestors, dietaryRestrictions, ingredients as ingredientDict, type DietaryRestriction,
} from '@zhusha/ingredients';
import { baseDishes, preferenceDimensions } from '@zhusha/taste';
import type { RecipeDifficulty, RecipeIngredient } from '@zhusha/shared-types';
import type { Dietary } from '../../data/dietary.ts';
import type { PantryItem } from '../../data/pantry.ts';
import type { Recipe } from '../../data/recipes.ts';

export const dimensionKeySet: ReadonlySet<string> = new Set(preferenceDimensions.filter((d) => !d.deprecated).map((d) => d.key));

// 字典轉成評分用的格式；過敏原連上層一起展開
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

// 選了「甲殼類」的人，標了「蝦」的食材也要排除：過敏原連上層一起比對時，兩邊都展開
export function limitsFrom(dietary: Dietary, restrictions: readonly DietaryRestriction[] = dietaryRestrictions): IdeaLimits {
  const chosen = restrictions.filter((r) => dietary.restrictionIds.includes(r.id));
  return {
    allergenIds: dietary.allergenIds,
    excludedTraits: [...new Set(chosen.flatMap((r) => r.excludesTraits))],
    excludedIngredientIds: [...new Set(chosen.flatMap((r) => r.excludesIngredientIds ?? []))],
    dislikeIngredientIds: dietary.dislikeIngredientIds,
    noCookingAlcohol: dietary.noCookingAlcohol,
  };
}

// 食譜最後一次做的時間：又做了一次的日期優先，沒有就用料理時間，再沒有用發佈時間
function lastCooked(recipe: Recipe): string | null {
  const dates = [...recipe.cooked_dates].sort();
  return dates.at(-1) ?? recipe.cooked_at ?? recipe.published_at;
}

export function ownRecipeFrom(recipe: Recipe): IdeaOwnRecipe | null {
  if (!recipe.title || recipe.status !== 'published' || recipe.deleted_at) return null;
  const rows = recipe.ingredients as unknown as RecipeIngredient[];
  const difficulty = recipe.difficulty as unknown as RecipeDifficulty | null;
  return {
    id: recipe.id,
    title: recipe.title,
    ingredientIds: recipe.ingredient_ids,
    declaredAllergenIds: [...new Set(rows.flatMap((r) => r.declared_allergen_ids ?? []))],
    declaredTraits: [...new Set(rows.flatMap((r) => r.declared_traits ?? []))],
    highlights: recipe.highlights,
    lastCookedAt: lastCooked(recipe),
    difficulty: difficulty ? (difficulty.overall ?? difficultyOverall(difficulty)) : undefined,
  };
}

export type IdeaSources = {
  profile: TasteProfile;
  dietary: Dietary;
  pantry: PantryItem[];
  equipment: OwnedEquipment[];
  recipes: Recipe[];
  region: string;
  timezone: string;
  now: Date;
};

export function buildInput(s: IdeaSources): IdeaInput {
  const today = todayInTimeZone(s.now, s.timezone);
  return {
    profile: s.profile,
    limits: limitsFrom(s.dietary),
    pantry: s.pantry
      .filter((p) => p.ingredient_id)
      .map((p) => ({
        ingredientId: p.ingredient_id as string,
        wantToUseSoon: p.want_to_use_soon,
        expiresOn: p.expires_at,
      })),
    // 廚房沒記任何廚具時不檢查（空的清單不當成「什麼都做不到」）
    canDoTechnique: (t) => (s.equipment.length === 0 ? null : canDo(t, s.equipment)),
    ingredients: ideaIngredients,
    baseDishes: baseDishes
      .filter((d) => !d.deprecated)
      .map((d) => ({
        id: d.id,
        name: d.name['zh-TW'],
        regions: d.regions,
        cuisineKeys: d.cuisineKeys,
        ingredientIds: d.ingredientIds,
        techniques: d.techniques,
        difficulty: difficultyOverall({
          ingredients: d.difficulty.ingredients,
          equipment: d.difficulty.equipment,
          time: d.difficulty.time,
          technique: d.difficulty.technique,
          failure_risk: d.difficulty.failureRisk,
        }),
      })),
    ownRecipes: s.recipes.flatMap((r) => ownRecipeFrom(r) ?? []),
    context: {
      region: s.region,
      month: Number(today.slice(5, 7)),
      today,
      now: s.now.toISOString(),
    },
  };
}

export function buildPool(s: IdeaSources): IdeaPool {
  return buildIdeaPool(buildInput(s), dimensionKeySet);
}

export { ideaSet, hasNextIdeaSet };
export type { Idea };
