// 口味檔案（M1a-10a）：快照新鮮就直接用，過期或不存在就用 core 重算、存回去；合併後的口味進 buildHomeEnv。
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { fromSnapshotData, type TasteSnapshotData } from '../../../packages/core/src/index.ts';
import { ctx } from './home/eval/cases.ts';
import { buildHomeEnv } from './home/env.ts';
import { hashHomeInputs } from './home/handler.ts';
import type { HomeContextRow } from './home/types.ts';
import { computeTasteFromContext, withMergedTaste } from './taste.ts';
import type { Rpc } from './usage.ts';

const NOW = new Date('2026-11-22T00:00:00Z');
const DISH = 'tomato-scrambled-eggs';

const snapshot = (over: Partial<TasteSnapshotData> = {}): TasteSnapshotData => ({
  schemaVersion: 1,
  dims: { 'taste.spicy': { affinity: 0.8, confidence: 0.7, source: 'learned', updatedAt: '2026-11-01T00:00:00Z' } },
  context: { adventure: 0.2, goals: [], festiveDishes: false },
  sources: { quiz: false, saved: 3, cooked: 0, signals: 0, pantry: 0 },
  ...over,
});

function fakeRpc(error?: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = ((fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve({ data: null, error: error ? { code: error } : null });
  }) as Rpc;
  return { rpc, calls };
}

const withInputs = (over: Partial<HomeContextRow> = {}) =>
  ctx({
    taste: { dims: { 'protein.pork': { affinity: -0.5, confidence: 0.9, source: 'user_set', updated_at: '2026-01-01T00:00:00Z' } }, context: { adventure: 0.2, goals: [], festive_dishes: false } },
    taste_snapshot: null,
    taste_inputs: {
      saved: [{ base_dish_id: null, ingredient_ids: ['pork', 'egg'], cooked: true, at: '2026-11-20T00:00:00Z' }],
      signals: [{ at: '2026-11-21T00:00:00Z', signals: [{ dimension_key: 'taste.spicy', affinity: -0.6, scope: 'long_term' }, { dimension_key: 'taste.sour', affinity: 0.9, scope: 'today' }] }],
    },
    read_at: '2026-11-22T00:00:00Z',
    ...over,
  });

Deno.test('快照新鮮：直接用，不重算、不存', async () => {
  const { rpc, calls } = fakeRpc();
  const out = await withMergedTaste(ctx({ taste_snapshot: { stale: false, data: snapshot() } }), rpc, 'u1', NOW);
  assertEquals(out.merged_taste?.dims['taste.spicy']?.affinity, 0.8);
  assertEquals(calls.length, 0);
});

Deno.test('快照超過 30 天沒重算：即使 stale 是 false 也重算', async () => {
  const { rpc, calls } = fakeRpc();
  const c = withInputs({ taste_snapshot: { stale: false, computed_at: '2026-10-01T00:00:00Z', data: snapshot() } });
  await withMergedTaste(c, rpc, 'u1', NOW);
  assertEquals(calls.length, 1);
  const young = withInputs({ taste_snapshot: { stale: false, computed_at: '2026-11-10T00:00:00Z', data: snapshot() } });
  const { rpc: rpc2, calls: calls2 } = fakeRpc();
  await withMergedTaste(young, rpc2, 'u1', NOW);
  assertEquals(calls2.length, 0);
});

Deno.test('沒有快照：重算並存回去（帶讀取時間），格式是 schemaVersion 1', async () => {
  const { rpc, calls } = fakeRpc();
  const out = await withMergedTaste(withInputs(), rpc, 'u1', NOW);
  assertEquals(calls.length, 1);
  assertEquals(calls[0]?.fn, 'taste_profile_save');
  assertEquals(calls[0]?.args.p_user, 'u1');
  assertEquals(calls[0]?.args.p_read_at, '2026-11-22T00:00:00Z');
  const data = calls[0]?.args.p_data as TasteSnapshotData;
  assertEquals(data.schemaVersion, 1);
  assertEquals(data.sources.cooked, 1);
  assertEquals(data.sources.signals, 1); // 只針對今天的不算
  assert((out.merged_taste?.dims['taste.spicy']?.affinity ?? 0) < 0);
  assertEquals(out.merged_taste?.dims['taste.sour'], undefined);
});

Deno.test('過期：重算；你設定的維度不被覆蓋', async () => {
  const { rpc, calls } = fakeRpc();
  const out = await withMergedTaste(withInputs({ taste_snapshot: { stale: true, data: snapshot() } }), rpc, 'u1', NOW);
  assertEquals(calls.length, 1);
  assertEquals(out.merged_taste?.dims['protein.pork']?.affinity, -0.5);
  assertEquals(out.merged_taste?.dims['protein.pork']?.source, 'user_set');
});

Deno.test('存失敗只記代號，這一次照用算好的', async () => {
  const { rpc } = fakeRpc('XX000');
  const out = await withMergedTaste(withInputs(), rpc, 'u1', NOW);
  assert(out.merged_taste !== undefined);
});

Deno.test('收藏的家常菜用基礎菜色的菜系與食材；buildHomeEnv 用合併後的口味', () => {
  const c = withInputs({ taste_inputs: { saved: [{ base_dish_id: DISH, ingredient_ids: [], cooked: false, at: '2026-11-20T00:00:00Z' }], signals: [] } });
  const merged = computeTasteFromContext(c, NOW);
  assertEquals(merged.sources.saved, 1);
  assert((merged.dims['protein.egg']?.affinity ?? 0) > 0); // 基礎菜色的食材
  const env = buildHomeEnv({ ...c, merged_taste: merged }, NOW);
  assertEquals(env.profile, merged);
  // 沒有合併口味時退回口味地圖
  assertEquals(buildHomeEnv(c, NOW).profile.dims['protein.pork']?.source, 'user_set');
});

Deno.test('首頁快取的雜湊跟著合併後的口味變（夠把握的維度才算）', async () => {
  const c = ctx({});
  const plain = await hashHomeInputs(buildHomeEnv(c, NOW));
  const learned = { ...c, merged_taste: fromSnapshotData(snapshot()) };
  assertNotEquals(await hashHomeInputs(buildHomeEnv(learned, NOW)), plain);
  const weak = { ...c, merged_taste: fromSnapshotData(snapshot({ dims: { 'taste.spicy': { affinity: 0.8, confidence: 0.2, source: 'learned', updatedAt: 'x' } }, context: { adventure: 0.3, goals: [], festiveDishes: false } })) };
  assertEquals(await hashHomeInputs(buildHomeEnv(weak, NOW)), plain);
});
