import { buildChefCatalog, CHEF_PERSONAS, FORBIDDEN_WORDING } from '@zhusha/core';
import { describe, expect, it } from 'vitest';
import chefLines from './chef-lines.zh-Hant-TW.json';

const lines = chefLines as Record<string, string>;
const catalog = buildChefCatalog(Object.keys(lines));

// 畫面會用到的情境（改了畫面就要同步）
const SITUATIONS = [
  'home.morning', 'home.noon', 'home.afternoon', 'home.evening', 'home.night',
  'ideasUnavailable', 'ideasStale', 'ideasNotEnough', 'ideasSlowDown', 'ideasDailyLimit', 'emptyRecipes', 'emptySaved', 'emptyPantry', 'emptyEquipment',
  'recordDone', 'recordFirst', 'bookmarked',
  'vision1', 'vision2', 'vision3', 'onboardDone',
  'tasteAsk.dish_card', 'tasteAsk.this_or_that', 'tasteAsk.spectrum', 'tasteAsk.quick_fire', 'tasteAsk.context',
  'tasteReact.remember', 'tasteReact.teach', 'tasteReact.next',
];

const FORBIDDEN = FORBIDDEN_WORDING;

describe('大廚的情境句子', () => {
  it('至少 100 句', () => {
    expect(Object.keys(lines).length).toBeGreaterThanOrEqual(100);
  });

  it('每個情境、每種語氣都有句子，編號從 1 連續', () => {
    for (const situation of SITUATIONS) {
      for (const persona of CHEF_PERSONAS) {
        const count = catalog[situation]?.[persona] ?? 0;
        expect(count, `${situation} / ${persona}`).toBeGreaterThan(0);
        for (let n = 1; n <= count; n += 1) expect(lines[`chef.line.${situation}.${persona}.${n}`], `${situation}.${persona}.${n}`).toBeTruthy();
      }
    }
  });

  it('沒有沒人用的情境', () => {
    expect(Object.keys(catalog).sort()).toEqual([...SITUATIONS].sort());
  });

  it('不含禁用字眼', () => {
    const hits = Object.entries(lines).flatMap(([key, text]) => FORBIDDEN.filter((f) => f.re.test(text)).map((f) => `${key}「${text}」→ ${f.why}`));
    expect(hits).toEqual([]);
  });

  it('禁用字眼的規則本身有效（掃得到壞句子）', () => {
    const bad = ['你已經連續 3 天沒煮了', '好久沒下廚了，快來煮吧', '別忘了今天要記錄', '你應該多吃蔬菜', '這道菜熱量很高', '已經第三次做這道菜', '每天都要煮'];
    for (const text of bad) expect(FORBIDDEN.some((f) => f.re.test(text)), text).toBe(true);
  });

  it('短句、參數只用 title 與 ingredient', () => {
    for (const [key, text] of Object.entries(lines)) {
      expect(text.length, key).toBeLessThanOrEqual(40);
      for (const m of text.matchAll(/\{(\w+)\}/g)) expect(['title', 'ingredient'], key).toContain(m[1]);
    }
  });

  it('同一個情境、各語氣用的參數一致或更少（簡潔可以省略）', () => {
    for (const situation of SITUATIONS) {
      const names = (persona: string) => new Set([...Object.entries(lines)].filter(([k]) => k.startsWith(`chef.line.${situation}.${persona}.`)).flatMap(([, t]) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
      for (const persona of CHEF_PERSONAS) for (const n of names(persona)) expect([...names('warm')], `${situation}.${persona}`).toContain(n);
    }
  });
});
