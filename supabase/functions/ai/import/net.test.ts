import { assertEquals } from 'jsr:@std/assert@1';
import { fetchPage, type FetchDeps, FETCH_MAX_BYTES, isBlockedAddress, isBlockedHostname, parseFetchUrl } from './net.ts';

Deno.test('位址：內部網路與保留的 IPv4 都擋', () => {
  const blocked = [
    '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.1.2.3', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.5', '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.19.255.255', '198.51.100.7',
    '203.0.113.9', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
  ];
  for (const ip of blocked) assertEquals(isBlockedAddress(ip), true, ip);
  const open = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '192.169.0.1', '198.17.0.1', '198.20.0.1', '223.255.255.255'];
  for (const ip of open) assertEquals(isBlockedAddress(ip), false, ip);
});

Deno.test('位址：IPv6 只放行全球單播，內部與內嵌 IPv4 的形式都擋', () => {
  const blocked = [
    '::', '::1', '0:0:0:0:0:0:0:1', '::2', 'fe80::1', 'fe80::1%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1', '100::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:192.168.0.1',
    '64:ff9b::7f00:1', '64:ff9b::a00:1', '2001::1', '2001:1::1', '2001:db8::1', '2002:7f00:1::1', '::127.0.0.1',
  ];
  for (const ip of blocked) assertEquals(isBlockedAddress(ip), true, ip);
  const open = ['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001::200e', '::ffff:8.8.8.8', '64:ff9b::808:808'];
  for (const ip of open) assertEquals(isBlockedAddress(ip), false, ip);
});

Deno.test('位址：不是 IP 的字串不放行', () => {
  for (const s of ['', 'abc', '1.2.3', '1.2.3.4.5', '256.1.1.1', ':::', '1::2::3', 'g::1']) assertEquals(isBlockedAddress(s), true, s);
});

Deno.test('主機名稱：localhost、內網後綴與單一標籤都擋', () => {
  for (const h of ['localhost', 'LOCALHOST', 'foo.localhost', 'printer.local', 'db.internal', 'router.lan', 'intranet', 'metadata', 'localhost.']) {
    assertEquals(isBlockedHostname(h), true, h);
  }
  for (const h of ['example.com', 'www.example.co.uk', 'xn--fiq228c.tw']) assertEquals(isBlockedHostname(h), false, h);
});

