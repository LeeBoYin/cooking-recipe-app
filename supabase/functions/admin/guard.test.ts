import { assertEquals } from 'jsr:@std/assert@1';
import { jwtClaims, mapDbError, parseRequest, uuidV7 } from './guard.ts';

function jwt(payload: unknown): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'none' })}.${enc(payload)}.sig`;
}

Deno.test('jwtClaims：讀出 sub 與 aal', () => {
  assertEquals(jwtClaims(`Bearer ${jwt({ sub: 'u1', aal: 'aal2' })}`)?.aal, 'aal2');
  assertEquals(jwtClaims(`bearer ${jwt({ sub: 'u1' })}`)?.aal, null);
  assertEquals(jwtClaims(null), null);
  assertEquals(jwtClaims('Bearer abc'), null);
  assertEquals(jwtClaims('Bearer a.%%%.c'), null);
});

Deno.test('uuidV7：格式與時間', () => {
  const id = uuidV7(0x0123456789ab);
  assertEquals(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), true);
  assertEquals(id.startsWith('01234567-89ab-7'), true);
});

const ID = '019a9f00-0000-7000-8000-000000000001';

Deno.test('parseRequest：產生邀請', () => {
  assertEquals(parseRequest({ action: 'create_invite', email: ' a@b.c ', note: ' hi ' }), {
    ok: true,
    value: { action: 'create_invite', email: 'a@b.c', note: 'hi', plan: 'free', befriendInviter: true },
  });
  assertEquals(parseRequest({ action: 'create_invite', email: 'nope' }).ok, false);
  assertEquals(parseRequest({ action: 'create_invite', email: 'a@b.c', plan: 'pro' }).ok, false);
  assertEquals(parseRequest({ action: 'create_invite', email: 'a@b.c', note: 'x'.repeat(101) }).ok, false);
  assertEquals(parseRequest({ action: 'create_invite', email: 'a@b.c', befriendInviter: 'yes' }).ok, false);
});

Deno.test('parseRequest：其他動作', () => {
  assertEquals(parseRequest({ action: 'list_users' }).ok, true);
  assertEquals(parseRequest({ action: 'revoke_invite', inviteId: 'x' }).ok, false);
  assertEquals(parseRequest({ action: 'revoke_invite', inviteId: ID }).ok, true);
  assertEquals(parseRequest({ action: 'extend_invite', inviteId: ID, days: 61 }).ok, false);
  assertEquals(parseRequest({ action: 'extend_invite', inviteId: ID, days: 7 }).ok, true);
  assertEquals(parseRequest({ action: 'set_user_status', userId: ID, status: 'banned' }).ok, false);
  assertEquals(parseRequest({ action: 'set_user_status', userId: ID, status: 'suspended' }).ok, true);
  assertEquals(parseRequest({ action: 'update_config' }).ok, false);
  assertEquals(parseRequest({ action: 'update_config', maxUsers: 0 }).ok, false);
  assertEquals(parseRequest({ action: 'update_config', maxUsers: 40 }).ok, true);
  assertEquals(parseRequest({ action: 'list_audit_logs', limit: 500 }).ok, false);
  assertEquals(parseRequest({ action: 'list_audit_logs', before: 'not a date' }).ok, false);
  assertEquals(parseRequest({ action: 'read_recipes' }).ok, false);
  assertEquals(parseRequest(null).ok, false);
});

Deno.test('mapDbError', () => {
  assertEquals(mapDbError('invite_capacity'), { error: 'invite_capacity', status: 409 });
  assertEquals(mapDbError('boom with private data'), { error: 'server_error', status: 500 });
  assertEquals(mapDbError(undefined), { error: 'server_error', status: 500 });
});
