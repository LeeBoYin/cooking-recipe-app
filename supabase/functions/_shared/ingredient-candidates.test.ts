import { assertEquals } from 'jsr:@std/assert@1';
import { type DictRow, normalizeTerm, pickCandidates } from './ingredient-candidates.ts';

const row = (id: string, name: string, aliases: string[] = [], deprecated = false): DictRow => ({
  id, name: { 'zh-TW': name }, aliases: { 'zh-TW': aliases }, deprecated,
});
const DICT = [
  row('chili', '辣椒', ['朝天椒']), row('chili-sauce', '辣醬'), row('garlic', '大蒜', ['蒜頭']),
  row('ginger', '薑'), row('soy', '醬油', ['生抽']), row('old', '舊辣椒', [], true),
];

Deno.test('標準寫法：全形轉半形、小寫、去空白', () => {
  assertEquals(normalizeTerm('  Ａ１ 辣 椒 '), 'a1辣椒');
});

Deno.test('名字包含在詞裡的排最前面', () => {
  const c = pickCandidates('小朝天椒', DICT);
  assertEquals(c[0].id, 'chili');
});

Deno.test('已淘汰的不當候選；完全無關的不列', () => {
  assertEquals(pickCandidates('舊辣椒', DICT).some((c) => c.id === 'old'), false);
  assertEquals(pickCandidates('zzz', DICT), []);
});

Deno.test('數量上限', () => {
  const many = Array.from({ length: 30 }, (_, i) => row(`x${i}`, `辣椒${i}`));
  assertEquals(pickCandidates('辣椒', many, 5).length, 5);
});
