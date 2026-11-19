import { toCelsius, difficultyOverall } from '../packages/core/src/index.ts';
console.log(`deno: 350°F = ${toCelsius({ value: 350, unit: 'F' })}°C；難易度 ${difficultyOverall([2, 1, 2, 2, 1])}`);
