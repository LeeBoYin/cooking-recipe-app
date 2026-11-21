// 中心溫度參考表（07 安全標準）。每個地區一份、附來源；沒有當地表的地區用各表最嚴格的值。
// 溫度只引用來源上的官方數值，攝氏與華氏不互相換算。舒肥預設組合表目前是空的（待補），見 safety/*/sous-vide-presets.json。
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
