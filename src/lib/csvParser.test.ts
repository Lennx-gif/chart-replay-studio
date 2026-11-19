import { describe, it, expect } from 'vitest';
import { parseCSV, parseTimestamp } from './csvParser';

const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;

describe('parseTimestamp', () => {
  it('reads wall-clock times as UTC regardless of the machine time zone', () => {
    expect(parseTimestamp('2024-01-31 14:05:00')).toBe(utc(2024, 1, 31, 14, 5));
    expect(parseTimestamp('2024-01-31T14:05')).toBe(utc(2024, 1, 31, 14, 5));
    expect(parseTimestamp('2024.01.31', '14:05')).toBe(utc(2024, 1, 31, 14, 5));
    expect(parseTimestamp('20240131', '14:05:00')).toBe(utc(2024, 1, 31, 14, 5));
    expect(parseTimestamp('2024-01-31')).toBe(utc(2024, 1, 31));
  });
  it('honours explicit zones and epoch values', () => {
    expect(parseTimestamp('2024-01-31T14:05:00+03:00')).toBe(utc(2024, 1, 31, 11, 5));
    expect(parseTimestamp('2024-01-31T14:05:00Z')).toBe(utc(2024, 1, 31, 14, 5));
    expect(parseTimestamp('1706709900')).toBe(1706709900);
    expect(parseTimestamp('1706709900000')).toBe(1706709900);
  });
  it('rejects garbage', () => {
    expect(parseTimestamp('not a date')).toBeNull();
  });
});

describe('parseCSV', () => {
  const file = (text: string) => new File([text], 'x.csv', { type: 'text/csv' });

  it('parses timestamp,o,h,l,c,v with a header', async () => {
    const bars = await parseCSV(file('timestamp,open,high,low,close,volume\n2024-01-01 00:05:00,1,2,0.5,1.5,10\n2024-01-01 00:00:00,1,2,0.5,1.2,5'));
    expect(bars.map((b) => b.time)).toEqual([utc(2024, 1, 1, 0, 0), utc(2024, 1, 1, 0, 5)]); // sorted
    expect(bars[1].close).toBe(1.5);
  });

  it('parses date,time,o,h,l,c,v without a header, and drops duplicate times', async () => {
    const bars = await parseCSV(file('20240101,00:00:00,1,2,0.5,1.5,10\n20240101,00:00:00,9,9,9,9,9\n20240101,00:05:00,1,2,0.5,1.7,10'));
    expect(bars).toHaveLength(2);
    expect(bars[0].time).toBe(utc(2024, 1, 1));
  });

  it('rejects files with no valid rows', async () => {
    await expect(parseCSV(file('a,b,c,d,e,f\nx,y,z,1,2,3'))).rejects.toThrow(/No valid OHLCV/);
  });
});
