// 靈感彩蛋（M1b-04c）：由程式挑「這一次提哪一樣」，AI 不挑。純函式。
// 醬料：廚房裡沒過期的醬（category 是 sauce），最近的點子沒用過。
// 廚具：使用者有、不是各地廚房都有的基本款（字典的新手盤點預設不是 default-on）、這個人做得到至少一種手法，最近的點子沒用過。
// 需要時間溫度的手法（time-temp）不算「做得到」。舒肥可以：點子用舒肥時，食材要是豬、牛、羊肉，由首頁同一套檢查（home/check.ts）把關。
import type { EggKind } from '../../../../packages/core/src/index.ts';
import { getEquipmentType, onboardingModeFor } from '../../../../packages/equipment/src/index.ts';
import { bannedTechniqueIds, ideaIngredients, ingredientName, type HomeEnv } from '../home/env.ts';

export interface EggFeature {
  kind: EggKind;
  id: string; // 食材或廚具的字典 ID
  name: string; // 繁中名稱
}

export interface EggUsed {
  ingredientIds: ReadonlySet<string>;
  equipmentIds: ReadonlySet<string>;
}

// 彩蛋不用的手法：時間溫度類的手法（bannedTechniqueIds）
export const EGG_BLOCKED_TECHNIQUES: ReadonlySet<string> = new Set([...bannedTechniqueIds]);

// 醬料裡太基本、當主角很無趣的（每個廚房都有的醬油、醋、酒、高湯）
const STAPLE_SAUCES: ReadonlySet<string> = new Set([
  'soy-sauce', 'dark-soy-sauce', 'white-vinegar', 'rice-vinegar', 'rice-wine', 'mirin', 'sake', 'red-wine', 'white-wine', 'beer', 'chicken-broth',
]);

// 可以當彩蛋主角的廚具類別：鍋具、家電、特殊工具（爐具、刀具、量測、烘焙模具不算）
const FEATURE_CATEGORIES = new Set(['cookware', 'appliance', 'special']);

export function eggCandidates(env: HomeEnv, used: EggUsed): EggFeature[] {
  const out: EggFeature[] = [];
  for (const p of env.pantry) {
    if (ideaIngredients.get(p.id)?.category !== 'sauce' || STAPLE_SAUCES.has(p.id) || used.ingredientIds.has(p.id)) continue;
    out.push({ kind: 'sauce', id: p.id, name: ingredientName(p.id) });
  }
  if (env.owned) {
    const seen = new Set<string>();
    for (const o of env.owned) {
      const id = o.equipmentTypeId;
      const type = getEquipmentType(id);
      if (!id || !type || type.deprecated || seen.has(id) || used.equipmentIds.has(id)) continue;
      seen.add(id);
      if (!FEATURE_CATEGORIES.has(type.category)) continue;
      if (onboardingModeFor(type, env.ctx.kitchen.region) === 'default-on') continue;
      const can = [...type.techniques, ...(o.enabledOptionalTechniques ?? [])].filter((t) => !EGG_BLOCKED_TECHNIQUES.has(t));
      if (can.length === 0 || !env.equipmentEnum.includes(id)) continue;
      out.push({ kind: 'equipment', id, name: type.name['zh-TW'] });
    }
  }
  return out;
}

// 隨機挑一樣（rng 可以注入，測試用固定的）
export function pickEggFeature(env: HomeEnv, used: EggUsed, rng: () => number = Math.random): EggFeature | null {
  const list = eggCandidates(env, used);
  if (list.length === 0) return null;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))] ?? null;
}
