// 舒肥的食材條件（07 SR-sous-vide）：舒肥預設組合表只有豬、牛、羊肉，所以手法是舒肥的點子或做法，
// 食材要有這幾種肉，而且不能有禽肉、海鮮、蛋。食材 ID 查字典的 traits；字典沒收的說法（名稱）再用關鍵字掃一次。
import { sousVideEligible } from '../../../../packages/equipment/src/index.ts';
import { ideaIngredients } from './env.ts';

const MEAT_WORDS = ['豬', '牛', '羊'];
const OTHER_WORDS = ['雞', '鴨', '鵝', '火雞', '魚', '蝦', '蟹', '蛤', '貝', '蠔', '花枝', '章魚', '海鮮', '干貝', '蛋'];

// ids：用到的食材 ID（字典裡的）；names：菜名與食材名稱（字典沒收的說法用關鍵字掃）
export function sousVideIngredientsOk(ids: readonly string[], names: readonly string[], region = 'US'): boolean {
  const traits: string[][] = ids.map((id) => [...(ideaIngredients.get(id)?.traits ?? [])]);
  // 名稱裡有字典沒收的肉或禽、海鮮、蛋：當作有那個 trait
  const text = names.join('');
  if (OTHER_WORDS.some((w) => text.includes(w))) traits.push(['poultry']);
  if (MEAT_WORDS.some((w) => text.includes(w))) traits.push(['pork']);
  return sousVideEligible(traits, region);
}
