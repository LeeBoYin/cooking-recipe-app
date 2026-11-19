// 驗證 Edge Function 能不能匯入 supabase/functions 資料夾以外的共用套件
import { toCelsius, difficultyOverall } from '../../../packages/core/src/index.ts';

Deno.serve(() =>
  Response.json({ celsius: toCelsius({ value: 350, unit: 'F' }), difficulty: difficultyOverall([2, 1, 2, 2, 1]) }),
);
