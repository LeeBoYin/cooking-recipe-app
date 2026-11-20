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
export { buildCard, EXPLORER_CODE, LIGHT_CODE, type TasteCard } from './taste/card.ts';
