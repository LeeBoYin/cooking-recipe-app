// 口味字典的一致性檢查。資料庫匯入時也會再檢查一次參照（private.import_dictionaries）。
import { equipmentTypes, techniques } from '@zhusha/equipment';
import { allergens, dietaryRestrictions, ingredients, regionProfiles } from '@zhusha/ingredients';
import { describe, expect, it } from 'vitest';
import { DIMENSION_GROUPS, QUIZ_CONTEXT_FIELDS, QUIZ_ITEM_TYPES, baseDishes, dimensionWithAncestors, preferenceDimensions, quizItems } from './index.ts';

const DICT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DIMENSION_KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const QUIZ_ID = /^[a-z0-9]+(_[a-z0-9]+)*$/;

const dimensionKeys = new Set(preferenceDimensions.map((d) => d.key));
const regionCodes = new Set(regionProfiles.map((r) => r.code));
const ids = (items: { id: string }[]) => new Set(items.map((i) => i.id));

describe('偏好維度', () => {
  it('key 不重複、格式正確、第一段就是群組', () => {
    expect(dimensionKeys.size).toBe(preferenceDimensions.length);
    for (const d of preferenceDimensions) {
      expect(d.key).toMatch(DIMENSION_KEY);
      expect(DIMENSION_GROUPS).toContain(d.group);
      expect(d.key.split('.')[0]).toBe(d.group);
      expect(d.name['zh-TW'].trim()).not.toBe('');
      expect(d.impact).toBeGreaterThanOrEqual(0);
      expect(d.impact).toBeLessThanOrEqual(1);
    }
  });

  it('上層存在，而且不會繞成圈', () => {
    for (const d of preferenceDimensions) {
      if (d.parentKey) expect(dimensionKeys, d.key).toContain(d.parentKey);
      const chain = dimensionWithAncestors(d.key);
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it('菜系的樹：下層的 key 以上層的 key 開頭', () => {
    for (const d of preferenceDimensions.filter((x) => x.group === 'cuisine' && x.parentKey)) {
      expect(d.key.startsWith(`${d.parentKey}.`), d.key).toBe(true);
    }
  });
});

describe('題庫', () => {
  const allergenIds = ids(allergens);
  const restrictionIds = ids(dietaryRestrictions);
  const itemIds = new Set(quizItems.map((q) => q.id));

  it('ID 不重複、格式正確、題型合法、有繁中題目', () => {
    expect(itemIds.size).toBe(quizItems.length);
    for (const q of quizItems) {
      expect(q.id).toMatch(QUIZ_ID);
      expect(QUIZ_ITEM_TYPES).toContain(q.type);
      expect(q.title['zh-TW'].trim()).not.toBe('');
    }
  });

  it('描述菜卡要有 30 字以內的描述；其他題型不需要', () => {
    for (const q of quizItems.filter((x) => x.type === 'dish_card')) {
      expect(q.description?.['zh-TW'], q.id).toBeTruthy();
      expect([...(q.description?.['zh-TW'] ?? '')].length, q.id).toBeLessThanOrEqual(30);
    }
  });

  it('mapping 只指向存在的維度，值在 −1～1；菜卡與快問快答至少有一項', () => {
    for (const q of quizItems) {
      const entries = Object.entries(q.mapping);
      if (q.type === 'dish_card' || q.type === 'quick_fire') expect(entries.length, q.id).toBeGreaterThan(0);
      for (const [key, value] of entries) {
        expect(dimensionKeys, `${q.id} → ${key}`).toContain(key);
        expect(Math.abs(value)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('二選一有兩個選項、各有 mapping；光譜有五個點；情境題有欄位與選項', () => {
    for (const q of quizItems) {
      if (q.type === 'this_or_that') {
        expect(q.options?.length, q.id).toBe(2);
        for (const o of q.options ?? []) {
          expect(o.label['zh-TW'].trim(), q.id).not.toBe('');
          const entries = Object.entries(o.mapping ?? {});
          expect(entries.length, q.id).toBeGreaterThan(0);
          for (const [key, value] of entries) {
            expect(dimensionKeys, `${q.id} → ${key}`).toContain(key);
            expect(Math.abs(value)).toBeLessThanOrEqual(1);
          }
        }
      } else if (q.type === 'spectrum') {
        expect(dimensionKeys, q.id).toContain(q.spectrum?.dimension);
        expect(q.spectrum?.labels.length, q.id).toBe(5);
      } else if (q.type === 'context') {
        expect(QUIZ_CONTEXT_FIELDS, q.id).toContain(q.contextField);
        expect(q.options?.length, q.id).toBeGreaterThanOrEqual(2);
        for (const o of q.options ?? []) {
          expect(o.value, q.id).toBeDefined();
          if (o.addGoal) expect(dimensionKeys, q.id).toContain(o.addGoal);
        }
      } else {
        expect(q.options, q.id).toBeUndefined();
        expect(q.spectrum, q.id).toBeUndefined();
      }
    }
  });

  it('題庫共 73 題（20 題台灣限定），各題型數量符合規格', () => {
    const count = (type: string) => quizItems.filter((q) => q.type === type).length;
    expect([count('dish_card'), count('quick_fire'), count('this_or_that'), count('spectrum'), count('context')]).toEqual([37, 14, 11, 8, 3]);
    expect(quizItems.filter((q) => q.regions.length === 1 && q.regions[0] === 'TW')).toHaveLength(20);
  });

  it('地區、後續題目、排除的過敏原與飲食限制都存在', () => {
    for (const q of quizItems) {
      expect(q.regions.length, q.id).toBeGreaterThan(0);
      for (const r of q.regions) expect(regionCodes, q.id).toContain(r);
      for (const f of q.followUps ?? []) {
        expect(itemIds, q.id).toContain(f);
        expect(f).not.toBe(q.id);
      }
      for (const a of q.excludedAllergenIds ?? []) expect(allergenIds, q.id).toContain(a);
      for (const r of q.excludedRestrictionIds ?? []) expect(restrictionIds, q.id).toContain(r);
    }
  });

  it('涉及某個蛋白質的菜卡，有對應過敏或飲食限制時要被排除（常見的幾種）', () => {
    const exclusions = (id: string) => quizItems.find((q) => q.id === id);
    expect(exclusions('card_tom_yum')?.excludedAllergenIds).toContain('crustacean');
    expect(exclusions('card_lu_rou_fan')?.excludedRestrictionIds).toContain('no-pork');
    expect(exclusions('card_beef_noodle_soup')?.excludedRestrictionIds).toContain('no-beef');
  });
});

describe('基礎菜色', () => {
  const ingredientIds = ids(ingredients);
  const techniqueIds = ids(techniques);
  const equipmentIds = ids(equipmentTypes);

  it('ID 不重複、格式正確、有繁中名稱', () => {
    expect(ids(baseDishes).size).toBe(baseDishes.length);
    for (const d of baseDishes) {
      expect(d.id).toMatch(DICT_ID);
      expect(d.name['zh-TW'].trim()).not.toBe('');
    }
  });

  it('菜系、食材、手法、廚具、地區都存在', () => {
    for (const d of baseDishes) {
      expect(d.cuisineKeys.length, d.id).toBeGreaterThan(0);
      for (const k of d.cuisineKeys) expect(dimensionKeys, d.id).toContain(k);
      expect(d.ingredientIds.length, d.id).toBeGreaterThan(0);
      for (const i of d.ingredientIds) expect(ingredientIds, `${d.id} → ${i}`).toContain(i);
      expect(d.techniques.length, d.id).toBeGreaterThan(0);
      for (const t of d.techniques) expect(techniqueIds, `${d.id} → ${t}`).toContain(t);
      for (const e of d.equipmentTypeIds) expect(equipmentIds, `${d.id} → ${e}`).toContain(e);
      for (const r of d.regions) expect(regionCodes, d.id).toContain(r);
    }
  });

  it('難易度五個面向都在 1–5', () => {
    for (const d of baseDishes) {
      for (const v of Object.values(d.difficulty)) {
        expect(Number.isInteger(v), d.id).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });
});
