// 食材是自由文字（「醬油 2 大匙」）。這裡把文字裡的數量找出來，依份量倍率與單位偏好換算後組回文字。
// 解析不出來就原樣顯示；「適量」「少許」這類沒有數字的不動。只處理第一種寫法能確定的數字，不猜。
import { formatQuantity, roundedText, type MeasurePref, type UnitCode, type UnitLabels } from './units.ts';

// 使用者會打的單位寫法（拉丁字母不分大小寫）。「斤」照台灣的 600 克
const UNIT_ALIASES: ReadonlyArray<readonly [UnitCode, readonly string[]]> = [
  ['g', ['g', '克', '公克', 'gram', 'grams']],
  ['kg', ['kg', '公斤']],
  ['oz', ['oz', '盎司']],
  ['lb', ['lb', 'lbs', '磅']],
  ['tw_jin', ['台斤', '斤']],
  ['tw_liang', ['兩']],
  ['ml', ['ml', '毫升', 'cc']],
  ['l', ['l', '公升', '升']],
  ['tsp', ['tsp', '茶匙', '小匙', '小湯匙']],
  ['tbsp', ['tbsp', '大匙', '湯匙', '大湯匙']],
  ['cup', ['cup', 'cups', '量杯', '杯']],
  ['rice_cup', ['米杯']],
  ['fl_oz', ['fl oz', 'fl. oz', '液量盎司']],
  ['qt', ['qt', '夸脫']],
  ['cm', ['cm', '公分']],
  ['inch', ['inch', 'inches', '吋', '英吋']],
];

const UNIT_LOOKUP: ReadonlyArray<readonly [string, UnitCode]> = UNIT_ALIASES.flatMap(
  ([code, names]) => names.map((n): readonly [string, UnitCode] => [n, code]),
).sort((a, b) => b[0].length - a[0].length);

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛]|\d+(?:\.\d+)?\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅛]|半)`;
const NUMBER_RE = new RegExp(String.raw`(?<![A-Za-z0-9./])(${NUM})(?:\s*[-–—~～至到]\s*(${NUM}))?`, 'gu');

const GLYPHS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

function numberValue(text: string): number {
  const t = text.trim();
  if (t === '半') return 0.5;
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\s*([½⅓⅔¼¾⅛])$/.exec(t);
  if (m) return Number(m[1]) + (GLYPHS[m[2] as string] as number);
  m = /^(\d+(?:\.\d+)?)\/(\d+)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  return GLYPHS[t] ?? Number(t);
}

function matchUnit(rest: string): { code: UnitCode; text: string; length: number } | null {
  const lower = rest.toLowerCase();
  for (const [name, code] of UNIT_LOOKUP) {
    if (!lower.startsWith(name)) continue;
    // 拉丁字母的單位後面不能還接字母（例：「g」不能吃掉「garlic」）
    if (/[a-z]$/.test(name) && /^[a-z]/.test(lower.slice(name.length))) continue;
    return { code, text: rest.slice(0, name.length), length: name.length };
  }
  return null;
}

export type QuantityToken = {
  kind: 'quantity';
  raw: string; // 原文（含單位）
  amount: number;
  amountMax?: number;
  unit?: UnitCode; // 沒有：單位換算不了（顆、瓣、片…）或根本沒單位
  unitText: string;
};
export type IngredientSegment = string | QuantityToken;

// 把一行食材文字切成「文字」和「數量」。有單位的數量全部換算；沒有任何單位時，只算最後一個數字（例：「雞蛋 2」「蒜 2–3 瓣」）
export function parseIngredient(text: string): IngredientSegment[] {
  const found: Array<{ start: number; end: number; token: QuantityToken }> = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const start = m.index;
    let end = start + m[0].length;
    const amount = numberValue(m[1] as string);
    const amountMax = m[2] === undefined ? undefined : numberValue(m[2]);
    if (!Number.isFinite(amount) || (amountMax !== undefined && !Number.isFinite(amountMax))) continue;
    const gap = /^\s*/.exec(text.slice(end))?.[0] ?? '';
    const unit = matchUnit(text.slice(end + gap.length));
    const token: QuantityToken = { kind: 'quantity', raw: m[0], amount, unitText: '' };
    if (amountMax !== undefined) token.amountMax = amountMax;
    if (unit) {
      end += gap.length + unit.length;
      token.raw = text.slice(start, end);
      token.unit = unit.code;
      token.unitText = unit.text;
    }
    found.push({ start, end, token });
  }
  let use = found.filter((f) => f.token.unit);
  if (use.length === 0) {
    // 沒單位的數字：只認結尾的（或後面接中文單位字的），避開「7-Up」這類名字
    const last = found.filter((f) => !/^[A-Za-z0-9-]/.test(text.slice(f.end))).at(-1);
    use = last ? [last] : [];
  }
  const out: IngredientSegment[] = [];
  let at = 0;
  for (const f of use) {
    if (f.start > at) out.push(text.slice(at, f.start));
    out.push(f.token);
    at = f.end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

// 依倍率與單位偏好組回一行文字。倍率 1 且單位沒變就是原文
export function renderIngredient(
  text: string,
  opts: { factor: number; pref: MeasurePref; labels: UnitLabels },
): string {
  const segments = parseIngredient(text);
  const hasMeasure = segments.filter((s) => typeof s !== 'string').length;
  return segments
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s.unit) {
        return formatQuantity(
          { amount: s.amount, amountMax: s.amountMax, unit: s.unit, unitText: s.unitText, raw: s.raw },
          opts.factor,
          // 一行裡有好幾個數量（例：「半斤（300 克）」）時不加另一種單位，免得重複
          hasMeasure > 1 ? { ...opts.pref, both: false } : opts.pref,
          opts.labels,
          hasMeasure === 1,
        );
      }
      // 沒單位的數量（個、瓣…）：只跟著份量放大縮小
      if (opts.factor === 1) return s.raw;
      return scaleCount(s, opts.factor);
    })
    .join('');
}

function scaleCount(s: QuantityToken, factor: number): string {
  const a = roundedText(s.amount * factor, null);
  if (s.amountMax === undefined) return a;
  const b = roundedText(s.amountMax * factor, null);
  return a === b ? a : `${a}–${b}`;
}

// 一行食材裡「是什麼食材」的部分（拿掉數量），用來和廚房的食材比對
export function ingredientName(text: string): string {
  return parseIngredient(text)
    .filter((s): s is string => typeof s === 'string')
    .join('')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 這行食材是不是廚房有的。優先看標準食材 ID；文字就要完全相同，或較長的名字（兩個字以上）包含廚房的名字。
// 寧可少標：單一個字（蛋、薑、蒜）只認完全相同，免得「薑黃粉」被當成「薑」
export function haveInKitchen(
  line: { text: string; ingredientId?: string | undefined },
  kitchen: { ingredientIds: ReadonlySet<string>; names: readonly string[] },
): boolean {
  if (line.ingredientId && kitchen.ingredientIds.has(line.ingredientId)) return true;
  const name = ingredientName(line.text).toLowerCase();
  if (!name) return false;
  return kitchen.names.some((n) => {
    const k = n.trim().toLowerCase();
    if (!k) return false;
    if (name === k) return true;
    return [...k].length >= 2 && name.includes(k);
  });
}
