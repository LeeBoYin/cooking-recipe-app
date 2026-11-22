import { describe, expect, it, vi } from 'vitest';

const track = vi.fn();
vi.mock('./track.ts', () => ({ track }));
const { trackAiError, trackErrorKind } = await import('./trackError.ts');

describe('error 事件只分 4 類', () => {
  it('AI：被擋下與沒網路才記，額度與速率不記', () => {
    track.mockClear();
    for (const code of ['refused', 'truncated', 'invalid_output', 'network', 'rate_limited', 'over_limit', 'server_error']) trackAiError(code);
    expect(track.mock.calls.map((c) => c[1])).toEqual([{ kind: 'ai_blocked' }, { kind: 'ai_blocked' }, { kind: 'ai_blocked' }, { kind: 'network' }]);
  });
  it('儲存失敗：network 與權限才記', () => {
    track.mockClear();
    for (const kind of ['network', 'pg_42501', 'pg_23505', 'recipe_stale']) trackErrorKind(kind);
    expect(track.mock.calls.map((c) => c[1])).toEqual([{ kind: 'network' }, { kind: 'permission' }]);
  });
});
