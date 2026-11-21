import { buildChefCatalog, CHEF_PERSONAS } from '@zhusha/core';
import { describe, expect, it } from 'vitest';
import chefLines from './chef-lines.zh-Hant-TW.json';

const lines = chefLines as Record<string, string>;
const catalog = buildChefCatalog(Object.keys(lines));

// 畫面會用到的情境（改了畫面就要同步）
const SITUATIONS = [
  'home.morning', 'home.noon', 'home.afternoon', 'home.evening', 'home.night',
  'ideasNone', 'ideasNotEnough', 'emptyRecipes', 'emptySaved', 'emptyPantry', 'emptyEquipment',
  'recordDone', 'recordFirst', 'bookmarked', 'reasonPantry', 'reasonSeason',
  'vision1', 'vision2', 'vision3', 'onboardDone',
  'tasteAsk.dish_card', 'tasteAsk.this_or_that', 'tasteAsk.spectrum', 'tasteAsk.quick_fire', 'tasteAsk.context',
  'tasteReact.remember', 'tasteReact.teach', 'tasteReact.next',
];

// 01 的準則：不計算次數、連續天數，不催促、不讓人覺得落後，不談身材與罪惡感，不命令
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /[0-9０-９]/, why: '不放數字（頻率、次數、天數都不顯示）' },
  { re: /連續|連著|連[一二兩三四五六七八九十]/, why: '連續天數' },
  { re: /天沒(?!有)|久沒|陣子沒|段時間沒|好久|很久|許久|多久|還沒做|沒來|沒下廚|沒煮/, why: '提醒很久沒來、沒做' },
  { re: /每天|每週|每周|每個月|每日|天天/, why: '頻率' },
  { re: /([二兩三四五六七八九十百]|幾)\s*(次|回|天|週|周|個月|個星期)|一\s*(次|回|個月|個星期)|[二兩三四五六七八九十百]\s*(篇|道菜)/, why: '次數或天數' },
  { re: /第[一二兩三四五六七八九十百]+\s*(次|回|天|週|周|篇|道|個)/, why: '第幾次' },
  { re: /已經\s*[一二兩三四五六七八九十百幾]/, why: '已經 N' },
  { re: /快來|快點|趕快|趕緊|快去|別忘|不要忘|記得要|記得來|別錯過|錯過|最後機會|限時|立刻|馬上|再不|不然就/, why: '催促' },
  { re: /落後|跟不上|偷懶|懶惰|荒廢|浪費了|白白/, why: '讓人覺得落後或被責備' },
  { re: /你應該|你必須|你得|一定要|務必|不可以不/, why: '命令句' },
  { re: /罪惡|熱量|卡路里|減肥|瘦身|身材|發胖|不健康|變胖/, why: '身材與罪惡感' },
  { re: /欲|啥|咧|佇|攏|袂|嘸/, why: '台語只用在招呼語' },
];

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
