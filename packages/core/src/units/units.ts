// 單位與換算（02 I 節）：存原始值與原始單位，顯示時才換算。純函式，前端與 Edge Functions 共用。
// 單位的顯示名稱（克、大匙…）是介面文字，由呼叫的人從語系檔傳入。

export type UnitCode =
  | 'g' | 'kg' | 'oz' | 'lb' | 'tw_jin' | 'tw_liang' | 'cn_jin'
  | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'cup_jp' | 'rice_cup' | 'fl_oz' | 'qt'
  | 'cm' | 'inch'
  // 不換算（只跟著份量放大縮小）：個、顆、包、瓣、片、根、把、塊、盒、罐、人份、少許、適量
  | 'piece' | 'whole' | 'pack' | 'clove' | 'slice' | 'stalk' | 'bunch' | 'block' | 'box' | 'can' | 'serving' | 'pinch' | 'to_taste';

export const UNIT_CODES: readonly UnitCode[] = [
  'g', 'kg', 'oz', 'lb', 'tw_jin', 'tw_liang', 'cn_jin',
  'ml', 'l', 'tsp', 'tbsp', 'cup', 'cup_jp', 'rice_cup', 'fl_oz', 'qt',
  'cm', 'inch',
  'piece', 'whole', 'pack', 'clove', 'slice', 'stalk', 'bunch', 'block', 'box', 'can', 'serving', 'pinch', 'to_taste',
];

// 可以在公制與美制之間換算的單位；其他（個、瓣、適量…）不換算
export type MeasureUnit = 'g' | 'kg' | 'oz' | 'lb' | 'tw_jin' | 'tw_liang' | 'cn_jin' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'cup_jp' | 'rice_cup' | 'fl_oz' | 'qt' | 'cm' | 'inch';
export function isMeasureUnit(unit: UnitCode): unit is MeasureUnit {
  return unit in GRAMS || unit in MILLILITERS || unit in CENTIMETERS;
}

export type UnitSystem = 'metric' | 'us';
// system：主要顯示的單位；both：括號裡再放另一種（例：1 杯（240 毫升））
export type MeasurePref = { system: UnitSystem; both: boolean };
export type TemperaturePref = { unit: 'C' | 'F'; both: boolean };
export type Temperature = { value: number; unit: 'C' | 'F' };
export type UnitLabels = Readonly<Record<UnitCode, string>>;

// 換成公克、毫升、公分的係數。大匙小匙視同 15、5 毫升；美制杯與台灣量杯視為同一種（240 毫升）
const GRAMS: Partial<Record<UnitCode, number>> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592, tw_jin: 600, tw_liang: 37.5, cn_jin: 500 };
const MILLILITERS: Partial<Record<UnitCode, number>> = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240, cup_jp: 200, rice_cup: 180, fl_oz: 30, qt: 960 };
const CENTIMETERS: Partial<Record<UnitCode, number>> = { cm: 1, inch: 2.54 };

type Kind = 'weight' | 'volume' | 'length';

function kindOf(unit: MeasureUnit): Kind {
  if (unit in GRAMS) return 'weight';
  if (unit in MILLILITERS) return 'volume';
  return 'length';
}

const BASE: Record<Kind, Partial<Record<UnitCode, number>>> = { weight: GRAMS, volume: MILLILITERS, length: CENTIMETERS };

function toBase(amount: number, unit: MeasureUnit): number {
  return amount * (BASE[kindOf(unit)][unit] as number);
}

function fromBase(base: number, unit: MeasureUnit): number {
  return base / (BASE[kindOf(unit)][unit] as number);
}

// 「公制（美制）」「us+metric」這類偏好字串 → 結構
export function parseMeasurePref(value: string | null | undefined): MeasurePref {
  const [first, second] = (value ?? 'metric').split('+');
  return { system: first === 'us' ? 'us' : 'metric', both: !!second };
}

export function parseTemperaturePref(value: string | null | undefined): TemperaturePref {
  const [first, second] = (value ?? 'C').split('+');
  return { unit: first === 'F' ? 'F' : 'C', both: !!second };
}

// 這個單位換到指定的制度後，用哪個單位表示。同一個制度內，保留使用者原本的單位
// （大匙、小匙、杯、米杯在公制也照用；台斤、兩在公制保留，另外附公克）
function targetUnit(baseAmount: number, unit: MeasureUnit, system: UnitSystem): MeasureUnit {
  const kind = kindOf(unit);
  if (system === 'metric') {
    if (kind === 'weight') return unit === 'tw_jin' || unit === 'tw_liang' ? unit : baseAmount >= 1000 ? 'kg' : 'g';
    if (kind === 'volume') {
      if (unit === 'tsp' || unit === 'tbsp' || unit === 'rice_cup') return unit;
      return baseAmount >= 1000 ? 'l' : 'ml';
    }
    return 'cm';
  }
  if (kind === 'weight') return baseAmount >= 454 ? 'lb' : 'oz';
  if (kind === 'volume') {
    if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup' || unit === 'fl_oz' || unit === 'qt' || unit === 'rice_cup') return unit;
    if (baseAmount < 15) return 'tsp';
    if (baseAmount < 59) return 'tbsp';
    return baseAmount < 946 ? 'cup' : 'qt';
  }
  return 'inch';
}

export type Measured = { amount: number; amountMax?: number | undefined; unit: UnitCode };

// 先依倍率放大縮小，再換到指定的制度（還沒進位）
export function scaleToSystem(q: Measured, factor: number, system: UnitSystem): Measured {
  if (!isMeasureUnit(q.unit)) {
    const out: Measured = { amount: q.amount * factor, unit: q.unit };
    if (q.amountMax !== undefined) out.amountMax = q.amountMax * factor;
    return out;
  }
  const base = toBase(q.amount * factor, q.unit);
  const unit = targetUnit(base, q.unit, system);
  const out: Measured = { amount: fromBase(base, unit), unit };
  if (q.amountMax !== undefined) out.amountMax = fromBase(toBase(q.amountMax * factor, q.unit), unit);
  return out;
}

