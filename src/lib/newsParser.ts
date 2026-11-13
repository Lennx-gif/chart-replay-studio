import Papa from 'papaparse';
import type { NewsEventRecord, NewsImpact } from './db';

export function normalizeImpact(raw: string): NewsImpact {
  const s = (raw || '').toLowerCase().trim();
  if (s.includes('high') || s.includes('red')) return 'high';
  if (s.includes('med') || s.includes('orange')) return 'medium';
  return 'low';
}

/**
 * Parse economic calendar CSV text (ForexFactory format or generic CSV).
 * Expected headers or columns:
 * Date, Time, Currency, Impact, Event, Actual, Forecast, Previous
 */
export function parseNewsCSV(csvContent: string): NewsEventRecord[] {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const records: NewsEventRecord[] = [];

  for (const row of result.data) {
    // Find keys case-insensitively
    const getCol = (...names: string[]) => {
      for (const name of names) {
        for (const [k, v] of Object.entries(row)) {
          if (k.trim().toLowerCase() === name.toLowerCase()) return (v || '').trim();
        }
      }
      return '';
    };

    const dateStr = getCol('date', 'day');
    const timeStr = getCol('time', 'time (utc)', 'utc');
    const currency = getCol('currency', 'curr', 'country', 'ccy').toUpperCase() || 'USD';
    const impactRaw = getCol('impact', 'severity', 'priority');
    const title = getCol('event', 'title', 'headline', 'name') || 'Economic Event';
    const actual = getCol('actual', 'act') || undefined;
    const forecast = getCol('forecast', 'f/c', 'fcst', 'consensus') || undefined;
    const previous = getCol('previous', 'prev') || undefined;

    if (!title || (!dateStr && !timeStr)) continue;

    // Parse date & time into unix seconds UTC
    let time = 0;
    try {
      const combined = `${dateStr} ${timeStr}`.trim();
      const parsed = Date.parse(combined);
      if (!isNaN(parsed)) {
        time = Math.floor(parsed / 1000);
      } else {
        const dOnly = Date.parse(dateStr);
        if (!isNaN(dOnly)) time = Math.floor(dOnly / 1000);
      }
    } catch {
      continue;
    }

    if (time > 0) {
      records.push({
        id: `news-${crypto.randomUUID()}`,
        time,
        currency,
        title,
        impact: normalizeImpact(impactRaw),
        actual,
        forecast,
        previous,
      });
    }
  }

  return records.sort((a, b) => a.time - b.time);
}

export type ReplayEventStatus = 'upcoming' | 'active' | 'passed';

/**
 * Returns event status relative to the current replay bar timestamp.
 * - Active: within 15 minutes before or after current bar
 * - Upcoming: in the future relative to current bar
 * - Passed: happened more than 15 minutes in the past
 */
export function getReplayEventStatus(eventTime: number, currentReplayTime: number): ReplayEventStatus {
  const diffSec = eventTime - currentReplayTime;
  if (Math.abs(diffSec) <= 900) return 'active';
  if (diffSec > 900) return 'upcoming';
  return 'passed';
}
