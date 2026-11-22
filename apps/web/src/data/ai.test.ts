import { describe, expect, it } from 'vitest';
import { AiCallError, toAiError } from './ai.ts';

describe('ai 錯誤代號', () => {
  it('認得的照原樣，沒見過的當 server_error', () => {
    expect(toAiError({ error: 'rate_limited' })).toBe('rate_limited');
    expect(toAiError({ error: 'refused' })).toBe('refused');
    expect(toAiError({ error: 'something_new' })).toBe('server_error');
    expect(toAiError(null)).toBe('server_error');
    expect(toAiError('x')).toBe('server_error');
  });

  it('AiCallError 帶著錯誤代號', () => {
    expect(new AiCallError('over_limit').code).toBe('over_limit');
  });
});
