import { describe, expect, it } from 'vitest';
import { inviteUrl, mailtoUrl, resetUrl, toAdminError } from './admin.ts';

describe('admin 連結與錯誤', () => {
  it('邀請與重設密碼連結的格式', () => {
    expect(inviteUrl('https://x.test', 'abc-_123')).toBe('https://x.test/invite/abc-_123');
    expect(resetUrl('https://x.test', 'abc-_123')).toBe('https://x.test/reset/abc-_123');
  });

  it('mailto 把收件人、主旨、內容都編碼', () => {
    const url = mailtoUrl('a+b@x.test', '邀請 你', '第一行\n連結：https://x.test/invite/t?x=1');
    expect(url.startsWith('mailto:a%2Bb%40x.test?subject=')).toBe(true);
    expect(url).toContain('%0A');
    expect(url).not.toContain(' ');
  });

  it('錯誤代號：認得的照原樣，沒見過的當 server_error', () => {
    expect(toAdminError({ error: 'invite_capacity' })).toBe('invite_capacity');
    expect(toAdminError({ error: 'weird' })).toBe('server_error');
    expect(toAdminError(null)).toBe('server_error');
  });
});
