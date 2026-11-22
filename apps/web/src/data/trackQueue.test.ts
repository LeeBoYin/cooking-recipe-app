import { describe, expect, it } from 'vitest';
import { QUEUE_LIMIT, SESSION_IDLE_MS, createTracker } from './trackQueue.ts';
import type { TrackWireEvent } from '@zhusha/core';

function setup(sendImpl?: (e: TrackWireEvent[]) => Promise<unknown>) {
  const state = { now: 1_000_000, id: 0, sent: [] as TrackWireEvent[][] };
  const tracker = createTracker({
    now: () => state.now,
    newId: () => `s${++state.id}`,
    send: sendImpl ?? ((events) => (state.sent.push(events), Promise.resolve(true))),
  });
  return { state, tracker };
}

describe('批次', () => {
  it('一批最多 50 個，剩下的留到下一批', async () => {
    const { state, tracker } = setup();
    for (let i = 0; i < 120; i++) tracker.track('chat.start');
    await tracker.flush();
    expect(state.sent.map((b) => b.length)).toEqual([50]);
    expect(tracker.pending()).toBe(70);
    await tracker.flush();
    await tracker.flush();
    expect(state.sent.map((b) => b.length)).toEqual([50, 50, 20]);
  });

  it('空的時候不送', async () => {
    const { state, tracker } = setup();
    await tracker.flush();
    expect(state.sent).toEqual([]);
  });

  it('送不出去就丟掉，不重試', async () => {
    let calls = 0;
    const { tracker } = setup(() => {
      calls++;
      return Promise.reject(new Error('offline'));
    });
    tracker.track('chat.start');
    await tracker.flush();
    expect(tracker.pending()).toBe(0);
    await tracker.flush();
    expect(calls).toBe(1);
  });

  it('記憶體裡的佇列有上限，丟最舊的', () => {
    const { tracker } = setup();
    for (let i = 0; i < QUEUE_LIMIT + 30; i++) tracker.track('chat.start');
    expect(tracker.pending()).toBe(QUEUE_LIMIT);
  });

  it('事件帶屬性與目前的畫面；沒屬性就不帶', async () => {
    const { state, tracker } = setup();
    tracker.setScreen('home');
    tracker.track('suggestion.opened', { source: 'home', slot: 'familiar' });
    await tracker.flush();
    expect(state.sent[0]?.map((e) => [e.name, e.screen, e.props])).toEqual([
      ['screen.view', 'home', undefined],
      ['suggestion.opened', 'home', { source: 'home', slot: 'familiar' }],
    ]);
  });
});

describe('換頁', () => {
  it('同一個畫面 0.5 秒內重複只記一次，隔久了或換畫面照記', async () => {
    const { state, tracker } = setup();
    tracker.setScreen('home');
    tracker.setScreen('home');
    state.now += 600;
    tracker.setScreen('home');
    tracker.setScreen('me');
    await tracker.flush();
    expect(state.sent[0]?.map((e) => e.screen)).toEqual(['home', 'home', 'me']);
  });
});

describe('session', () => {
  it('30 分鐘內同一個，超過就換新的', async () => {
    const { state, tracker } = setup();
    tracker.track('chat.start');
    state.now += SESSION_IDLE_MS - 1;
    tracker.track('chat.start');
    state.now += SESSION_IDLE_MS - 1; // 距離上一次動作還沒超過 30 分鐘
    tracker.track('chat.start');
    state.now += SESSION_IDLE_MS + 1;
    tracker.track('chat.start');
    await tracker.flush();
    expect(state.sent[0]?.map((e) => e.sessionId)).toEqual(['s1', 's1', 's1', 's2']);
  });

  it('回到前景：30 分鐘內不記 app.open，超過才記', async () => {
    const { state, tracker } = setup();
    tracker.foreground(); // 第一次打開
    state.now += 10 * 60_000;
    tracker.foreground();
    state.now += SESSION_IDLE_MS + 1;
    tracker.foreground();
    await tracker.flush();
    expect(state.sent[0]?.map((e) => [e.name, e.sessionId])).toEqual([
      ['app.open', 's1'],
      ['app.open', 's2'],
    ]);
  });
});
