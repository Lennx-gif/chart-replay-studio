import Papa from 'papaparse';

export interface OHLCVBar {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Parse a CSV timestamp to unix seconds. Wall-clock times in the file are taken
 * as-is (read as UTC, matching how the chart displays them) so the result does
 * not depend on the browser's time zone. Accepts ISO-like strings
 * ("2024-01-31 14:05:00", "2024.01.31 14:05", "20240131 14:05:00"), date-only
 * values, and epoch seconds/milliseconds. Strings with an explicit zone
 * ("Z", "+03:00") are honoured.
 */
export function parseTimestamp(date: string, time?: string): number | null {
  const raw = (time ? `${date} ${time}` : date).trim();
  if (/^\d{9,13}(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Math.floor(n > 1e11 ? n / 1000 : n);
  }
  let s = raw
    .replace(/^(\d{4})[./](\d{2})[./](\d{2})/, '$1-$2-$3')
    .replace(/^(\d{4})(\d{2})(\d{2})(?=\D|$)/, '$1-$2-$3')
    .replace(' ', 'T');
  if (!s.includes('T')) s += 'T00:00:00';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export function parseCSV(file: File): Promise<OHLCVBar[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as string[][];
          // Skip header row if present
          const startIdx = isNaN(Number(rows[0]?.[rows[0].length >= 7 ? 2 : 1])) ? 1 : 0;
          
          const bars: OHLCVBar[] = [];
          for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 6) continue;

            // 7+ columns: date, time, O, H, L, C, V — otherwise: timestamp, O, H, L, C, V
            const split = row.length >= 7;
            const time = split
              ? parseTimestamp(String(row[0]), String(row[1]))
              : parseTimestamp(String(row[0]));
            const [o, h, l, c, v] = (split ? row.slice(2, 7) : row.slice(1, 6)).map(Number);
            if (time != null && !isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
              bars.push({ time, open: o, high: h, low: l, close: c, volume: v || 0 });
            }
          }

          // Sort by time
          bars.sort((a, b) => a.time - b.time);
          
          // Remove duplicates
          const unique = bars.filter((bar, i) => i === 0 || bar.time !== bars[i - 1].time);

          if (unique.length === 0) {
            reject(new Error('No valid OHLCV data found in CSV'));
            return;
          }

          resolve(unique);
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}

export function resampleBars(bars: OHLCVBar[], intervalMinutes: number): OHLCVBar[] {
  if (bars.length === 0) return [];
  
  const intervalSec = intervalMinutes * 60;
  const resampled: OHLCVBar[] = [];
  
  let currentBucket = Math.floor(bars[0].time / intervalSec) * intervalSec;
  let open = bars[0].open;
  let high = bars[0].high;
  let low = bars[0].low;
  let close = bars[0].close;
  let volume = bars[0].volume;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const bucket = Math.floor(bar.time / intervalSec) * intervalSec;

    if (bucket !== currentBucket) {
      resampled.push({ time: currentBucket, open, high, low, close, volume });
      currentBucket = bucket;
      open = bar.open;
      high = bar.high;
      low = bar.low;
      close = bar.close;
      volume = bar.volume;
    } else {
      high = Math.max(high, bar.high);
      low = Math.min(low, bar.low);
      close = bar.close;
      volume += bar.volume;
    }
  }

  resampled.push({ time: currentBucket, open, high, low, close, volume });
  return resampled;
}

export function applyTimezoneOffset(bars: OHLCVBar[], offsetHours: number): OHLCVBar[] {
  const offsetSec = offsetHours * 3600;
  return bars.map(b => ({ ...b, time: b.time + offsetSec }));
}

export function detectBaseTimeframe(bars: OHLCVBar[]): number {
  if (bars.length < 2) return 5;
  // Find the most common interval
  const diffs: Record<number, number> = {};
  for (let i = 1; i < Math.min(bars.length, 100); i++) {
    const diff = bars[i].time - bars[i - 1].time;
    diffs[diff] = (diffs[diff] || 0) + 1;
  }
  const mostCommon = Number(Object.entries(diffs).sort((a, b) => b[1] - a[1])[0][0]);
  return Math.round(mostCommon / 60);
}
