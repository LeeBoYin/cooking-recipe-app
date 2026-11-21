import { describe, expect, it } from 'vitest';
import { toInviteError } from './invite.ts';

describe('toInviteError', () => {
  it('認得後端回的錯誤代碼', () => {
    expect(toInviteError({ error: 'invite_expired' })).toBe('invite_expired');
    expect(toInviteError({ error: 'code_locked', lockedUntil: 'x' })).toBe('code_locked');
    expect(toInviteError({ error: 'weak_password' })).toBe('weak_password');
  });
  it('沒見過的、格式不對的都算 unknown', () => {
    expect(toInviteError({ error: 'server_error' })).toBe('unknown');
    expect(toInviteError(null)).toBe('unknown');
    expect(toInviteError('invalid_invite')).toBe('unknown');
  });
});
