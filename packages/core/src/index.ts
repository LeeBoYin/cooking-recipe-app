// 純 TypeScript 的領域邏輯，前端與 Edge Functions 共用。
// 只用標準的 JavaScript 與 TypeScript；相對匯入一律寫 .ts 副檔名（Deno 需要）。
export { newId } from './id.ts';
export { DIFFICULTY_FACETS, difficultyOverall, type DifficultyFacet, type DifficultyValues } from './difficulty.ts';
export * from './taste/types.ts';
export { createRng, hashSeed } from './taste/rng.ts';
export { applyAnswer, answerStrengths, mainCuisineKey } from './taste/scoring.ts';
export {
  RHYTHM, STOP, QUICK_FIRE_GROUP_SIZE, startSession, nextStep, submitAnswers, finishSession, itemValue, coreConfidence, preferenceAnsweredCount,
  type QuizEnv, type QuizMode, type QuizSession, type QuizStep,
} from './taste/session.ts';
export {
  computeTasteProfile, toSnapshotData, fromSnapshotData, SAVED_WEIGHT, COOKED_WEIGHT, CHAT_SIGNAL_WEIGHT, PANTRY_WEIGHT, HALF_LIFE_DAYS, SNAPSHOT_MAX_AGE_DAYS,
  type SavedIdeaSignal, type RecordedRecipeSignal, type ChatSignal, type TasteInputs, type TasteSources, type ComputedTaste, type TasteSnapshotData,
} from './taste/learn.ts';
export { buildCard, EXPLORER_CODE, LIGHT_CODE, type TasteCard } from './taste/card.ts';
export * from './ideas/types.ts';
export * from './ideas/constants.ts';
export * from './ideas/ai-types.ts';
export * from './dictation.ts';
export * from './refine.ts';
export { draftIngredientText, draftStepText } from './ideas/draft.ts';
export {
  buildIdeaPool, confidentLikeCount, isTasteEnough, violatesLimits, mainIngredientIds, tasteSimilarity, dishDimensionKeys,
  longAgoValue, scoreBaseDish, scoreOwnRecipe,
} from './ideas/score.ts';
export { todayInTimeZone } from './ideas/pick.ts';
export {
  CHEF_PERSONAS, DEFAULT_CHEF_PERSONA, isChefPersona, timeBand, hourInTimeZone, buildChefCatalog, pickChefLine,
  type ChefPersona, type TimeBand, type ChefCatalog, type ChefLineInput,
} from './chef/pick.ts';
export { FORBIDDEN_WORDING, forbiddenWordingHits, type ForbiddenWording } from './chef/wording.ts';
export {
  parseMeasurePref, parseTemperaturePref, UNIT_CODES, isMeasureUnit, scaleToSystem, fractionText, roundedText, formatQuantity, convertTemperature, formatTemperature,
  type UnitCode, type UnitSystem, type MeasurePref, type TemperaturePref, type Temperature, type UnitLabels, type Measured, type QuantityInput,
} from './units/units.ts';
export {
  parseIngredient, renderIngredient, ingredientName, haveInKitchen, type QuantityToken, type IngredientSegment, type StoredQuantity,
} from './units/ingredient-text.ts';
export {
  buildIngredientIndex, isPlainSafeIngredient, matchIngredient, matchIngredientExact, parseIngredientLine, parseIngredientLineNamed, type DictIngredient, type IngredientIndex, type ParsedIngredient,
} from './units/ingredient-line.ts';
export { formatRecipeText, type RecipeTextInput, type RecipeTextLabels } from './share/recipe-text.ts';
export * from './track/events.ts';
