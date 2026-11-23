// 從網址匯入：安全地抓一個網頁（04 ADR-05〈從網址匯入〉）。
// 只允許 http／https 的 80／443 埠、不帶帳號密碼；擋內部網路與保留位址（網址是 IP 時直接檢查，是網域名稱時先解析 DNS 再檢查每一個位址）；
// 重新導向每一跳都重新檢查；逾時 10 秒、內容上限 2 MB、只收 HTML。不執行網頁的程式。
// 已知的限制：解析後的位址無法釘住給 fetch 用，DNS 在檢查與連線之間被換掉（DNS rebinding）理論上擋不住；
// 這個函式沒有任何內部服務的憑證可偷，回應也只取食譜文字，風險可接受。
// 純 TypeScript，網路相關（fetch、DNS）都由外面傳進來，單元測試用假的。

export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 5;
export const URL_MAX_CHARS = 2000;

export type FetchFailure =
  | 'url_invalid' // 不是可以抓的網址（格式、通訊協定、內部位址、埠）
  | 'fetch_failed'; // 抓不到（逾時、被擋、要登入、太大、不是網頁、連不上）

export type FetchResult = { ok: true; html: string; finalUrl: string } | { ok: false; error: FetchFailure };

export interface FetchDeps {
  fetch(url: string, init: { signal: AbortSignal; redirect: 'manual'; headers: Record<string, string> }): Promise<Response>;
  // 回傳這個網域名稱解析到的所有 IPv4 與 IPv6 位址（解析不到回空陣列或丟出錯誤）
  resolve(hostname: string): Promise<string[]>;
}

// ---- 位址檢查 ----

function parseIpv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

function blockedIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || //                          0.0.0.0/8 本機網路
    a === 10 || //                         10.0.0.0/8 私有
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 電信業者 NAT
    a === 127 || //                        回送
    (a === 169 && b === 254) || //         169.254.0.0/16 link-local（含雲端 metadata）
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 私有
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0.0/24、192.0.2.0/24
    (a === 192 && b === 88 && c === 99) || //            6to4 中繼
    (a === 192 && b === 168) || //         192.168.0.0/16 私有
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 測試
    (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 文件範例
    (a === 203 && b === 0 && c === 113) || //  203.0.113.0/24 文件範例
    a >= 224 //                            多播、保留、廣播
  );
}

// 把 IPv6 字串展開成 8 個 16 位元的數字；格式不對回 null。結尾的 a.b.c.d 轉成兩組
function parseIpv6(raw: string): number[] | null {
  let s = raw.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const lastColon = s.lastIndexOf(':');
  if (lastColon < 0) return null;
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...rest];
}

function blockedIpv6(g: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = g;
  const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  const zeros5 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (zeros5 && g5 === 0) return true; //                        ::、::1、相容 IPv4 的 ::a.b.c.d
  if (zeros5 && g5 === 0xffff) return blockedIpv4(embedded); //  ::ffff:a.b.c.d（IPv4 對映）
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return blockedIpv4(embedded); // 64:ff9b::/96（NAT64）
  if ((g0 & 0xe000) !== 0x2000) return true; //                  只放行全球單播 2000::/3，其餘（fc00::/7、fe80::/10、ff00::/8、100::/64…）都擋
  if (g0 === 0x2001 && g1 < 0x200) return true; //               2001::/23（含 Teredo、基準測試）
  if (g0 === 0x2001 && g1 === 0xdb8) return true; //             2001:db8::/32 文件範例
  if (g0 === 0x2002) return true; //                             2002::/16（6to4，內含 IPv4）
  return false;
}

// 是不是不能連的位址（內部網路、保留、多播…）；不是 IP 位址的字串回 true（不放行）
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return blockedIpv4(v4);
  const v6 = parseIpv6(ip);
  return v6 ? blockedIpv6(v6) : true;
}

// 主機名稱本身就不能連（不必解析）：localhost、內網用的後綴、沒有句點的單一標籤
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (h === '' || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home') || h.endsWith('.corp') || h.endsWith('.intranet')) return true;
  return !h.includes('.') && !h.includes(':'); // 單一標籤（例：intranet、metadata）
}

// 網址是不是可以抓（格式層面）；回傳解析好的 URL
export function parseFetchUrl(raw: string): URL | null {
  if (raw.length === 0 || raw.length > URL_MAX_CHARS) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.port !== '' && url.port !== '80' && url.port !== '443') return null;
  return url;
}

// 一個網址能不能連：格式、主機名稱、IP 或解析出來的每個位址。解析不到也算不能連
async function checkHost(url: URL, deps: FetchDeps): Promise<boolean> {
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const literal = parseIpv4(host) !== null || host.includes(':');
  if (literal) return !isBlockedAddress(host);
  if (isBlockedHostname(host)) return false;
  let addresses: string[];
  try {
    addresses = await deps.resolve(host);
  } catch {
    return false;
  }
  return addresses.length > 0 && addresses.every((a) => !isBlockedAddress(a));
}

// ---- 抓取 ----

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const length = Number(res.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > maxBytes) return null;
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  // 網頁的字元編碼：先看 Content-Type，沒有就當 UTF-8（不認得的編碼名稱也退回 UTF-8）
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(all);
  } catch {
    return new TextDecoder('utf-8').decode(all);
  }
}

export async function fetchPage(rawUrl: string, deps: FetchDeps): Promise<FetchResult> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS); // 整個流程（含所有跳轉與讀取）共用 10 秒
  let url = parseFetchUrl(rawUrl);
  if (!url) return { ok: false, error: 'url_invalid' };
  try {
    for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
      if (!(await checkHost(url, deps))) return { ok: false, error: hop === 0 ? 'url_invalid' : 'fetch_failed' };
      const res = await deps.fetch(url.toString(), {
        signal,
        redirect: 'manual',
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; RecipeImport/1.0)', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel();
        if (!location) return { ok: false, error: 'fetch_failed' };
        let next: URL | null;
        try {
          next = parseFetchUrl(new URL(location, url).toString());
        } catch {
          next = null;
        }
        if (!next) return { ok: false, error: 'fetch_failed' };
        url = next;
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        await res.body?.cancel();
        return { ok: false, error: 'fetch_failed' }; // 401／403（要登入或被擋）、404、5xx…
      }
      const type = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml')) {
        await res.body?.cancel();
        return { ok: false, error: 'fetch_failed' };
      }
      const html = await readCapped(res, FETCH_MAX_BYTES);
      if (html === null) return { ok: false, error: 'fetch_failed' };
      return { ok: true, html, finalUrl: url.toString() };
    }
    return { ok: false, error: 'fetch_failed' }; // 跳轉太多次
  } catch {
    return { ok: false, error: 'fetch_failed' }; // 逾時、連不上、憑證錯誤
  }
}