const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'],
];

// 常用分數：美制的杯、匙、盎司和「個」這類數量都用它。0.5 以下才出現 ⅛；大於 10 只進位到半個
export function fractionText(x: number): string {
  const v = Math.max(0, x);
  const whole = Math.floor(v);
  const rest = v - whole;
  const choices: ReadonlyArray<readonly [number, string]> = whole >= 10 ? [[0.5, '½']] : whole >= 1 ? FRACTIONS.slice(1) : FRACTIONS;
  let best: readonly [number, string] | null = null;
  let bestGap = rest; // 和「整數」的距離
  for (const c of choices) {
    const gap = Math.abs(rest - c[0]);
    if (gap < bestGap) {
      best = c;
      bestGap = gap;
    }
  }
  if (Math.abs(1 - rest) < bestGap) return String(whole + 1);
  if (!best) return whole === 0 ? FRACTIONS[0]![1] : String(whole); // 太小也不寫 0
  return whole === 0 ? best[1] : `${whole}${best[1]}`;
}

function trim(x: number, digits = 2): string {
  return String(Number(x.toFixed(digits)));
}

// 把數值進位成顯示用的字：公克、毫升一般到 5、少量到 0.5；公斤、公升到 0.05；其他用常見分數
export function roundedText(amount: number, unit: UnitCode | null): string {
  if (unit === 'g' || unit === 'ml') {
    const v = amount < 10 ? Math.round(amount * 2) / 2 : Math.round(amount / 5) * 5;
    return trim(v === 0 ? 0.5 : v);
  }
  if (unit === 'kg' || unit === 'l') return trim(Math.max(0.05, Math.round(amount / 0.05) * 0.05));
  if (unit === 'cm') return trim(Math.max(0.5, Math.round(amount * 2) / 2));
  if (unit === 'lb') return fractionText(Math.max(0.25, Math.round(amount * 4) / 4));
  return fractionText(amount);
}

export type QuantityInput = {
  amount: number;
  amountMax?: number | undefined;
  unit: UnitCode;
  // 使用者原本寫的單位字（例：「湯匙」）；單位沒換時沿用
  unitText: string;
  // 倍率沒變、單位也沒換時，顯示使用者原本寫的樣子
  raw: string;
};

function rangeText(m: Measured): string {
  const a = roundedText(m.amount, m.unit);
  if (m.amountMax === undefined) return a;
  const b = roundedText(m.amountMax, m.unit);
  return a === b ? a : `${a}–${b}`;
}

function label(m: Measured, q: QuantityInput, labels: UnitLabels): string {
  // 使用者寫的中文單位（湯匙、公克）照用；英文縮寫（g、tbsp）換成語系檔的名稱
  return m.unit === q.unit && q.unitText && !/[a-z]/i.test(q.unitText) ? q.unitText : labels[m.unit];
}

// 一個「數量＋單位」的顯示文字。factor 是份量倍率
export function formatQuantity(q: QuantityInput, factor: number, pref: MeasurePref, labels: UnitLabels, note = true): string {
  if (!isMeasureUnit(q.unit)) {
    // 個、瓣、適量…：不換算，只跟著份量放大縮小
    if (factor === 1 || q.unit === 'to_taste' || q.unit === 'pinch') return q.raw;
    return `${rangeText(scaleToSystem(q, factor, pref.system))} ${labels[q.unit]}`;
  }
  const primary = scaleToSystem(q, factor, pref.system);
  const same = primary.unit === q.unit && factor === 1;
  let text = same ? q.raw : `${rangeText(primary)} ${label(primary, q, labels)}`;
  // 台斤、兩一律附上公制；選了「兩種都顯示」就附另一個制度
  const needsMetricNote = note && pref.system === 'metric' && (q.unit === 'tw_jin' || q.unit === 'tw_liang');
  if (pref.both || needsMetricNote) {
    const other = needsMetricNote && !pref.both ? scaleToSystem({ ...q, unit: 'g', amount: toBase(q.amount, q.unit), amountMax: q.amountMax === undefined ? undefined : toBase(q.amountMax, q.unit) }, factor, 'metric')
      : scaleToSystem(q, factor, pref.system === 'metric' ? 'us' : 'metric');
    const otherText = `${rangeText(other)} ${labels[other.unit]}`;
    if (otherText !== text) text = `${text}（${otherText}）`;
  }
  return text;
}

// 溫度：烤箱刻度進位到 5；安全溫度（中心溫度、舒肥水溫）精確到 1°F／0.5°C 並往高溫方向進位
export function convertTemperature(t: Temperature, to: 'C' | 'F', safety = false): number {
  if (t.unit === to) return t.value;
  if (to === 'F') {
    const f = (t.value * 9) / 5 + 32;
    return safety ? Math.ceil(f) : Math.round(f / 5) * 5;
  }
  const c = ((t.value - 32) * 5) / 9;
  return safety ? Math.ceil(c * 2) / 2 : Math.round(c / 5) * 5;
}

export function formatTemperature(t: Temperature, pref: TemperaturePref, safety = false): string {
  const primary = `${trim(convertTemperature(t, pref.unit, safety), 1)}°${pref.unit}`;
  if (!pref.both) return primary;
  const otherUnit = pref.unit === 'C' ? 'F' : 'C';
  return `${primary}（${trim(convertTemperature(t, otherUnit, safety), 1)}°${otherUnit}）`;
}
