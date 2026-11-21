import { describe, expect, it } from 'vitest';
import { buildIngredientIndex, parseIngredientLine, type DictIngredient } from './ingredient-line.ts';
import { renderIngredient } from './ingredient-text.ts';
import { parseMeasurePref, type UnitLabels } from './units.ts';

const d = (id: string, name: string, aliases: string[] = [], extra: Partial<DictIngredient> = {}): DictIngredient => ({
  id, name: { 'zh-TW': name }, aliases: { 'zh-TW': aliases }, ...extra,
});
const index = buildIngredientIndex([
  d('garlic', '大蒜', ['蒜頭', '蒜']),
  d('soy-sauce', '醬油', ['生抽']),
  d('salt', '鹽', ['食鹽']),
  d('minced-pork', '豬絞肉', ['絞肉']),
  d('onion', '洋蔥'),
  d('egg', '雞蛋', ['蛋']),
  d('ginger', '薑'),
  d('chili-sauce', '辣醬'),
  d('old-sauce', '舊醬', [], { deprecated: true, replacedBy: 'soy-sauce' }),
  d('dead', '死掉的', [], { deprecated: true }),
]);
const p = (t: string) => parseIngredientLine(t, index);

describe('parseIngredientLine', () => {
  it('蒜 2–3 瓣：範圍、計數單位', () => {
    expect(p('蒜 2–3 瓣')).toEqual({ ingredientId: 'garlic', amount: 2, amountMax: 3, unit: 'clove' });
  });
  it('一般的「名字 數量 單位」', () => {
    expect(p('醬油 2 大匙')).toEqual({ ingredientId: 'soy-sauce', amount: 2, unit: 'tbsp' });
    expect(p('豬絞肉 300 克')).toEqual({ ingredientId: 'minced-pork', amount: 300, unit: 'g' });
    expect(p('絞肉300g')).toEqual({ ingredientId: 'minced-pork', amount: 300, unit: 'g' });
  });
  it('適量、少許只有單位', () => {
    expect(p('鹽 適量')).toEqual({ ingredientId: 'salt', unit: 'to_taste' });
    expect(p('鹽少許')).toEqual({ ingredientId: 'salt', unit: 'pinch' });
  });
  it('對不到字典的食材：ID 留空，數量照解析', () => {
    expect(p('阿嬤的辣醬 1 匙')).toEqual({ amount: 1 });
    expect(p('阿嬤的辣醬')).toEqual({});
  });
  it('分數與中文數字', () => {
    expect(p('洋蔥 ½ 顆')).toEqual({ ingredientId: 'onion', amount: 0.5, unit: 'whole' });
    expect(p('洋蔥 半顆')).toEqual({ ingredientId: 'onion', amount: 0.5, unit: 'whole' });
    expect(p('雞蛋 兩顆')).toEqual({ ingredientId: 'egg', amount: 2, unit: 'whole' });
    expect(p('醬油 三大匙')).toEqual({ ingredientId: 'soy-sauce', amount: 3, unit: 'tbsp' });
    expect(p('豬絞肉 半斤')).toEqual({ ingredientId: 'minced-pork', amount: 0.5, unit: 'tw_jin' });
    expect(p('薑 十二片')).toEqual({ ingredientId: 'ginger', amount: 12, unit: 'slice' });
    expect(p('薑 1 1/2 塊')).toEqual({ ingredientId: 'ginger', amount: 1.5, unit: 'block' });
  });
  it('沒單位的數字', () => {
    expect(p('雞蛋 2')).toEqual({ ingredientId: 'egg', amount: 2 });
  });
  it('名字裡的中文數字不當數量', () => {
    expect(p('五花肉 600 克')).toEqual({ amount: 600, unit: 'g' });
    expect(p('三杯雞醬')).toEqual({});
    expect(p('半熟蛋')).toEqual({});
  });
  it('括號裡的備註不影響比對', () => {
    expect(p('豬絞肉（肥瘦各半）300 克')).toEqual({ ingredientId: 'minced-pork', amount: 300, unit: 'g' });
    expect(p('豬肉 1 斤（600 克）')).toEqual({ amount: 1, unit: 'tw_jin' });
  });
  it('別名、模糊比對', () => {
    expect(p('生抽 1 匙')).toMatchObject({ ingredientId: 'soy-sauce' });
    expect(p('紫洋蔥 1 顆')).toMatchObject({ ingredientId: 'onion' });
    expect(p('蒜頭')).toEqual({ ingredientId: 'garlic' });
  });
  it('單字只認完全相同：薑黃粉不是薑', () => {
    expect(p('薑黃粉 1 匙')).toEqual({ amount: 1 });
    expect(p('薑 3 片')).toMatchObject({ ingredientId: 'ginger' });
  });
  it('已淘汰的食材換成取代的，沒有取代的對不到', () => {
    expect(p('舊醬')).toEqual({ ingredientId: 'soy-sauce' });
    expect(p('死掉的')).toEqual({});
  });
  it('空字串與只有數字', () => {
    expect(p('')).toEqual({});
    expect(p('300 克')).toEqual({ amount: 300, unit: 'g' });
  });
  it('0 或負的數量不採用', () => {
    expect(p('鹽 0 克')).toEqual({ ingredientId: 'salt' });
  });
});

const labels = {
  g: '克', kg: '公斤', oz: '盎司', lb: '磅', tw_jin: '台斤', tw_liang: '兩', cn_jin: '斤',
  ml: '毫升', l: '公升', tsp: '小匙', tbsp: '大匙', cup: '杯', cup_jp: '杯', rice_cup: '米杯', fl_oz: '液量盎司', qt: '夸脫',
  cm: '公分', inch: '吋',
  piece: '個', whole: '顆', pack: '包', clove: '瓣', slice: '片', stalk: '根', bunch: '把', block: '塊', box: '盒', can: '罐',
  serving: '人份', pinch: '少許', to_taste: '適量',
} satisfies UnitLabels;
const metric = parseMeasurePref('metric');

describe('用存檔時解析好的數量顯示', () => {
  const show = (text: string, factor: number, pref = metric) =>
    renderIngredient(text, { factor, pref, labels }, p(text) && (({ amount, amountMax, unit }) => ({ amount, amountMax, unit }))(p(text)));
  it('和只看原文的顯示一樣', () => {
    for (const text of ['醬油 2 大匙', '蒜 2–3 瓣', '鹽 適量', '豬絞肉 300 克', '雞蛋 兩顆', '豆腐 半塊']) {
      for (const factor of [0.5, 1, 2]) {
        expect(show(text, factor)).toBe(renderIngredient(text, { factor, pref: metric, labels }));
      }
    }
  });
  it('存下來的數字比原文優先', () => {
    expect(renderIngredient('醬油 2 大匙', { factor: 2, pref: metric, labels }, { amount: 3, unit: 'tbsp' })).toBe('醬油 6 大匙');
    expect(renderIngredient('醬油 2 大匙', { factor: 1, pref: metric, labels }, { amount: 3, unit: 'tbsp' })).toBe('醬油 3 大匙');
  });
  it('原文裡找不到數量時，照原文', () => {
    expect(renderIngredient('鹽 適量', { factor: 2, pref: metric, labels }, { amount: 3, unit: 'g' })).toBe('鹽 適量');
  });
});
