import { assertEquals } from 'jsr:@std/assert@1';
import {
  checkInvite,
  checkInviteState,
  clientIp,
  CODE_ALPHABET,
  generateInviteCode,
  hashCode,
  hashSource,
  hashToken,
  normalizeCode,
  parseAction,
  parseOpenBody,
  parseRedeemBody,
  parseResetBody,
  parseSignupBody,
  type InviteRow,
} from './invite.ts';

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

Deno.test('parseSignupBody：地區認得國碼加子區（US-CA），其他格式退回預設', () => {
  const region = (v: string) => {
    const r = parseSignupBody(body({ displayName: 'x', region: v }));
    return r.ok ? r.value.region : null;
  };
  assertEquals(['US-CA', 'JP', 'US-CA1'].map(region), ['US-CA', 'JP', 'US-CA1']);
  assertEquals(['us-ca', 'US-', 'USA', 'US-CALI', ''].map(region), ['TW', 'TW', 'TW', 'TW', 'TW']);
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

Deno.test('parseAction：沒填當作 signup', () => {
  assertEquals(parseAction({}), 'signup');
  assertEquals(parseAction({ action: 'open' }), 'open');
  assertEquals(parseAction({ action: 'redeem_code' }), 'redeem_code');
  assertEquals(parseAction({ action: 'reset_password' }), 'reset_password');
  assertEquals(parseAction({ action: 'nope' }), null);
  assertEquals(parseAction(null), null);
});

Deno.test('generateInviteCode：6 碼、只用字母表、拒絕取樣', () => {
  for (let i = 0; i < 200; i++) {
    const c = generateInviteCode();
    assertEquals(c.length, 6);
    assertEquals([...c].every((ch) => CODE_ALPHABET.includes(ch)), true);
  }
  // 255 超過上限（248）會被丟掉，只取前面的合格位元組
  const bytes = [255, 254, 0, 1, 2, 3, 4, 5, 250, 31];
  let used = 0;
  const c = generateInviteCode((n) => {
    used++;
    return used === 1 ? new Uint8Array(bytes.concat(Array(n - bytes.length).fill(255))) : new Uint8Array(n).fill(0);
  });
  assertEquals(c, [0, 1, 2, 3, 4, 5].map((i) => CODE_ALPHABET[i]).join(''));
});

Deno.test('normalizeCode：容許空白、連字號與小寫', () => {
  assertEquals(normalizeCode('k7q 2mx'), 'K7Q2MX');
  assertEquals(normalizeCode(' K7Q-2MX '), 'K7Q2MX');
  assertEquals(normalizeCode('K7Q2M'), null);
  assertEquals(normalizeCode('K7Q2MXX'), null);
  assertEquals(normalizeCode('K7Q2M0'), null); // 0、O、1、I、L 不在字母表
  assertEquals(normalizeCode(123456), null);
  assertEquals(normalizeCode(undefined), null);
});

Deno.test('hashCode 與 hashSource 彼此、與 hashToken 都不同', async () => {
  const [a, b, c] = [await hashCode('K7Q2MX'), await hashSource('K7Q2MX'), await hashToken('K7Q2MX')];
  assertEquals(new Set([a, b, c]).size, 3);
  assertEquals(/^[0-9a-f]{64}$/.test(a), true);
});

Deno.test('clientIp：優先 cf-connecting-ip，其次 x-forwarded-for 第一個，最後 unknown', () => {
  assertEquals(clientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4');
  assertEquals(clientIp(new Headers({ 'x-forwarded-for': ' 5.6.7.8 , 10.0.0.1' })), '5.6.7.8');
  assertEquals(clientIp(new Headers()), 'unknown');
});

Deno.test('parseSignupBody：邀請碼與連結 token 擇一', () => {
  const r = parseSignupBody({ code: 'k7q 2mx', email: 'a@x.test', password: 'longenough1' });
  assertEquals(r.ok && r.value.code, 'K7Q2MX');
  assertEquals(r.ok && r.value.token, undefined);
  assertEquals(parseSignupBody({ code: 'bad', email: 'a@x.test', password: 'longenough1' }), { ok: false, error: 'invalid_invite' });
  assertEquals(parseSignupBody({ email: 'a@x.test', password: 'longenough1' }), { ok: false, error: 'invalid_invite' });
});

Deno.test('parseOpenBody、parseRedeemBody、parseResetBody', () => {
  assertEquals(parseOpenBody({ token: 'x'.repeat(43) }), { ok: true, token: 'x'.repeat(43) });
  assertEquals(parseOpenBody({ token: 'short' }), { ok: false, error: 'invalid_invite' });
  assertEquals(parseRedeemBody({ code: 'k7q-2mx' }), { ok: true, code: 'K7Q2MX' });
  assertEquals(parseRedeemBody({ code: '' }), { ok: false, error: 'invalid_code' });
  assertEquals(parseResetBody({ token: 'x'.repeat(43), password: 'longenough1' }), { ok: true, token: 'x'.repeat(43), password: 'longenough1' });
  assertEquals(parseResetBody({ token: 'short', password: 'longenough1' }), { ok: false, error: 'invalid_link' });
  assertEquals(parseResetBody({ token: 'x'.repeat(43), password: 'short' }), { ok: false, error: 'weak_password' });
});

Deno.test('checkInviteState 不看 email', () => {
  assertEquals(checkInviteState(invite(), NOW), null);
  assertEquals(checkInviteState(invite({ status: 'accepted' }), NOW), 'invite_used');
  assertEquals(checkInviteState(null, NOW), 'invalid_invite');
});
