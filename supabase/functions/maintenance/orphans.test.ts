import { assertEquals } from 'jsr:@std/assert@1';
import { chunk, GRACE_MS, planOrphanRemoval, safeEqual, type StoredFile } from './orphans.ts';

const now = new Date('2026-11-20T00:00:00Z');
const old = new Date(now.getTime() - GRACE_MS - 1000);
const fresh = new Date(now.getTime() - 60_000);
const file = (path: string, createdAt: Date): StoredFile => ({ path, createdAt });

Deno.test('有資料列用到的檔案不是孤兒', () => {
  const plan = planOrphanRemoval([file('a', old), file('b', old)], new Set(['a']), now);
  assertEquals(plan.orphans, ['b']);
  assertEquals(plan.refusedReason, undefined);
});

Deno.test('24 小時內上傳的檔案不動', () => {
  const plan = planOrphanRemoval([file('a', fresh), file('b', old)], new Set(), now);
  assertEquals(plan.orphans, ['b']);
});

Deno.test('孤兒太多就不刪', () => {
  const files = Array.from({ length: 30 }, (_, i) => file(`f${i}`, old));
  const plan = planOrphanRemoval(files, new Set(['f0']), now);
  assertEquals(plan.refusedReason, 'too_many_orphans');
  assertEquals(plan.orphans.length, 29);
});

Deno.test('檔案很少時不啟動安全閥', () => {
  const plan = planOrphanRemoval([file('a', old), file('b', old)], new Set(), now);
  assertEquals(plan.refusedReason, undefined);
  assertEquals(plan.orphans.length, 2);
});

Deno.test('chunk 與 safeEqual', () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(safeEqual('abc', 'abc'), true);
  assertEquals(safeEqual('abc', 'abd'), false);
  assertEquals(safeEqual('abc', 'abcd'), false);
});
