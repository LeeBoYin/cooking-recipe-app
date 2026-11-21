import { hashSeed } from '../taste/rng.ts';

// 大廚的語氣（05 的 chefPersona）。沒有對應句子時退回 warm
export const CHEF_PERSONAS = ['warm', 'coach', 'punny', 'minimal'] as const;
export type ChefPersona = (typeof CHEF_PERSONAS)[number];
export const DEFAULT_CHEF_PERSONA: ChefPersona = 'warm';

export function isChefPersona(value: unknown): value is ChefPersona {
  return typeof value === 'string' && (CHEF_PERSONAS as readonly string[]).includes(value);
}

export type TimeBand = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

// 5–10 點早上、11–13 中午、14–16 下午、17–20 傍晚、其餘晚上
export function timeBand(hour: number): TimeBand {
  if (hour >= 5 && hour <= 10) return 'morning';
  if (hour >= 11 && hour <= 13) return 'noon';
  if (hour >= 14 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 20) return 'evening';
  return 'night';
}

// 時區裡現在幾點（0–23）。只用標準的 Intl
export function hourInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return Number.isFinite(hour) ? hour % 24 : 0;
}

// 每個情境、每種語氣有幾句。句子的訊息代碼是 `chef.line.<情境>.<語氣>.<編號>`，編號從 1 連續編
export type ChefCatalog = Record<string, Partial<Record<ChefPersona, number>>>;

const LINE_KEY = /^chef\.line\.(.+)\.(warm|coach|punny|minimal)\.([1-9]\d*)$/;

export function buildChefCatalog(keys: Iterable<string>): ChefCatalog {
  const catalog: ChefCatalog = {};
  for (const key of keys) {
    const match = LINE_KEY.exec(key);
    if (!match) continue;
    const situation = match[1] as string;
    const persona = match[2] as ChefPersona;
    const entry = (catalog[situation] ??= {});
    entry[persona] = Math.max(entry[persona] ?? 0, Number(match[3]));
  }
  return catalog;
}

export type ChefLineInput = {
  situation: string;
  persona: ChefPersona;
  // 「使用者＋今天日期」。同一天、同一情境、同一語氣固定一句，不會每次打開都換
  seedKey: string;
};

// 挑一句，回傳訊息代碼；這個情境完全沒有句子時回傳 null
export function pickChefLine(catalog: ChefCatalog, input: ChefLineInput): string | null {
  const entry = catalog[input.situation];
  if (!entry) return null;
  const persona = (entry[input.persona] ?? 0) > 0 ? input.persona : DEFAULT_CHEF_PERSONA;
  const count = entry[persona] ?? 0;
  if (count <= 0) return null;
  const index = (hashSeed(input.seedKey, input.situation, persona) % count) + 1;
  return `chef.line.${input.situation}.${persona}.${index}`;
}
