import Papa from 'papaparse';

export interface OHLCVBar {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
          const startIdx = isNaN(Number(rows[0]?.[2])) ? 1 : 0;
          
          const bars: OHLCVBar[] = [];
          for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 6) continue;

            let timestamp: Date | null = null;

            // Try format: date, time, o, h, l, c, v (7 cols)
            if (row.length >= 7) {
              const dateStr = String(row[0]).trim();
              const timeStr = String(row[1]).trim();
              // Format: YYYYMMDD HH:MM:SS
              if (/^\d{8}$/.test(dateStr)) {
                const y = dateStr.slice(0, 4);
                const m = dateStr.slice(4, 6);
                const d = dateStr.slice(6, 8);
                timestamp = new Date(`${y}-${m}-${d}T${timeStr}`);
              } else {
                timestamp = new Date(`${dateStr} ${timeStr}`);
              }
              const o = Number(row[2]);
              const h = Number(row[3]);
              const l = Number(row[4]);
              const c = Number(row[5]);
              const v = Number(row[6]) || 0;
              if (timestamp && !isNaN(timestamp.getTime()) && !isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
                bars.push({ time: Math.floor(timestamp.getTime() / 1000), open: o, high: h, low: l, close: c, volume: v });
              }
            }
            // Try format: timestamp, o, h, l, c, v (6 cols)
            else if (row.length >= 6) {
              timestamp = new Date(String(row[0]).trim());
              const o = Number(row[1]);
              const h = Number(row[2]);
              const l = Number(row[3]);
              const c = Number(row[4]);
              const v = Number(row[5]) || 0;
              if (timestamp && !isNaN(timestamp.getTime()) && !isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
                bars.push({ time: Math.floor(timestamp.getTime() / 1000), open: o, high: h, low: l, close: c, volume: v });
              }
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
