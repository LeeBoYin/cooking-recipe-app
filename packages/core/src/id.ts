// 資料的 ID 由手機產生，用 UUID v7：前 48 位是毫秒時間，依時間排序，索引比較有效率。
// 只用 Web Crypto 的 getRandomValues，瀏覽器、Deno、Node 都有。
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function newId(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  let time = Math.floor(now);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f); // 版本 7
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC 9562 的變體

  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[bytes[i]!];
  }
  return out;
}
