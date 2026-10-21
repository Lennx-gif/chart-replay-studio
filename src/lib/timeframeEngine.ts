import type { OHLCVBar } from './csvParser';

export interface TimeframeOption {
  minutes: number;
  label: string;
  category: 'intraday' | 'daily' | 'macro';
}

export const TIMEFRAMES: TimeframeOption[] = [
  { minutes: 1, label: '1m', category: 'intraday' },
  { minutes: 3, label: '3m', category: 'intraday' },
  { minutes: 5, label: '5m', category: 'intraday' },
  { minutes: 15, label: '15m', category: 'intraday' },
  { minutes: 30, label: '30m', category: 'intraday' },
  { minutes: 60, label: '1H', category: 'intraday' },
  { minutes: 120, label: '2H', category: 'intraday' },
  { minutes: 240, label: '4H', category: 'intraday' },
  { minutes: 1440, label: '1D', category: 'daily' },
  { minutes: 10080, label: '1W', category: 'macro' },
];

export function timeframeToLabel(minutes: number): string {
  const match = TIMEFRAMES.find((tf) => tf.minutes === minutes);
  if (match) return match.label;
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}H`;
  return `${minutes / 1440}D`;
}

export function labelToMinutes(label: string): number {
  const clean = label.trim().toLowerCase();
  if (clean.endsWith('m')) return parseInt(clean, 10);
  if (clean.endsWith('h')) return parseInt(clean, 10) * 60;
  if (clean.endsWith('d')) return parseInt(clean, 10) * 1440;
  if (clean.endsWith('w')) return parseInt(clean, 10) * 10080;
  return parseInt(clean, 10) || 60;
}

// Simple deterministic PRNG for reproducible sub-bar shapes
function createPRNG(seed: number) {
  let s = Math.abs(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return function next(): number {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Aggregates lower-timeframe bars into higher-timeframe bars.
 */
export function aggregateBars(bars: OHLCVBar[], targetMinutes: number): OHLCVBar[] {
  if (bars.length === 0) return [];
  const intervalSec = targetMinutes * 60;
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

/**
 * Decomposes a single parent bar into N deterministic sub-bars.
 * Guarantees exact Open, High, Low, Close invariants and distributes Volume.
 */
export function decomposeBarToSubBars(
  parentBar: OHLCVBar,
  parentMinutes: number,
  targetMinutes: number
): OHLCVBar[] {
  const count = Math.max(1, Math.round(parentMinutes / targetMinutes));
  if (count <= 1) {
    return [{ ...parentBar }];
  }

  const subSec = targetMinutes * 60;
  const startTime = parentBar.time;
  const O = parentBar.open;
  const H = parentBar.high;
  const L = parentBar.low;
  const C = parentBar.close;
  const isBullish = C >= O;

  const prng = createPRNG(startTime + parentMinutes * 31);

  // Distribute path milestones across N sub-bars:
  // For Bullish: Open -> dip to Low -> rally to High -> settle to Close
  // For Bearish: Open -> push to High -> drop to Low -> settle to Close
  const lowIndex = isBullish
    ? Math.max(0, Math.floor(count * (0.15 + prng() * 0.2))) // low happens in first 35%
    : Math.min(count - 1, Math.floor(count * (0.6 + prng() * 0.25))); // low happens late (60-85%)

  const highIndex = isBullish
    ? Math.min(count - 1, Math.floor(count * (0.65 + prng() * 0.25))) // high happens late (65-90%)
    : Math.max(0, Math.floor(count * (0.15 + prng() * 0.2))); // high happens early (15-35%)

  // Generate target prices at each sub-bar boundary
  const prices: number[] = new Array(count + 1);
  prices[0] = O;
  prices[count] = C;

  for (let i = 1; i < count; i++) {
    // Basic linear progression with noise
    let baseline = O + ((C - O) * i) / count;

    if (isBullish) {
      if (i <= lowIndex) {
        const t = i / Math.max(1, lowIndex);
        baseline = O + (L - O) * t;
      } else if (i <= highIndex) {
        const t = (i - lowIndex) / Math.max(1, highIndex - lowIndex);
        baseline = L + (H - L) * t;
      } else {
        const t = (i - highIndex) / Math.max(1, count - highIndex);
        baseline = H + (C - H) * t;
      }
    } else {
      if (i <= highIndex) {
        const t = i / Math.max(1, highIndex);
        baseline = O + (H - O) * t;
      } else if (i <= lowIndex) {
        const t = (i - highIndex) / Math.max(1, lowIndex - highIndex);
        baseline = H + (L - H) * t;
      } else {
        const t = (i - lowIndex) / Math.max(1, count - lowIndex);
        baseline = L + (C - L) * t;
      }
    }

    const noise = (prng() - 0.5) * 0.15 * (H - L);
    prices[i] = Math.max(L, Math.min(H, baseline + noise));
  }

  // Ensure high and low are explicitly hit
  prices[lowIndex] = L;
  prices[highIndex] = H;

  // Build OHLC for each sub-bar
  const subBars: OHLCVBar[] = [];
  const baseVolPerBar = parentBar.volume / count;

  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (let i = 0; i < count; i++) {
    const barTime = startTime + i * subSec;
    const barOpen = i === 0 ? O : subBars[i - 1].close;
    const barClose = i === count - 1 ? C : prices[i + 1];

    // Intra-bar wick fluctuation
    const intraRange = Math.abs(barClose - barOpen);
    const wickBuffer = Math.max(intraRange * 0.3, (H - L) * 0.05) * prng();
    let barHigh = Math.max(barOpen, barClose) + wickBuffer;
    let barLow = Math.min(barOpen, barClose) - wickBuffer;

    if (i === highIndex) barHigh = H;
    if (i === lowIndex) barLow = L;

    // Clamp within parent bounds
    barHigh = Math.min(H, Math.max(barHigh, Math.max(barOpen, barClose)));
    barLow = Math.max(L, Math.min(barLow, Math.min(barOpen, barClose)));

    globalMax = Math.max(globalMax, barHigh);
    globalMin = Math.min(globalMin, barLow);

    // Volume distribution with slight U-curve
    const uCurveFactor = 0.8 + 0.4 * Math.sin(((i + 0.5) / count) * Math.PI);
    const barVol = Math.round(baseVolPerBar * uCurveFactor);

    subBars.push({
      time: barTime,
      open: barOpen,
      high: barHigh,
      low: barLow,
      close: barClose,
      volume: barVol,
    });
  }

  // Final invariant enforcement: ensure exact high and low are present
  if (globalMax < H) {
    subBars[highIndex].high = H;
  }
  if (globalMin > L) {
    subBars[lowIndex].low = L;
  }

  // Volume sum match
  const sumVol = subBars.reduce((s, b) => s + b.volume, 0);
  if (sumVol !== parentBar.volume && subBars.length > 0) {
    subBars[0].volume += parentBar.volume - sumVol;
  }

  return subBars;
}

/**
 * Resolves bars for any target timeframe:
 * - If target == base: returns base bars
 * - If target > base: aggregates upwards
 * - If target < base: decomposes downwards into realistic sub-bars
 */
const resolutionCache = new Map<string, OHLCVBar[]>();

export function resolveBarsForTimeframe(
  baseBars: OHLCVBar[],
  baseMinutes: number,
  targetMinutes: number
): OHLCVBar[] {
  if (baseBars.length === 0) return [];
  if (baseMinutes === targetMinutes) return baseBars;

  const cacheKey = `${baseBars[0].time}_${baseBars[baseBars.length - 1].time}_${baseBars.length}_${baseMinutes}_${targetMinutes}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached) return cached;

  let result: OHLCVBar[];

  if (targetMinutes > baseMinutes) {
    // Higher timeframe aggregation
    result = aggregateBars(baseBars, targetMinutes);
  } else {
    // Lower timeframe decomposition
    result = [];
    for (let i = 0; i < baseBars.length; i++) {
      const subs = decomposeBarToSubBars(baseBars[i], baseMinutes, targetMinutes);
      for (let j = 0; j < subs.length; j++) {
        result.push(subs[j]);
      }
    }
  }

  // Keep cache small
  if (resolutionCache.size > 20) {
    resolutionCache.clear();
  }
  resolutionCache.set(cacheKey, result);

  return result;
}

/**
 * Binary search to find the nearest bar index for a given timestamp.
 */
export function findBarIndexForTimestamp(bars: OHLCVBar[], targetTime: number): number {
  if (bars.length === 0) return 0;
  if (targetTime <= bars[0].time) return 0;
  if (targetTime >= bars[bars.length - 1].time) return bars.length - 1;

  let low = 0;
  let high = bars.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const time = bars[mid].time;

    if (time === targetTime) return mid;
    if (time < targetTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, high);
}
