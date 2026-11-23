// post_publish 的輸出檢查：AI 給的菜系、手法、廚具只收字典裡有的；主食材用名稱對字典（名稱或別名完全相同才收）。
// 難易度夾在 1–5。沒有任何可用的標籤也算有效（標籤本來就可以是空的）。
import { ingredients } from '../../../../packages/ingredients/src/index.ts';
import { CUISINE_KEYS, EQUIPMENT_IDS, type RawPostPublish, TECHNIQUE_IDS } from './prompt.ts';

export interface PostPublishTags {
  cuisine_keys: string[];
  main_ingredient_ids: string[];
  techniques: string[];
  equipment_type_ids: string[];
}
export interface PostPublishResult {
  tags: PostPublishTags;
  difficulty: { ingredients: number; equipment: number; time: number; technique: number; failure_risk: number; estimated_from: 'recipe' | 'text' } | null;
}

// 名稱（含別名）→ 字典 ID；已淘汰的換成取代它的 ID，沒有取代的不收
const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();
const byName = new Map<string, string>();
const live = new Map(ingredients.map((i) => [i.id, i]));
for (const i of ingredients) {
  const target = i.deprecated ? (i.replacedBy && live.get(i.replacedBy) && !live.get(i.replacedBy)!.deprecated ? i.replacedBy : null) : i.id;
  if (!target) continue;
  for (const n of [i.name['zh-TW'], ...(i.aliases['zh-TW'] ?? [])]) if (n) byName.set(norm(n), target);
}

const pick = (values: unknown, allowed: ReadonlySet<string>, max: number): string[] =>
  Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === 'string' && allowed.has(v)))].slice(0, max) : [];

const facet = (n: unknown) => Math.min(5, Math.max(1, Math.round(typeof n === 'number' && Number.isFinite(n) ? n : 3)));

export function checkPostPublish(raw: RawPostPublish, opts: { withDifficulty: boolean; hasSteps: boolean }): PostPublishResult {
  const mainIds = Array.isArray(raw.main_ingredients)
    ? [...new Set(raw.main_ingredients.flatMap((n) => (typeof n === 'string' && byName.has(norm(n)) ? [byName.get(norm(n))!] : [])))].slice(0, 3)
    : [];
  const d = raw.difficulty;
  return {
    tags: {
      cuisine_keys: pick(raw.cuisine_keys, CUISINE_KEYS, 2),
      main_ingredient_ids: mainIds,
      techniques: pick(raw.techniques, TECHNIQUE_IDS, 4),
      equipment_type_ids: pick(raw.equipment_type_ids, EQUIPMENT_IDS, 4),
    },
    difficulty:
      opts.withDifficulty && d
        ? {
            ingredients: facet(d.ingredients),
            equipment: facet(d.equipment),
            time: facet(d.time),
            technique: facet(d.technique),
            failure_risk: facet(d.failure_risk),
            estimated_from: opts.hasSteps ? 'recipe' : 'text',
          }
        : null,
  };
}
