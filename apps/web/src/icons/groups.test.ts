import { describe, expect, it } from 'vitest';
import { equipmentTypes, EQUIPMENT_CATEGORIES } from '@zhusha/equipment';
import { ingredients, INGREDIENT_CATEGORIES } from '@zhusha/ingredients';
import { EQUIPMENT_CATEGORY_ICON, INGREDIENT_CATEGORY_ICON } from './categories.ts';
import { COLOR_GROUPS, EQUIPMENT_GROUP, INGREDIENT_GROUP } from './groups.ts';
import { loadIcons } from './load.ts';

describe('icon 群組', () => {
  it('每個食材類別、廚具類別都有對應群組與類別通用 icon', () => {
    for (const c of INGREDIENT_CATEGORIES) {
      expect(COLOR_GROUPS).toContain(INGREDIENT_GROUP[c]);
      expect(INGREDIENT_CATEGORY_ICON[c]?.length).toBeGreaterThan(0);
    }
    for (const c of EQUIPMENT_CATEGORIES) {
      expect(COLOR_GROUPS).toContain(EQUIPMENT_GROUP[c]);
      expect(EQUIPMENT_CATEGORY_ICON[c]?.length).toBeGreaterThan(0);
    }
  });

  it('字典裡實際用到的類別都在對照表裡', () => {
    for (const i of ingredients) expect(INGREDIENT_GROUP[i.category]).toBeDefined();
    for (const e of equipmentTypes) expect(EQUIPMENT_GROUP[e.category]).toBeDefined();
  });

  it('專屬 icon 檔的 key 都是字典 ID，且屬於該檔的群組', async () => {
    for (const g of COLOR_GROUPS) {
      const set = await loadIcons(g);
      for (const id of Object.keys(set)) {
        const ing = ingredients.find((i) => i.id === id);
        const eq = equipmentTypes.find((e) => e.id === id);
        const group = ing ? INGREDIENT_GROUP[ing.category] : eq ? EQUIPMENT_GROUP[eq.category] : undefined;
        expect(group, id).toBe(g);
      }
    }
  });
});
