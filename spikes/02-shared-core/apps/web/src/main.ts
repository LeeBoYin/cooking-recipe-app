import { toCelsius, difficultyOverall } from '@zhusha/core';
document.getElementById('out')!.textContent =
  `350°F = ${toCelsius({ value: 350, unit: 'F' })}°C；難易度 ${difficultyOverall([2, 1, 2, 2, 1])}`;
