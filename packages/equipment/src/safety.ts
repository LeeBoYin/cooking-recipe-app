// 中心溫度參考表（07 安全標準）。每個地區一份、附來源；沒有當地表的地區用各表最嚴格的值。
// 溫度只引用來源上的官方數值，攝氏與華氏不互相換算。舒肥預設組合表目前是空的（待補），見 safety/*/sous-vide-presets.json。
import jpSousVide from '../safety/JP/sous-vide-presets.json' with { type: 'json' };
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

// 舒肥預設組合（SR-sous-vide）：AI 寫的舒肥步驟，水溫與時間只能落在表裡某一組的範圍內。目前每個地區的表都是空的，
// 所以任何舒肥的步驟都會被擋下；表補上之後，這裡不用改。
export interface SousVidePreset {
  id: string;
  name: { 'zh-TW': string };
  tempC: number;
  minMinutes: number;
  maxMinutes: number;
}

const sousVideTables: Record<string, { presets: SousVidePreset[] }> = {
  US: usSousVide as { presets: SousVidePreset[] },
  JP: jpSousVide as { presets: SousVidePreset[] },
};

// 該地區的舒肥預設組合；該地區沒有表就用所有地區的表合併（沒有當地表時，寧可只留有來源的）
export function sousVidePresetsFor(region: string): SousVidePreset[] {
  for (const code of regionChain(region)) if (sousVideTables[code]) return sousVideTables[code].presets;
  return Object.values(sousVideTables).flatMap((t) => t.presets);
}
