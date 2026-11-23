import { describe, expect, it } from 'vitest';
import {
  blockedRate,
  fairUseIssue,
  inviteUrl,
  mailtoUrl,
  protectionIssue,
  resetUrl,
  toAdminError,
  usageMonths,
  type AiProtection,
} from './admin.ts';

const DEFAULT_PROTECTION: AiProtection = {
  schemaVersion: 1,
  perMinute: 6,
  perHour: 60,
  fairUse: { free: { dailyUsd: 1.5, monthlyUsd: 5 }, plus: { dailyUsd: 3, monthlyUsd: 10 } },
  anomaly: { rateBlockAlerts: 10, repeatedInputCount: 10, oversizedStreak: 10, oversizedRatio: 0.95, burstCalls: 20, burstDevices: 3, burstWindowMinutes: 10 },
  consoleHardCapUsd: 20,
};

describe('admin 連結與錯誤', () => {
  it('邀請與重設密碼連結的格式', () => {
    expect(inviteUrl('https://x.test', 'abc-_123')).toBe('https://x.test/invite/abc-_123');
    expect(resetUrl('https://x.test', 'abc-_123')).toBe('https://x.test/reset/abc-_123');
  });

  it('mailto 把收件人、主旨、內容都編碼', () => {
    const url = mailtoUrl('a+b@x.test', '邀請 你', '第一行\n連結：https://x.test/invite/t?x=1');
    expect(url.startsWith('mailto:a%2Bb%40x.test?subject=')).toBe(true);
    expect(url).toContain('%0A');
    expect(url).not.toContain(' ');
  });

  it('錯誤代號：認得的照原樣，沒見過的當 server_error', () => {
    expect(toAdminError({ error: 'invite_capacity' })).toBe('invite_capacity');
    expect(toAdminError({ error: 'weird' })).toBe('server_error');
    expect(toAdminError(null)).toBe('server_error');
  });
});

describe('AI 用量頁的小工具', () => {
  it('月份清單：本月加前 12 個月，跨年也對', () => {
    const months = usageMonths(new Date('2026-02-10T00:00:00Z'));
    expect(months).toHaveLength(13);
    expect(months[0]).toBe('2026-02');
    expect(months[1]).toBe('2026-01');
    expect(months[2]).toBe('2025-12');
    expect(months[12]).toBe('2025-02');
  });

  it('被擋下的比率：沒有檢查結果的任務是 null', () => {
    expect(blockedRate({ passed: 0, rewritten: 0, blocked: 0 })).toBeNull();
    expect(blockedRate({ passed: 6, rewritten: 3, blocked: 1 })).toBe(0.1);
  });

  it('保護數值：預設值合格', () => {
    expect(protectionIssue(DEFAULT_PROTECTION)).toBeNull();
  });

  it('保護數值：和資料庫一樣的規則', () => {
    expect(protectionIssue({ ...DEFAULT_PROTECTION, perMinute: 0 })).toBe('perMinute');
    expect(protectionIssue({ ...DEFAULT_PROTECTION, perMinute: 1.5 })).toBe('perMinute');
    expect(protectionIssue({ ...DEFAULT_PROTECTION, perMinute: 61 })).toBe('perHourBelowMinute');
    expect(protectionIssue({ ...DEFAULT_PROTECTION, perHour: 6001 })).toBe('perHour');
    const lowMonthly = { ...DEFAULT_PROTECTION, fairUse: { ...DEFAULT_PROTECTION.fairUse, plus: { dailyUsd: 3, monthlyUsd: 2 } } };
    expect(protectionIssue(lowMonthly)).toBe('fairUseMonthlyBelowDaily');
    const negative = { ...DEFAULT_PROTECTION, fairUse: { ...DEFAULT_PROTECTION.fairUse, free: { dailyUsd: -1, monthlyUsd: 5 } } };
    expect(protectionIssue(negative)).toBe('fairUse');
    expect(protectionIssue({ ...DEFAULT_PROTECTION, anomaly: { ...DEFAULT_PROTECTION.anomaly, oversizedRatio: 0.4 } })).toBe('anomaly');
    expect(protectionIssue({ ...DEFAULT_PROTECTION, anomaly: { ...DEFAULT_PROTECTION.anomaly, burstDevices: 1 } })).toBe('anomaly');
    expect(protectionIssue({ ...DEFAULT_PROTECTION, consoleHardCapUsd: Number.NaN })).toBe('consoleHardCapUsd');
  });

  it('個人覆寫：至少填一邊、每月不低於每日', () => {
    expect(fairUseIssue(null, null)).toBe('empty');
    expect(fairUseIssue(-1, null)).toBe('range');
    expect(fairUseIssue(5, 3)).toBe('monthlyBelowDaily');
    expect(fairUseIssue(2, null)).toBeNull();
    expect(fairUseIssue(2, 10)).toBeNull();
  });
});
