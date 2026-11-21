import { describe, expect, it } from 'vitest';
import { haveInKitchen, ingredientName, renderIngredient } from './ingredient-text.ts';
import {
  convertTemperature, formatQuantity, formatTemperature, fractionText, parseMeasurePref, parseTemperaturePref, roundedText,
  type UnitLabels,
} from './units.ts';

const labels: UnitLabels = {
  g: '克', kg: '公斤', oz: '盎司', lb: '磅', tw_jin: '台斤', tw_liang: '兩', cn_jin: '斤',
  ml: '毫升', l: '公升', tsp: '小匙', tbsp: '大匙', cup: '杯', cup_jp: '杯', rice_cup: '米杯', fl_oz: '液量盎司', qt: '夸脫',
  cm: '公分', inch: '吋',
  piece: '個', whole: '顆', pack: '包', clove: '瓣', slice: '片', stalk: '根', bunch: '把', block: '塊', box: '盒', can: '罐',
  serving: '人份', pinch: '少許', to_taste: '適量',
};
const metric = parseMeasurePref('metric');
const us = parseMeasurePref('us');
const r = (text: string, factor: number, pref = metric) => renderIngredient(text, { factor, pref, labels });

describe('偏好字串', () => {
  it('解析主要與次要單位', () => {
    expect(parseMeasurePref('us+metric')).toEqual({ system: 'us', both: true });
    expect(parseMeasurePref('metric')).toEqual({ system: 'metric', both: false });
    expect(parseTemperaturePref('F+C')).toEqual({ unit: 'F', both: true });
  });
});

describe('fractionText', () => {
  it('用常見分數', () => {
    expect(fractionText(0.5)).toBe('½');
    expect(fractionText(1.34)).toBe('1⅓');
    expect(fractionText(2.26)).toBe('2¼');
    expect(fractionText(0.02)).toBe('⅛');
    expect(fractionText(2.97)).toBe('3');
    expect(fractionText(12.4)).toBe('12½');
  });
});

describe('roundedText', () => {
  it('公制：一般到 5，少量到 0.5', () => {
    expect(roundedText(452, 'g')).toBe('450');
    expect(roundedText(7.3, 'g')).toBe('7.5');
    expect(roundedText(0.1, 'ml')).toBe('0.5');
    expect(roundedText(1.52, 'kg')).toBe('1.5');
  });
});

describe('份量換算', () => {
  it('倍率 1 原樣顯示', () => {
    expect(r('醬油 2 大匙', 1)).toBe('醬油 2 大匙');
    expect(r('五花肉 300g', 1)).toBe('五花肉 300g');
    expect(r('鹽 適量', 2)).toBe('鹽 適量');
  });
  it('加倍', () => {
    expect(r('醬油 2 大匙', 2)).toBe('醬油 4 大匙');
    expect(r('五花肉 300g', 2)).toBe('五花肉 600 克');
    expect(r('雞蛋 3 顆', 1.5)).toBe('雞蛋 4½ 顆');
    expect(r('蒜 2–3 瓣', 2)).toBe('蒜 4–6 瓣');
    expect(r('牛奶 1/2 杯', 2)).toBe('牛奶 240 毫升');
    expect(r('豆腐 半塊', 2)).toBe('豆腐 1塊');
    expect(r('雞蛋 2', 3)).toBe('雞蛋 6');
    expect(r('醬油2大匙', 3)).toBe('醬油6 大匙');
  });
  it('不把名字當數量', () => {
    expect(r('7-Up 汽水 1 罐', 2)).toBe('7-Up 汽水 2 罐');
    expect(r('garlic 2 clove', 2)).toBe('garlic 4 clove');
    expect(r('五香粉', 2)).toBe('五香粉');
  });
  it('公制 ⇄ 美制', () => {
    expect(r('麵粉 250g', 1, us)).toBe('麵粉 8¾ 盎司');
    expect(r('牛奶 240ml', 1, us)).toBe('牛奶 1 杯');
    expect(r('水 500 毫升', 1, us)).toBe('水 2 杯');
    expect(r('橄欖油 10 ml', 1, us)).toBe('橄欖油 2 小匙');
    expect(r('牛肉 1 kg', 1, us)).toBe('牛肉 2¼ 磅');
    expect(r('麵粉 8 oz', 1)).toBe('麵粉 225 克');
    expect(r('牛奶 1 cup', 1)).toBe('牛奶 240 毫升');
    expect(r('醬油 2 大匙', 1, us)).toBe('醬油 2 大匙');
    expect(r('醬油 2 大匙', 1, metric)).toBe('醬油 2 大匙');
  });
  it('台斤附公制', () => {
    expect(r('豬肉 半斤', 1)).toBe('豬肉 半斤（300 克）');
    expect(r('豬肉 1 斤', 2)).toBe('豬肉 2 斤（1.2 公斤）');
  });
  it('兩種都顯示', () => {
    expect(r('牛奶 1 杯', 1, parseMeasurePref('us+metric'))).toBe('牛奶 1 杯（240 毫升）');
    expect(r('麵粉 250g', 1, parseMeasurePref('metric+us'))).toBe('麵粉 250g（8¾ 盎司）');
  });
  it('一行有兩個數量時不重複附加', () => {
    expect(r('豬肉 1 斤（600 克）', 2)).toBe('豬肉 2 斤（1.2 公斤）');
  });
  it('formatQuantity 範圍', () => {
    expect(formatQuantity({ amount: 100, amountMax: 150, unit: 'g', unitText: '克', raw: '100-150 克' }, 2, metric, labels)).toBe('200–300 克');
  });
});

describe('溫度', () => {
  it('烤箱溫度進位到 5', () => {
    expect(convertTemperature({ value: 180, unit: 'C' }, 'F')).toBe(355);
    expect(convertTemperature({ value: 350, unit: 'F' }, 'C')).toBe(175);
    expect(convertTemperature({ value: 180, unit: 'C' }, 'C')).toBe(180);
  });
  it('安全溫度往高溫進位', () => {
    expect(convertTemperature({ value: 74, unit: 'C' }, 'F', true)).toBe(166);
    expect(convertTemperature({ value: 165, unit: 'F' }, 'C', true)).toBe(74);
  });
  it('兩種都顯示', () => {
    expect(formatTemperature({ value: 180, unit: 'C' }, parseTemperaturePref('C+F'))).toBe('180°C（355°F）');
    expect(formatTemperature({ value: 180, unit: 'C' }, parseTemperaturePref('F'))).toBe('355°F');
  });
});

describe('廚房有', () => {
  const kitchen = { ingredientIds: new Set(['tofu']), names: ['雞蛋', '蛋', '洋蔥'] };
  it('取出食材名字', () => {
    expect(ingredientName('醬油 2 大匙')).toBe('醬油');
    expect(ingredientName('豬肉 1 斤（600 克）')).toBe('豬肉');
  });
  it('比對', () => {
    expect(haveInKitchen({ text: '雞蛋 3 顆' }, kitchen)).toBe(true);
    expect(haveInKitchen({ text: '紫洋蔥 1 顆' }, kitchen)).toBe(true);
    expect(haveInKitchen({ text: '蛋糕粉 100g' }, kitchen)).toBe(false);
    expect(haveInKitchen({ text: '薑黃粉 1 匙' }, { ingredientIds: new Set(), names: ['薑'] })).toBe(false);
    expect(haveInKitchen({ text: '豆腐', ingredientId: 'tofu' }, kitchen)).toBe(true);
  });
});
