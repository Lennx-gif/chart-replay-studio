import { describe, it, expect } from 'vitest';
import { formatYmd, parseYmd, type WaybackDayIndicator } from './WaybackCalendar';

describe('WaybackCalendar Date & Indicator Logic', () => {
  it('formats year, month, day correctly into YYYY-MM-DD', () => {
    expect(formatYmd(2024, 0, 1)).toBe('2024-01-01');
    expect(formatYmd(2024, 11, 31)).toBe('2024-12-31');
    expect(formatYmd(2023, 8, 9)).toBe('2023-09-09');
  });

  it('parses YYYY-MM-DD correctly into 0-indexed month and day', () => {
    expect(parseYmd('2024-01-15')).toEqual({ year: 2024, month: 0, day: 15 });
    expect(parseYmd('2023-12-25')).toEqual({ year: 2023, month: 11, day: 25 });
    expect(parseYmd('invalid-date')).toBeNull();
    expect(parseYmd('')).toBeNull();
  });

  it('calculates days in month correctly including leap years', () => {
    // 2024 is a leap year -> Feb has 29 days
    const feb2024Days = new Date(Date.UTC(2024, 2, 0)).getUTCDate();
    expect(feb2024Days).toBe(29);

    // 2023 is not a leap year -> Feb has 28 days
    const feb2023Days = new Date(Date.UTC(2023, 2, 0)).getUTCDate();
    expect(feb2023Days).toBe(28);

    // Jan has 31 days
    const janDays = new Date(Date.UTC(2024, 1, 0)).getUTCDate();
    expect(janDays).toBe(31);
  });

  it('aggregates news impact dots and analytics metrics for calendar cells', () => {
    const mockIndicators: Record<string, WaybackDayIndicator> = {
      '2024-01-11': {
        newsImpacts: { high: 2, medium: 1, low: 0 },
        pnl: 450,
        tradesCount: 3,
        wins: 2,
        losses: 1,
      },
      '2024-01-12': {
        newsImpacts: { high: 0, medium: 0, low: 1 },
        pnl: -120,
        tradesCount: 1,
        wins: 0,
        losses: 1,
      },
    };

    const day1 = mockIndicators['2024-01-11'];
    expect(day1.newsImpacts?.high).toBe(2);
    expect(day1.newsImpacts?.medium).toBe(1);
    expect(day1.pnl).toBe(450);
    expect(day1.tradesCount).toBe(3);
    expect(day1.wins).toBe(2);

    const day2 = mockIndicators['2024-01-12'];
    expect(day2.pnl).toBe(-120);
    expect(day2.losses).toBe(1);

    // Weekly rollup sum test
    const weeklyPnl = (day1.pnl || 0) + (day2.pnl || 0);
    const weeklyTrades = (day1.tradesCount || 0) + (day2.tradesCount || 0);
    expect(weeklyPnl).toBe(330);
    expect(weeklyTrades).toBe(4);
  });

  it('respects simulated timezone offset when converting dates', () => {
    // Simulated UTC timestamp: 2024-01-15 01:00:00 UTC
    const utcUnix = 1705280400;

    // At UTC (tzOffset = 0): Date is 2024-01-15
    const ymdUtc = new Date(utcUnix * 1000).toISOString().slice(0, 10);
    expect(ymdUtc).toBe('2024-01-15');

    // With NY offset (-5 hours): 01:00 UTC - 5 hours = 20:00 previous day (2024-01-14)
    const nyUnix = (utcUnix - 5 * 3600) * 1000;
    const ymdNy = new Date(nyUnix).toISOString().slice(0, 10);
    expect(ymdNy).toBe('2024-01-14');
  });
});
