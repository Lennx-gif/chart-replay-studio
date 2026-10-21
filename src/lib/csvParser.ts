import Papa from 'papaparse';

export interface OHLCVBar {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function parseTimestampToSeconds(dateStr: string, timeStr?: string): number | null {
  if (!dateStr) return null;
  const trimmedDate = String(dateStr).trim();
  const trimmedTime = timeStr ? String(timeStr).trim() : '';

  // 1. Numeric unix timestamp (seconds or milliseconds)
  const num = Number(trimmedDate);
  if (!isNaN(num) && num > 0 && !trimmedDate.includes('-') && !trimmedDate.includes('/') && !trimmedDate.includes('.')) {
    if (num > 1e11) {
      return Math.floor(num / 1000);
    }
    if (num > 1e8) {
      return Math.floor(num);
    }
  }

  // 2. Compact format: YYYYMMDD with optional HH:MM:SS
  if (/^\d{8}$/.test(trimmedDate)) {
    const y = trimmedDate.slice(0, 4);
    const m = trimmedDate.slice(4, 6);
    const d = trimmedDate.slice(6, 8);
    const timePart = trimmedTime || '00:00:00';
    const parsed = new Date(`${y}-${m}-${d}T${timePart}Z`);
    if (!isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);
  }

  // Normalize delimiters (dots and slashes to dashes)
  let normalizedDate = trimmedDate.replace(/[./]/g, '-');
  const parts = normalizedDate.split('-');

  if (parts.length === 3) {
    // DD-MM-YYYY or MM-DD-YYYY where year is at end
    if (parts[2].length === 4) {
      normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    } else if (parts[0].length === 4) {
      normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }

  const timePart = trimmedTime ? (trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime) : '00:00:00';
  const iso = `${normalizedDate}T${timePart}Z`;
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000);
  }

  // Fallback to standard Date
  const fallback = new Date(trimmedTime ? `${trimmedDate} ${trimmedTime}` : trimmedDate);
  if (!isNaN(fallback.getTime())) {
    return Math.floor(fallback.getTime() / 1000);
  }

  return null;
}

export function parseCSV(file: File): Promise<OHLCVBar[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as string[][];
          if (!rows || rows.length === 0) {
            reject(new Error('CSV file is empty'));
            return;
          }

          // Check if first row is a header
          const firstRow = rows[0].map((c) => String(c).trim().toLowerCase());
          const hasHeader = firstRow.some((c) =>
            ['date', 'time', 'timestamp', 'open', 'high', 'low', 'close', 'vol', 'volume'].some((k) => c.includes(k))
          );

          let dateCol = -1;
          let timeCol = -1;
          let openCol = -1;
          let highCol = -1;
          let lowCol = -1;
          let closeCol = -1;
          let volCol = -1;

          if (hasHeader) {
            firstRow.forEach((col, idx) => {
              if (col === 'date' || col === 'timestamp' || col === 'datetime' || col === 'time') {
                if (dateCol === -1) dateCol = idx;
                else if (timeCol === -1) timeCol = idx;
              } else if (col === 'time' && dateCol !== -1) {
                timeCol = idx;
              } else if (col.startsWith('open') || col === 'o') {
                openCol = idx;
              } else if (col.startsWith('high') || col === 'h') {
                highCol = idx;
              } else if (col.startsWith('low') || col === 'l') {
                lowCol = idx;
              } else if (col.startsWith('close') || col === 'c') {
                closeCol = idx;
              } else if (col.startsWith('vol') || col === 'v') {
                volCol = idx;
              }
            });
          }

          // Fallback column positions if header not present or incomplete
          const startIdx = hasHeader ? 1 : 0;
          const defaultCols = rows[startIdx] ? rows[startIdx].length : 6;

          if (dateCol === -1) {
            if (defaultCols >= 7) {
              dateCol = 0;
              timeCol = 1;
              openCol = 2;
              highCol = 3;
              lowCol = 4;
              closeCol = 5;
              volCol = 6;
            } else {
              dateCol = 0;
              timeCol = -1;
              openCol = 1;
              highCol = 2;
              lowCol = 3;
              closeCol = 4;
              volCol = defaultCols >= 6 ? 5 : -1;
            }
          }

          const bars: OHLCVBar[] = [];

          for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 4) continue;

            const dateVal = row[dateCol];
            const timeVal = timeCol !== -1 ? row[timeCol] : undefined;
            const timeSec = parseTimestampToSeconds(dateVal, timeVal);
            if (timeSec === null) continue;

            const o = Number(row[openCol]);
            const h = Number(row[highCol]);
            const l = Number(row[lowCol]);
            const c = Number(row[closeCol]);
            const v = volCol !== -1 ? Number(row[volCol]) || 0 : 0;

            if (!isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
              bars.push({
                time: timeSec,
                open: o,
                high: h,
                low: l,
                close: c,
                volume: v,
              });
            }
          }

          // Sort by time ascending
          bars.sort((a, b) => a.time - b.time);

          // Deduplicate identical timestamps
          const unique: OHLCVBar[] = [];
          for (let i = 0; i < bars.length; i++) {
            if (i === 0 || bars[i].time !== bars[i - 1].time) {
              unique.push(bars[i]);
            }
          }

          if (unique.length === 0) {
            reject(new Error('No valid OHLCV rows could be parsed from this CSV'));
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
