import { assertEquals } from 'jsr:@std/assert@1';
import { checkInvite, hashToken, parseSignupBody, type InviteRow } from './invite.ts';

const NOW = new Date('2026-11-21T00:00:00Z');
const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  id: 'i', email: 'a@x.test', status: 'pending', type: 'account', expires_at: '2026-12-01T00:00:00Z', ...over,
});

Deno.test('hashToken 是小寫十六進位的 SHA-256', async () => {
  assertEquals(await hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

Deno.test('checkInvite', () => {
  assertEquals(checkInvite(invite(), ' A@X.test ', NOW), null);
  assertEquals(checkInvite(null, 'a@x.test', NOW), 'invalid_invite');
  assertEquals(checkInvite(invite({ status: 'revoked' }), 'a@x.test', NOW), 'invalid_invite');
  assertEquals(checkInvite(invite({ status: 'accepted' }), 'a@x.test', NOW), 'invite_used');
  assertEquals(checkInvite(invite({ expires_at: '2026-11-20T00:00:00Z' }), 'a@x.test', NOW), 'invite_expired');
  assertEquals(checkInvite(invite({ type: 'kitchen' }), 'a@x.test', NOW), 'invite_type_unsupported');
  assertEquals(checkInvite(invite(), 'b@x.test', NOW), 'email_mismatch');
});

const body = (over: Record<string, unknown> = {}) => ({
  token: 'x'.repeat(43), email: ' A@X.test ', password: 'longenough1', ...over,
});

Deno.test('parseSignupBody：正常與預設值', () => {
  const r = parseSignupBody(body());
  assertEquals(r.ok && r.value.email, 'a@x.test');
  assertEquals(r.ok && r.value.displayName, '我');
  assertEquals(r.ok && r.value.timezone, 'Asia/Taipei');
  assertEquals(r.ok && r.value.region, 'TW');
  const r2 = parseSignupBody(body({ displayName: ' 小美 ', timezone: 'America/Los_Angeles', region: 'US' }));
  assertEquals(r2.ok && [r2.value.displayName, r2.value.timezone, r2.value.region], ['小美', 'America/Los_Angeles', 'US']);
});

Deno.test('parseSignupBody：不合格的時區、地區、暱稱用預設值', () => {
  const r = parseSignupBody(body({ displayName: 'x'.repeat(21), timezone: 'Mars/Base', region: 'tw' }));
  assertEquals(r.ok && [r.value.displayName, r.value.timezone, r.value.region], ['我', 'Asia/Taipei', 'TW']);
});

Deno.test('parseSignupBody：錯誤', () => {
  assertEquals(parseSignupBody(null), { ok: false, error: 'invalid_request' });
  assertEquals(parseSignupBody(body({ token: 'short' })), { ok: false, error: 'invalid_invite' });
  assertEquals(parseSignupBody(body({ email: 'nope' })), { ok: false, error: 'invalid_request' });
  assertEquals(parseSignupBody(body({ password: 'short' })), { ok: false, error: 'weak_password' });
  assertEquals(parseSignupBody(body({ password: 'a'.repeat(73) })), { ok: false, error: 'weak_password' });
});