Deno.test('網址格式：只允許 http／https、80／443、沒有帳號密碼', () => {
  assertEquals(parseFetchUrl('https://example.com/a?b=1')?.hostname, 'example.com');
  assertEquals(parseFetchUrl('  http://example.com:80/x ')?.hostname, 'example.com');
  assertEquals(parseFetchUrl('https://example.com:443/x')?.hostname, 'example.com');
  for (const u of ['', 'example.com', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://x.com', 'https://user:pw@example.com', 'https://user@example.com', 'https://example.com:8080', 'https://example.com:22', `https://example.com/${'a'.repeat(2000)}`]) {
    assertEquals(parseFetchUrl(u), null, u);
  }
});

Deno.test('網址是 IP 的各種寫法：URL 會正規化成點分十進位，仍然被擋', async () => {
  let fetched = 0;
  const deps: FetchDeps = { fetch: () => { fetched++; return Promise.resolve(new Response('x')); }, resolve: () => Promise.resolve(['93.184.216.34']) };
  for (const u of ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://0/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fe80::1]/', 'http://169.254.169.254/latest/meta-data', 'http://localhost/', 'http://10.1.2.3/', 'http://metadata/', 'http://a.localhost/']) {
    assertEquals(await fetchPage(u, deps), { ok: false, error: 'url_invalid' }, u);
  }
  assertEquals(fetched, 0);
});

const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const PUBLIC = '93.184.216.34';

Deno.test('網域名稱解析到內部位址（任何一個）就擋，解析不到也擋', async () => {
  let fetched = 0;
  const mk = (resolve: FetchDeps['resolve']): FetchDeps => ({ fetch: () => { fetched++; return Promise.resolve(html('ok')); }, resolve });
  assertEquals(await fetchPage('https://evil.example.com/', mk(() => Promise.resolve(['127.0.0.1']))), { ok: false, error: 'url_invalid' });
  assertEquals(await fetchPage('https://evil.example.com/', mk(() => Promise.resolve([PUBLIC, '10.0.0.5']))), { ok: false, error: 'url_invalid' });
  assertEquals(await fetchPage('https://evil.example.com/', mk(() => Promise.resolve(['::1']))), { ok: false, error: 'url_invalid' });
  assertEquals(await fetchPage('https://evil.example.com/', mk(() => Promise.resolve([]))), { ok: false, error: 'url_invalid' });
  assertEquals(await fetchPage('https://evil.example.com/', mk(() => Promise.reject(new Error('nxdomain')))), { ok: false, error: 'url_invalid' });
  assertEquals(fetched, 0);
});

Deno.test('成功：回傳內容與最後的網址', async () => {
  const deps: FetchDeps = { fetch: () => Promise.resolve(html('<p>hi</p>')), resolve: () => Promise.resolve([PUBLIC]) };
  assertEquals(await fetchPage('https://example.com/r', deps), { ok: true, html: '<p>hi</p>', finalUrl: 'https://example.com/r' });
});

Deno.test('重新導向：每一跳都檢查；導到內部位址、非 http、太多次都失敗', async () => {
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  const seen: string[] = [];
  const make = (steps: Record<string, Response | (() => Response)>, resolveMap: Record<string, string[]>): FetchDeps => ({
    fetch: (u) => {
      seen.push(u);
      const s = steps[u];
      return Promise.resolve(typeof s === 'function' ? s() : s);
    },
    resolve: (h) => Promise.resolve(resolveMap[h] ?? [PUBLIC]),
  });
  // 跳到網域名稱，但它解析到內部位址
  assertEquals(await fetchPage('https://a.com/', make({ 'https://a.com/': redirect('https://b.com/x') }, { 'b.com': ['192.168.0.9'] })), { ok: false, error: 'fetch_failed' });
  // 直接跳到內部 IP、metadata、非 http
  for (const to of ['http://127.0.0.1/admin', 'http://169.254.169.254/', 'file:///etc/passwd', 'ftp://x.com/', 'http://localhost:8080/']) {
    seen.length = 0;
    assertEquals(await fetchPage('https://a.com/', make({ 'https://a.com/': redirect(to) }, {})), { ok: false, error: 'fetch_failed' }, to);
    assertEquals(seen, ['https://a.com/'], `${to}：不該送出第二個請求`);
  }
  // 相對路徑的跳轉可以走
  const ok = await fetchPage('https://a.com/old', make({ 'https://a.com/old': redirect('/new'), 'https://a.com/new': () => html('done') }, {}));
  assertEquals(ok, { ok: true, html: 'done', finalUrl: 'https://a.com/new' });
  // 無限跳轉
  const loop = await fetchPage('https://a.com/', { fetch: () => Promise.resolve(redirect('https://a.com/')), resolve: () => Promise.resolve([PUBLIC]) });
  assertEquals(loop, { ok: false, error: 'fetch_failed' });
  // 沒有 location
  assertEquals(await fetchPage('https://a.com/', make({ 'https://a.com/': new Response(null, { status: 301 }) }, {})), { ok: false, error: 'fetch_failed' });
});

Deno.test('狀態碼與內容類型：要登入、被擋、不存在、不是網頁都算抓不到', async () => {
  const run = (res: Response) => fetchPage('https://a.com/', { fetch: () => Promise.resolve(res), resolve: () => Promise.resolve([PUBLIC]) });
  for (const status of [401, 403, 404, 429, 500, 503]) assertEquals(await run(new Response('x', { status, headers: { 'content-type': 'text/html' } })), { ok: false, error: 'fetch_failed' }, String(status));
  assertEquals(await run(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })), { ok: false, error: 'fetch_failed' });
  assertEquals(await run(new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })), { ok: false, error: 'fetch_failed' });
});

Deno.test('大小上限 2 MB：宣告太大或實際讀太多都失敗，剛好上限內可以', async () => {
  const run = (res: Response) => fetchPage('https://a.com/', { fetch: () => Promise.resolve(res), resolve: () => Promise.resolve([PUBLIC]) });
  assertEquals(await run(html('x', { 'content-length': String(FETCH_MAX_BYTES + 1) })), { ok: false, error: 'fetch_failed' });
  assertEquals(await run(html('a'.repeat(FETCH_MAX_BYTES + 1))), { ok: false, error: 'fetch_failed' }); // 沒有宣告長度（分塊傳送）也擋
  const edge = await run(html('a'.repeat(FETCH_MAX_BYTES)));
  assertEquals(edge.ok, true);
});

Deno.test('連線錯誤與逾時都算抓不到', async () => {
  const boom: FetchDeps = { fetch: () => Promise.reject(new TypeError('connection refused')), resolve: () => Promise.resolve([PUBLIC]) };
  assertEquals(await fetchPage('https://a.com/', boom), { ok: false, error: 'fetch_failed' });
  const slow: FetchDeps = {
    fetch: (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))),
    resolve: () => Promise.resolve([PUBLIC]),
  };
  const started = Date.now();
  assertEquals(await fetchPage('https://a.com/', slow), { ok: false, error: 'fetch_failed' });
  const elapsed = Date.now() - started;
  assertEquals(elapsed >= 9_500 && elapsed < 12_000, true, `逾時約 10 秒（實際 ${elapsed} ms）`);
});

Deno.test('請求只帶固定的標頭（不轉送使用者的任何憑證）', async () => {
  let headers: Record<string, string> = {};
  await fetchPage('https://a.com/', { fetch: (_u, init) => { headers = init.headers; return Promise.resolve(html('x')); }, resolve: () => Promise.resolve([PUBLIC]) });
  assertEquals(Object.keys(headers).sort(), ['accept', 'accept-language', 'user-agent']);
});
