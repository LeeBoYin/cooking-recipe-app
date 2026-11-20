// ⑥ 建立我的廚房：從手機的設定猜時區與地區。純函式放這裡，方便測試。
import { regionProfiles } from '@zhusha/ingredients';

// 手機的時區（IANA 名稱）；拿不到或瀏覽器不認得就是 null
export function deviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimezone(tz) ? tz : null;
  } catch {
    return null;
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// 手機的地區：先看語言的地區碼（zh-TW → TW），再看時區對應的地區；都不在我們支援的清單就是 null（保留廚房現在的）
export function deviceRegion(
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
  timezone: string | null = deviceTimezone(),
): string | null {
  const supported = new Set(regionProfiles.map((r) => r.code));
  for (const lang of languages) {
    const region = lang.split('-').find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part))?.toUpperCase();
    if (!region) continue;
    if (region === 'US' && timezone === 'America/Los_Angeles' && supported.has('US-CA')) return 'US-CA';
    if (supported.has(region)) return region;
  }
  const byTimezone = regionProfiles.find((r) => r.defaultTimezone === timezone);
  return byTimezone?.code ?? null;
}

// 時區選單：常用的幾個，加上手機的與廚房現在的（可能不在常用清單裡）
const COMMON_TIMEZONES = [
  'Asia/Taipei', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Bangkok',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Pacific/Honolulu', 'Australia/Sydney', 'Pacific/Auckland',
];

export function timezoneOptions(...current: string[]): string[] {
  const all = new Set<string>(COMMON_TIMEZONES);
  for (const tz of current) if (isValidTimezone(tz)) all.add(tz);
  return [...all].sort((a, b) => offsetMinutes(a) - offsetMinutes(b) || a.localeCompare(b));
}

function offsetMinutes(tz: string, at = new Date()): number {
  const part = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

// 「台北時間（UTC+8）」
export function timezoneLabel(tz: string, at = new Date()): string {
  const name = new Intl.DateTimeFormat('zh-TW', { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? tz;
  const mins = offsetMinutes(tz, at);
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  const offset = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`;
  return `${name}（${offset}）`;
}
