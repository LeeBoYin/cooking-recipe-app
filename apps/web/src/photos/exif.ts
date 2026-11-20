// 轉檔前先讀出拍攝時間：重新編碼會拿掉 EXIF（含 GPS），所以要先讀。
// 只讀 JPEG 的 DateTimeOriginal（iPhone 選照片時系統會先轉成 JPEG），其他格式回傳空值。
// 拍攝時間是當地時間、沒有時區，這裡當成使用者裝置的當地時間。

export function readTakenAt(buffer: ArrayBuffer): Date | undefined {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return undefined;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) return undefined; // 影像資料開始，不會再有 EXIF
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && isExif(view, offset + 4)) {
      return parseTiff(view, offset + 10);
    }
    offset += 2 + size;
  }
  return undefined;
}

function isExif(view: DataView, at: number): boolean {
  if (at + 6 > view.byteLength) return false;
  return (
    view.getUint32(at) === 0x45786966 && // "Exif"
    view.getUint16(at + 4) === 0
  );
}

function parseTiff(view: DataView, base: number): Date | undefined {
  if (base + 8 > view.byteLength) return undefined;
  const order = view.getUint16(base);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return undefined;
  const u16 = (o: number) => view.getUint16(base + o, little);
  const u32 = (o: number) => view.getUint32(base + o, little);
  const inRange = (o: number, n: number) => base + o + n <= view.byteLength;

  // 在一個 IFD 裡找標籤，回傳該項目的位置
  function findTag(ifd: number, tag: number): number | undefined {
    if (!inRange(ifd, 2)) return undefined;
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (!inRange(entry, 12)) return undefined;
      if (u16(entry) === tag) return entry;
    }
    return undefined;
  }

  const ifd0 = u32(4);
  const exifPointer = findTag(ifd0, 0x8769);
  if (exifPointer === undefined) return undefined;
  const exifIfd = u32(exifPointer + 8);

  // DateTimeOriginal（0x9003），沒有時退而用 DateTimeDigitized（0x9004）
  const entry = findTag(exifIfd, 0x9003) ?? findTag(exifIfd, 0x9004);
  if (entry === undefined || u16(entry + 2) !== 2 || u32(entry + 4) !== 20) return undefined;
  const valueOffset = u32(entry + 8);
  if (!inRange(valueOffset, 19)) return undefined;

  let text = '';
  for (let i = 0; i < 19; i++) text += String.fromCharCode(view.getUint8(base + valueOffset + i));
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number];
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return new Date(y, mo - 1, d, h, mi, s);
}
