// 舊食譜的食材解析回填（M0-21b）：標準輸入是「還沒解析過的食譜」的 JSON（[{ id, ingredients }]），
// 輸出一段 SQL，逐篇呼叫 backfill_recipe_ingredients。解析器在 TypeScript（中文原文不適合在資料庫裡解析），
// 所以由部署流程（deploy-db.yml）先查出來、經過這支腳本、再執行；可以重複執行：解析結果沒變的食譜不會被改。
// 資料庫會再檢查（不合格的欄位清空），而且原文在中間被作者改過就不回填。
import { readFileSync } from 'node:fs';
import { buildIngredientIndex, parseIngredientLineNamed } from '../packages/core/src/index.ts';
import { ingredients as dictionary } from '../packages/ingredients/src/index.ts';

type Row = { id: string; ingredients: Array<Record<string, unknown> & { raw_text: string }> };

const input = readFileSync(0, 'utf8').trim();
const rows: Row[] = input ? (JSON.parse(input) as Row[]) : [];
const index = buildIngredientIndex(dictionary);
const tag = '$backfill$';

let out = '-- 由 scripts/backfill-ingredients-sql.ts 產生，不要手改\n';
for (const row of rows) {
  const parsed = row.ingredients.map((item) => {
    // 已經有解析結果的列（作者存過的）不動
    if (item['ingredient_id'] !== undefined || item['amount'] !== undefined || item['unit'] !== undefined) return item;
    const p = parseIngredientLineNamed(item.raw_text, index);
    return {
      ...item,
      ...(p.name !== '' && [...p.name].length <= 60 ? { name: p.name } : {}),
      ...(p.ingredientId ? { ingredient_id: p.ingredientId } : {}),
      ...(p.amount !== undefined ? { amount: p.amount } : {}),
      ...(p.amountMax !== undefined ? { amount_max: p.amountMax } : {}),
      ...(p.unit ? { unit: p.unit } : {}),
    };
  });
  const json = JSON.stringify(parsed);
  if (json.includes(tag)) throw new Error(`食材內容不能包含 ${tag}`);
  if (!/^[0-9a-f-]{36}$/.test(row.id)) throw new Error('食譜 ID 格式不對');
  out += `select public.backfill_recipe_ingredients('${row.id}', ${tag}${json}${tag}::jsonb);\n`;
}
process.stdout.write(out);
