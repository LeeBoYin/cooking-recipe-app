import { assertEquals } from 'jsr:@std/assert@1';
import { handleTrack, type TrackDeps } from './handle.ts';
import { TRACK_EVENT_NAMES, type TrackBatch } from '../../../packages/core/src/index.ts';

const NOW = Date.parse('2026-11-22T02:00:00Z');
const S = '01234567-89ab-cdef-0123-456789abcdef';

function deps(): { deps: TrackDeps; calls: { batch: TrackBatch; dropped: number }[] } {
  const calls: { batch: TrackBatch; dropped: number }[] = [];
  return { calls, deps: { now: () => NOW, write: (batch, dropped) => { calls.push({ batch, dropped }); return Promise.resolve(); } } };
}
const body = (events: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ appVersion: '0.1.0', platform: 'ios', installed: true, events, ...extra });
const ev = (name: string, extra: Record<string, unknown> = {}) => ({ name, sessionId: S, at: '2026-11-22T01:59:00Z', ...extra });

Deno.test('合格的事件寫入，不合格的丟掉並回報數量', async () => {
  const d = deps();
  const r = await handleTrack(d.deps, body([
    ev('app.open'),
    ev('record.start', { props: { entry: 'plus' } }),
    ev('record.start', { props: { entry: '自由文字' } }),
    ev('hack.attempt'),
    ev('app.open', { props: { note: 'x' } }),
  ]));
  assertEquals(r.status, 204);
  assertEquals(d.calls[0]?.batch.events.length, 2);
  assertEquals(d.calls[0]?.dropped, 3);
});

Deno.test('超過 50 個的丟掉', async () => {
  const d = deps();
  await handleTrack(d.deps, body(Array.from({ length: 53 }, () => ev('app.open'))));
  assertEquals(d.calls[0]?.batch.events.length, 50);
  assertEquals(d.calls[0]?.dropped, 3);
});

Deno.test('整批欄位不對回 400，太大回 413，寫入失敗回 500', async () => {
  const d = deps();
  assertEquals((await handleTrack(d.deps, 'not json')).status, 400);
  assertEquals((await handleTrack(d.deps, JSON.stringify({ events: [] }))).status, 400);
  assertEquals((await handleTrack(d.deps, body([], { platform: 'toaster' }))).status, 400);
  assertEquals((await handleTrack(d.deps, 'x'.repeat(70_000))).status, 413);
  assertEquals((await handleTrack({ ...d.deps, write: () => Promise.reject(new Error('x')) }, body([ev('app.open')]))).status, 500);
  assertEquals(d.calls.length, 0);
});

Deno.test('空的一批不呼叫資料庫', async () => {
  const d = deps();
  assertEquals((await handleTrack(d.deps, body([]))).status, 204);
  assertEquals(d.calls.length, 0);
});

Deno.test('資料庫的 private.product_event_names() 和 TypeScript 的白名單一致', async () => {
  // 白名單用 create or replace 逐次更新：取最後一個定義它的 migration
  const dir = new URL('../../migrations/', import.meta.url);
  const files = [...Deno.readDirSync(dir)].map((f) => f.name).filter((n) => n.endsWith('.sql')).sort();
  let sql = '';
  for (const f of files) {
    const text = await Deno.readTextFile(new URL(f, dir));
    if (text.includes('function private.product_event_names()')) sql = text;
  }
  const body = /function private\.product_event_names\(\)[\s\S]*?select array\[([\s\S]*?)\]\s*\$\$/.exec(sql)?.[1] ?? '';
  const names = [...body.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
  assertEquals(names, [...TRACK_EVENT_NAMES].sort());
});
