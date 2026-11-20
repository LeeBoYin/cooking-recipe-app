// 日期都用 YYYY-MM-DD 的字串，以廚房時區的「當地日期」解讀。
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA 的日期格式剛好是 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function fromParts(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return fromParts(y, m - 1, d + days);
}

// 加幾個月；目標月份沒有那一天時（例：1/31 + 1 個月）取該月最後一天
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return fromParts(y, m - 1 + months, Math.min(d, lastDay));
}
