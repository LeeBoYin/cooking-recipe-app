import { describe, expect, it } from 'vitest';
import { TRACK_MAX_BATCH, validateBatch, validateEvent, type TrackProps } from './events.ts';

const NOW = Date.parse('2026-11-22T02:00:00Z');
const S = '01234567-89ab-cdef-0123-456789abcdef';
const ev = (name: string, extra: Record<string, unknown> = {}) => ({ name, sessionId: S, at: '2026-11-22T01:59:00Z', ...extra });

describe('validateEvent', () => {
  it('白名單的事件與屬性通過', () => {
    expect(validateEvent(ev('app.open'), NOW)?.name).toBe('app.open');
    expect(validateEvent(ev('record.start', { props: { entry: 'plus' }, screen: 'record' }), NOW)).toMatchObject({ props: { entry: 'plus' }, screen: 'record' });
    expect(validateEvent(ev('record.publish', { props: { photoCount: 3, hasSteps: true, visibility: 'private', highlightCount: 0 } }), NOW)).not.toBeNull();
  });

  it('靈感彩蛋用 suggestion 事件、來源是 egg；沒見過的來源被擋', () => {
    expect(validateEvent(ev('suggestion.shown', { props: { source: 'egg', slot: 'twist' } }), NOW)).not.toBeNull();
    expect(validateEvent(ev('suggestion.opened', { props: { source: 'egg', slot: 'twist' } }), NOW)).not.toBeNull();
    expect(validateEvent(ev('suggestion.shown', { props: { source: 'push', slot: 'twist' } }), NOW)).toBeNull();
  });

  it('不在白名單的名稱、已拿掉的事件被擋', () => {
    expect(validateEvent(ev('app.hack'), NOW)).toBeNull();
    expect(validateEvent(ev('suggestion.dismissed', { props: { source: 'home', slot: 'familiar' } }), NOW)).toBeNull();
    expect(validateEvent(ev('constructor'), NOW)).toBeNull();
    expect(validateEvent(ev('__proto__'), NOW)).toBeNull();
  });

  it('屬性：列舉值要在清單內、數字要是範圍內的整數、不能多給也不能少給、不能是自由文字', () => {
    expect(validateEvent(ev('record.start', { props: { entry: '我的食譜很好吃' } }), NOW)).toBeNull();
    expect(validateEvent(ev('record.start', { props: {} }), NOW)).toBeNull();
    expect(validateEvent(ev('record.start'), NOW)).toBeNull();
    expect(validateEvent(ev('record.start', { props: { entry: 'plus', title: '麻婆豆腐' } }), NOW)).toBeNull();
    expect(validateEvent(ev('app.open', { props: { title: '麻婆豆腐' } }), NOW)).toBeNull();
    expect(validateEvent(ev('chat.message_sent', { props: { turn: 1.5 } }), NOW)).toBeNull();
    expect(validateEvent(ev('chat.message_sent', { props: { turn: -1 } }), NOW)).toBeNull();
    expect(validateEvent(ev('chat.message_sent', { props: { turn: 101 } }), NOW)).toBeNull();
    expect(validateEvent(ev('chat.message_sent', { props: { turn: '2' } }), NOW)).toBeNull();
  });

  it('screen 只能是固定清單；sessionId 要是 UUID；時間要合理', () => {
    expect(validateEvent(ev('app.open', { screen: '/recipes/123' }), NOW)).toBeNull();
    expect(validateEvent({ ...ev('app.open'), sessionId: 'abc' }, NOW)).toBeNull();
    expect(validateEvent(ev('app.open', { at: '2026-11-22T03:00:00Z' }), NOW)).toBeNull();
    expect(validateEvent(ev('app.open', { at: '2026-11-20T01:00:00Z' }), NOW)).toBeNull();
    expect(validateEvent(ev('app.open', { at: 'yesterday' }), NOW)).toBeNull();
    expect(validateEvent('app.open', NOW)).toBeNull();
    expect(validateEvent(null, NOW)).toBeNull();
  });

  it('整理後只留白名單的欄位', () => {
    const out = validateEvent({ ...ev('app.open'), userId: 'x', extra: 1 }, NOW);
    expect(Object.keys(out ?? {}).sort()).toEqual(['at', 'name', 'sessionId']);
  });
});

describe('validateBatch', () => {
  const base = { appVersion: '0.1.0', platform: 'ios', installed: false };
  it('丟掉不合格的、其他照收', () => {
    const r = validateBatch({ ...base, events: [ev('app.open'), ev('nope'), 5] }, NOW);
    expect(r?.batch.events).toHaveLength(1);
    expect(r?.dropped).toBe(2);
  });
  it('超過一批上限的算丟掉', () => {
    const r = validateBatch({ ...base, events: Array.from({ length: TRACK_MAX_BATCH + 4 }, () => ev('app.open')) }, NOW);
    expect(r?.batch.events).toHaveLength(TRACK_MAX_BATCH);
    expect(r?.dropped).toBe(4);
  });
  it('整批欄位不合格回 null', () => {
    expect(validateBatch({ ...base, platform: 'x', events: [] }, NOW)).toBeNull();
    expect(validateBatch({ ...base, appVersion: '', events: [] }, NOW)).toBeNull();
    expect(validateBatch({ ...base, installed: 'yes', events: [] }, NOW)).toBeNull();
    expect(validateBatch({ ...base, events: 'x' }, NOW)).toBeNull();
    expect(validateBatch(null, NOW)).toBeNull();
  });
});

describe('型別', () => {
  it('屬性型別由白名單推導（送錯會在型別檢查被擋）', () => {
    const ok: TrackProps<'record.start'> = { entry: 'plus' };
    // @ts-expect-error 列舉以外的值
    const bad: TrackProps<'record.start'> = { entry: 'free text' };
    expect([ok, bad]).toHaveLength(2);
  });
});
