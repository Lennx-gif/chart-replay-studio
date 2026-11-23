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
 * Accepts a Forex Factory DateTime column or separate Date and Time columns.
 * Explicit offsets are honored. Timestamps without an offset are treated as UTC.
 */
export function parseNewsCSV(csvContent: string): NewsEventRecord[] {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  return parseNewsRows(result.data).sort((a, b) => a.time - b.time);
}

export function parseNewsFile(file: File): Promise<NewsEventRecord[]> {
  return new Promise((resolve, reject) => {
    const records: NewsEventRecord[] = [];
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 1024,
      chunk: ({ data }) => {
        for (const record of parseNewsRows(data)) records.push(record);
      },
      complete: () => resolve(records.sort((a, b) => a.time - b.time)),
      error: reject,
    });
  });
}

function parseNewsRows(rows: Record<string, string>[]): NewsEventRecord[] {
  const records: NewsEventRecord[] = [];

  for (const row of rows) {
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

    const dateTime = getCol('datetime', 'date time', 'timestamp');
    const combined = dateTime || [dateStr, timeStr].filter(Boolean).join(' ');
    if (!dateTime && !dateStr) continue;
    const explicitZone = /(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})$/i.test(combined);
    const timestamp = explicitZone
      ? combined
      : combined.includes('T') && /^\d{4}-\d{2}-\d{2}T/.test(combined)
        ? `${combined}Z`
        : `${combined} UTC`;
    const time = Math.floor(Date.parse(timestamp) / 1000);

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

  return records;
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
