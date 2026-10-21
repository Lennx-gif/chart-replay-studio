import { describe, it, expect } from 'vitest';
import { parseTimestampToSeconds } from '../lib/csvParser';

describe('CSV Timestamp Parser', () => {
  it('parses numeric unix timestamp seconds', () => {
    const sec = parseTimestampToSeconds('1672531200');
    expect(sec).toBe(1672531200);
  });

  it('parses numeric unix timestamp milliseconds', () => {
    const sec = parseTimestampToSeconds('1672531200000');
    expect(sec).toBe(1672531200);
  });

  it('parses ISO date string', () => {
    const sec = parseTimestampToSeconds('2023-01-01T00:00:00Z');
    expect(sec).toBe(1672531200);
  });

  it('parses compact YYYYMMDD with separate time', () => {
    const sec = parseTimestampToSeconds('20230101', '00:00:00');
    expect(sec).toBe(1672531200);
  });

  it('parses dot separated date format YYYY.MM.DD', () => {
    const sec = parseTimestampToSeconds('2023.01.01', '00:00:00');
    expect(sec).toBe(1672531200);
  });
});
