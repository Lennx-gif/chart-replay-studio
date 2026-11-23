import { describe, it, expect } from 'vitest';
import { parseNewsCSV, normalizeImpact, getReplayEventStatus } from './newsParser';

describe('newsParser', () => {
  it('normalizes impact tags', () => {
    expect(normalizeImpact('High')).toBe('high');
    expect(normalizeImpact('RED')).toBe('high');
    expect(normalizeImpact('Medium')).toBe('medium');
    expect(normalizeImpact('Orange')).toBe('medium');
    expect(normalizeImpact('Low')).toBe('low');
    expect(normalizeImpact('Non-Economic')).toBe('low');
  });

  it('parses standard economic calendar CSV', () => {
    const csv = `Date,Time,Currency,Impact,Event,Actual,Forecast,Previous
2024-01-11,13:30,USD,High,Core CPI m/m,0.3%,0.3%,0.3%
2024-01-25,13:15,EUR,High,Main Refinancing Rate,4.50%,4.50%,4.50%`;

    const records = parseNewsCSV(csv);
    expect(records.length).toBe(2);
    expect(records[0].currency).toBe('USD');
    expect(records[0].impact).toBe('high');
    expect(records[0].title).toBe('Core CPI m/m');
    expect(records[0].actual).toBe('0.3%');
    expect(records[1].currency).toBe('EUR');
  });

  it('accurately identifies replay status relative to current bar time', () => {
    const eventTime = 1704979800; // Event time

    // Current bar is 1 hour before event -> upcoming
    expect(getReplayEventStatus(eventTime, eventTime - 3600)).toBe('upcoming');

    // Current bar is 5 minutes before event -> active
    expect(getReplayEventStatus(eventTime, eventTime - 300)).toBe('active');

    // Current bar is 2 hours after event -> passed
    expect(getReplayEventStatus(eventTime, eventTime + 7200)).toBe('passed');
  });

  it('imports Forex Factory DateTime offsets and ignores invalid timestamps', () => {
    const csv = `DateTime,Currency,Impact,Event,Actual,Forecast,Previous,Detail
2007-01-01T04:30:00+03:30,CNY,High Impact Expected,Manufacturing PMI,54.8,,55.3,"Source, details"
invalid,USD,High,Invalid event,,,,`;
    expect(parseNewsCSV(csv)).toEqual([expect.objectContaining({
      time: Date.UTC(2007, 0, 1, 1) / 1000,
      currency: 'CNY',
      impact: 'high',
      title: 'Manufacturing PMI',
    })]);
  });
});
