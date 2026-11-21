import { describe, expect, it } from 'vitest';
import { AiCallError, aiFallbackOf, toAiError } from './ai.ts';

describe('ai 錯誤代號', () => {
  it('認得的照原樣，沒見過的當 server_error', () => {
    expect(toAiError({ error: 'rate_limited' })).toBe('rate_limited');
    expect(toAiError({ error: 'refused' })).toBe('refused');
    expect(toAiError({ error: 'something_new' })).toBe('server_error');
    expect(toAiError(null)).toBe('server_error');
    expect(toAiError('x')).toBe('server_error');
  });

  it('退路：速率與每日上限各有說法，其餘一律退回不用 AI 的推薦', () => {
    expect(aiFallbackOf('rate_limited')).toBe('slow_down');
    expect(aiFallbackOf('over_limit')).toBe('daily_limit');
    for (const code of ['budget_exhausted', 'refused', 'truncated', 'invalid_output', 'upstream_error', 'ai_disabled', 'ai_paused', 'network'] as const) {
      expect(aiFallbackOf(code)).toBe('use_rules');
    }
    expect(new AiCallError('over_limit').fallback).toBe('daily_limit');
  });
});
