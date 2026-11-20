// 把字典檔轉成一段匯入資料庫的 SQL，印到標準輸出。
// 本機：pnpm db:reset 會先產生 supabase/seeds/dictionaries.sql；部署：GitHub Actions 產生後對雲端專案執行。
// 版本號是字典內容的雜湊，內容沒變版本就不變。
import { createHash } from 'node:crypto';
import { allergens, dietaryRestrictions, ingredients } from '../packages/ingredients/src/index.ts';

const content = { allergens, ingredients, dietaryRestrictions };
const version = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 12);
const json = JSON.stringify({ version, ...content });

const tag = '$dict$';
if (json.includes(tag)) throw new Error(`字典內容不能包含 ${tag}`);

process.stdout.write(
  `-- 由 scripts/dictionaries-sql.ts 產生，不要手改。字典版本 ${version}\n` +
    `select private.import_dictionaries(${tag}${json}${tag}::jsonb);\n`,
);
