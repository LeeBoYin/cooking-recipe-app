// 中心溫度參考表（07 安全標準）。每個地區一份、附來源；沒有當地表的地區用各表最嚴格的值。
// 溫度只引用來源上的官方數值，攝氏與華氏不互相換算。舒肥預設組合表見 safety/*/sous-vide-presets.json（目前只有美國，且只有肉類）。
import usSousVide from '../safety/US/sous-vide-presets.json' with { type: 'json' };
import jpDoneness from '../safety/JP/doneness-temps.json' with { type: 'json' };
import usDoneness from '../safety/US/doneness-temps.json' with { type: 'json' };
import { regionChain } from './region.ts';

export interface DonenessRow {
  id: string;
  name: { 'zh-TW': string };
  minTempC: number;
  maxTempC?: number;
  minTempF?: number;
  restMinutes?: number;
  holdMinutes?: number;
  holdSeconds?: number;
  note?: string;
}

export interface DonenessTable {
  region: string;
  source: { name: string; urls: string[]; reviewStatus: string; note?: string };
  rows: DonenessRow[];
}

const tables: Record<string, DonenessTable> = { US: usDoneness as DonenessTable, JP: jpDoneness as DonenessTable };

export const donenessRegions = Object.keys(tables);

// 該地區自己的表（US-CA 看 US）；沒有就是 undefined
export function donenessTableFor(region: string): DonenessTable | undefined {
  for (const code of regionChain(region)) if (tables[code]) return tables[code];
  return undefined;
}

const holdSecondsOf = (r: DonenessRow) => r.holdSeconds ?? (r.holdMinutes ?? 0) * 60;

// 每一項取各地區表中最保守的值：溫度取最高、靜置與維持時間取最長
export function strictestDoneness(): DonenessRow[] {
  const merged = new Map<string, DonenessRow>();
  for (const table of Object.values(tables)) {
    for (const row of table.rows) {
      const prev = merged.get(row.id);
      if (!prev) {
        merged.set(row.id, { ...row });
        continue;
      }
      const next: DonenessRow = { ...prev };
      if (row.minTempC > prev.minTempC) {
        next.minTempC = row.minTempC;
        if (row.minTempF !== undefined) next.minTempF = row.minTempF;
        else delete next.minTempF;
      }
      next.restMinutes = Math.max(prev.restMinutes ?? 0, row.restMinutes ?? 0) || undefined;
      const hold = Math.max(holdSecondsOf(prev), holdSecondsOf(row));
      delete next.holdMinutes;
      delete next.holdSeconds;
      if (hold > 0) next.holdSeconds = hold;
      if (next.restMinutes === undefined) delete next.restMinutes;
      merged.set(row.id, next);
    }
  }
  return [...merged.values()];
}

// 查某地區某一類食材的中心溫度；該地區沒有表、或表裡沒有這一類，就用最嚴格的
export function donenessFor(region: string, rowId: string): DonenessRow | undefined {
  const own = donenessTableFor(region)?.rows.find((r) => r.id === rowId);
  return own ?? strictestDoneness().find((r) => r.id === rowId);
}

// 舒肥預設組合（SR-sous-vide）：AI 寫的舒肥步驟，溫度與維持時間只能是表裡某一組。
// 表的意思：肉的每個部位中心溫度到達 tempC 之後，要「維持」dwell 這麼久（不是泡水的總時間）。
// 只有肉類（豬、牛、羊）有表；禽肉、海鮮、蛋沒有，舒肥一律擋下。
export interface SousVidePreset {
  id: string;
  category: string;
  tempC: number; // 來源上的官方數值，不由程式換算
  tempF: number;
  dwell65Seconds: number; // 6.5-log 欄（牛肉）
  dwell7Seconds: number; // 7-log 欄（豬、羊與其他）
  short: boolean; // 短時間組合：可以推薦給「大鍋溫水＋溫度計」的替代做法
  table: string; // 在來源文件裡的位置
}

export interface SousVideRule {
  id: string;
  page: number | null;
  text: string; // 可含 {{temp:…}} 標記
}

interface SousVideTable {
  region: string;
  categories: { id: string; traits: string[] }[];
  rules: SousVideRule[];
  presets: SousVidePreset[];
}

const sousVideTables: Record<string, SousVideTable> = { US: usSousVide as SousVideTable };

function sousVideTableFor(region: string): SousVideTable | undefined {
  // 只有有組合的表才算「當地表」；沒有當地表的地區（台灣、日本）用現有各份中最嚴格的，目前只有美國這份
  const tables = Object.values(sousVideTables).filter((t) => t.presets.length > 0);
  for (const code of regionChain(region)) if (sousVideTables[code]?.presets.length) return sousVideTables[code];
  return tables[0];
}

// 該地區的舒肥預設組合（沒有當地表時用美國的）；short 為 true 時只留短時間組合
export function sousVidePresetsFor(region: string, opts: { shortOnly?: boolean } = {}): SousVidePreset[] {
  const presets = sousVideTableFor(region)?.presets ?? [];
  return opts.shortOnly ? presets.filter((p) => p.short) : presets;
}

export function sousVideRulesFor(region: string): SousVideRule[] {
  return sousVideTableFor(region)?.rules ?? [];
}

// 這份食材能不能用舒肥：要有豬、牛、羊肉，而且不能有禽肉、海鮮、蛋（表裡沒有，混在一起也不行）。
// 傳入食材字典的 traits 清單（每個食材一組）；沒有任何 traits 資訊就不行
export function sousVideEligible(traitsOfEach: readonly (readonly string[])[], region = 'US'): boolean {
  const meat = new Set(sousVideTableFor(region)?.categories.flatMap((c) => c.traits) ?? []);
  const all = new Set(traitsOfEach.flat());
  if (all.has('poultry') || all.has('seafood') || all.has('egg')) return false;
  return [...all].some((t) => meat.has(t));
}

// 這份食材要用哪一欄的維持時間：只有牛肉用 6.5-log，其他（含牛和別種肉混在一起）用 7-log
export function sousVideDwellSeconds(preset: SousVidePreset, traitsOfEach: readonly (readonly string[])[]): number {
  const all = new Set(traitsOfEach.flat());
  const beefOnly = all.has('beef') && !all.has('pork') && !all.has('lamb');
  return beefOnly ? preset.dwell65Seconds : preset.dwell7Seconds;
}

// 步驟裡溫度標記的文字：兩個單位的官方值都帶（顯示時依使用者偏好挑）
export function sousVideTempMark(preset: SousVidePreset): string {
  return `{{temp:${preset.tempF}:F:min:${preset.tempC}}}`;
}
