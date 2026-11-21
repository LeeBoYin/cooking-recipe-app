// 介面文字一律放語系檔，用 ICU MessageFormat；ID 用英文代碼。
// 大廚的情境句子（`chef.line.*`）另放一個檔，見 chef/useChefLine.ts
import { buildChefCatalog } from '@zhusha/core';
import chefLines from './chef-lines.zh-Hant-TW.json';
import zhHantTW from './zh-Hant-TW.json';

export const locale = 'zh-Hant-TW';
export const messages: Record<string, string> = { ...zhHantTW, ...chefLines };
export const chefCatalog = buildChefCatalog(Object.keys(chefLines));
