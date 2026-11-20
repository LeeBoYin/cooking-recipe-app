import { describe, expect, it } from 'vitest';
import { readTakenAt } from './exif.ts';

// 組一個只有 EXIF 的最小 JPEG（little-endian）：IFD0 → Exif IFD → DateTimeOriginal
function jpegWithExif(date: string | null, tag = 0x9003): ArrayBuffer {
  const text = date === null ? '' : date + '\0';
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v & 0xff, v >> 8);
  const u32 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  tiff.push(0x49, 0x49);
  u16(42);
  u32(8);
  // IFD0 @8：1 個項目 → Exif IFD 指標
  u16(1);
  u16(0x8769);
  u16(4);
  u32(1);
  u32(26);
  u32(0);
  // Exif IFD @26
  if (date === null) {
    u16(0);
    u32(0);
  } else {
    u16(1);
    u16(tag);
    u16(2);
    u32(20);
    u32(44);
    u32(0);
    for (const ch of text) tiff.push(ch.charCodeAt(0));
  }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = exif.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...exif, 0xff, 0xda, 0, 2];
  return new Uint8Array(bytes).buffer;
}

describe('readTakenAt', () => {
  it('讀出拍攝時間（當地時間）', () => {
    const d = readTakenAt(jpegWithExif('2026:11:18 19:05:30'));
    expect(d).toEqual(new Date(2026, 10, 18, 19, 5, 30));
  });
  it('沒有 DateTimeOriginal 時用 DateTimeDigitized', () => {
    expect(readTakenAt(jpegWithExif('2026:01:02 03:04:05', 0x9004))).toEqual(new Date(2026, 0, 2, 3, 4, 5));
  });
  it('沒有拍攝時間回傳空值', () => {
    expect(readTakenAt(jpegWithExif(null))).toBeUndefined();
  });
  it('不是 JPEG 或內容壞掉也不會丟錯', () => {
    expect(readTakenAt(new Uint8Array([1, 2, 3]).buffer)).toBeUndefined();
    expect(readTakenAt(new ArrayBuffer(0))).toBeUndefined();
    expect(readTakenAt(jpegWithExif('2026:11:18 19:05:30').slice(0, 40))).toBeUndefined();
  });
  it('不合理的日期不採用', () => {
    expect(readTakenAt(jpegWithExif('0000:00:00 00:00:00'))).toBeUndefined();
  });
});
