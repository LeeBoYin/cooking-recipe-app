import { describe, expect, it } from 'vitest';
import { deviceRegion, isValidTimezone, timezoneLabel, timezoneOptions } from './kitchenDefaults.ts';

describe('從手機猜地區', () => {
  it('語言的地區碼在支援清單裡就用它', () => {
    expect(deviceRegion(['zh-TW'], 'Asia/Taipei')).toBe('TW');
    expect(deviceRegion(['ja-JP'], 'Asia/Tokyo')).toBe('JP');
  });
  it('美國的語言加上加州的時區才算加州', () => {
    expect(deviceRegion(['en-US'], 'America/Los_Angeles')).toBe('US-CA');
  });
  it('語言沒有地區碼時看時區', () => {
    expect(deviceRegion(['zh'], 'Asia/Taipei')).toBe('TW');
    expect(deviceRegion(['en'], 'Asia/Tokyo')).toBe('JP');
  });
  it('都不支援就是 null，保留廚房現在的', () => {
    expect(deviceRegion(['en-GB'], 'Europe/London')).toBeNull();
    expect(deviceRegion([], null)).toBeNull();
  });
});

describe('時區', () => {
  it('認得 IANA 名稱', () => {
    expect(isValidTimezone('Asia/Taipei')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
  });
  it('選單照時差排序，並且帶入手機與廚房現在的時區', () => {
    const list = timezoneOptions('Asia/Kolkata', 'Not/AZone');
    expect(list).toContain('Asia/Kolkata');
    expect(list).not.toContain('Not/AZone');
    expect(list.indexOf('Asia/Taipei')).toBeGreaterThan(list.indexOf('Europe/London'));
  });
  it('標籤有名稱和時差', () => {
    expect(timezoneLabel('Asia/Taipei')).toContain('UTC+8');
    expect(timezoneLabel('Asia/Kolkata')).toContain('UTC+5:30');
  });
});
