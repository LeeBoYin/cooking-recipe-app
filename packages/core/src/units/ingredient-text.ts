// 食材是自由文字（「醬油 2 大匙」）。這裡把文字裡的數量找出來，依份量倍率與單位偏好換算後組回文字。
// 解析不出來就原樣顯示；「適量」「少許」這類沒有數字的不動。只處理第一種寫法能確定的數字，不猜。
import { formatQuantity, isMeasureUnit, roundedText, type MeasurePref, type UnitCode, type UnitLabels } from './units.ts';

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

// 數量後面的計數單位（不換算）：個、顆、瓣…。存檔時才認得，換算時只放大縮小前面的數字
const COUNT_ALIASES: ReadonlyArray<readonly [UnitCode, readonly string[]]> = [
  ['piece', ['個', '隻', '只']],
  ['whole', ['顆', '粒']],
  ['pack', ['包']],
  ['clove', ['瓣']],
  ['slice', ['片']],
  ['stalk', ['根', '支', '條']],
  ['bunch', ['把']],
  ['block', ['塊']],
  ['box', ['盒']],
  ['can', ['罐']],
  ['serving', ['人份']],
];

const COUNT_LOOKUP: ReadonlyArray<readonly [string, UnitCode]> = COUNT_ALIASES.flatMap(
  ([code, names]) => names.map((n): readonly [string, UnitCode] => [n, code]),
).sort((a, b) => b[0].length - a[0].length);

// 中文數字（半、一～九十九、兩）只在後面緊接單位時才算（避免「五花肉」「半熟蛋」）；「杯」後面不能接中文字（「三杯雞」）
const UNIT_WORDS = [...UNIT_LOOKUP.map(([n]) => n), ...COUNT_LOOKUP.map(([n]) => n)]
  .filter((n) => !/^[a-z]/i.test(n))
  .sort((a, b) => b.length - a.length)
  .map((n) => (n === '杯' ? String.raw`杯(?!\p{Script=Han})` : n))
  .join('|');
const CN_NUM = String.raw`(?:半|[一二三四五六七八九十兩]{1,3})(?=\s*(?:${UNIT_WORDS}))`;
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛]|\d+(?:\.\d+)?\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅛]|${CN_NUM})`;
const NUMBER_RE = new RegExp(String.raw`(?<![A-Za-z0-9./])(${NUM})(?:\s*[-–—~～至到]\s*(${NUM}))?`, 'gu');

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 兩: 2 };

// 一～九十九（十、十二、二十、二十五）。不合規則的回傳 NaN
function chineseInt(text: string): number {
  const m = /^([一二三四五六七八九兩])?十([一二三四五六七八九])?$/.exec(text);
  if (m) return (m[1] ? (CN_DIGITS[m[1]] as number) : 1) * 10 + (m[2] ? (CN_DIGITS[m[2]] as number) : 0);
  return text.length === 1 ? (CN_DIGITS[text] ?? NaN) : NaN;
}

const GLYPHS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };

function numberValue(text: string): number {
  const t = text.trim();
  if (t === '半') return 0.5;
  if (/^[一二三四五六七八九十兩]+$/.test(t)) return chineseInt(t);
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

// 數字後面接的計數單位（例：「 瓣」「顆」）。回傳單位與它的字數（含前面的空白）
export function matchCountUnit(rest: string): { code: UnitCode; length: number } | null {
  const gap = /^\s*/.exec(rest)?.[0].length ?? 0;
  for (const [name, code] of COUNT_LOOKUP) {
    if (rest.startsWith(name, gap)) return { code, length: gap + name.length };
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

// 存檔時解析好的數量（ingredient 的 amount、amount_max、unit）
export type StoredQuantity = { amount?: number | undefined; amountMax?: number | undefined; unit?: UnitCode | undefined };

// 解析好的數量蓋過原文裡的第一個數量（兩邊一樣就等於沒改）；原文裡找不到數量時不動
function withStored(segments: IngredientSegment[], stored: StoredQuantity | undefined, labels: UnitLabels): IngredientSegment[] {
  if (stored?.amount === undefined) return segments;
  const at = segments.findIndex((s) => typeof s !== 'string');
  if (at < 0) return segments;
  const token = segments[at] as QuantityToken;
  const unit = stored.unit && isMeasureUnit(stored.unit) ? stored.unit : undefined; // 個、瓣…不換算，單位字留在原文裡
  if (token.amount === stored.amount && token.amountMax === stored.amountMax && token.unit === unit) return segments;
  const range = stored.amountMax === undefined ? `${stored.amount}` : `${stored.amount}–${stored.amountMax}`;
  const next: QuantityToken = { kind: 'quantity', raw: unit ? `${range} ${labels[unit]}` : range, amount: stored.amount, unitText: '' };
  if (stored.amountMax !== undefined) next.amountMax = stored.amountMax;
  if (unit) next.unit = unit;
  return segments.map((s, i) => (i === at ? next : s));
}

// 依倍率與單位偏好組回一行文字。倍率 1 且單位沒變就是原文。
// 有存檔時解析好的數量（stored）就用它，沒有才用原文裡找到的
export function renderIngredient(
  text: string,
  opts: { factor: number; pref: MeasurePref; labels: UnitLabels },
  stored?: StoredQuantity,
): string {
  const segments = withStored(parseIngredient(text), stored, opts.labels);
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

// 這行食材是不是廚房有的。有標準食材 ID 就比 ID；沒有才比文字：要完全相同，或較長的名字（兩個字以上）包含廚房的名字。
// 寧可少標：單一個字（蛋、薑、蒜）只認完全相同，免得「薑黃粉」被當成「薑」
export function haveInKitchen(
  line: { text: string; ingredientId?: string | undefined },
  kitchen: { ingredientIds: ReadonlySet<string>; names: readonly string[] },
): boolean {
  // 有標準食材 ID 就只看 ID；沒有（字典對不到、還沒解析的舊食譜）才比名字
  if (line.ingredientId) return kitchen.ingredientIds.has(line.ingredientId);
  const name = ingredientName(line.text).toLowerCase();
  if (!name) return false;
  return kitchen.names.some((n) => {
    const k = n.trim().toLowerCase();
    if (!k) return false;
    if (name === k) return true;
    return [...k].length >= 2 && name.includes(k);
  });
}
