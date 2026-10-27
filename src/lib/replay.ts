import { detectBaseTimeframe, type OHLCVBar } from './csvParser';

/**
 * Replay model
 * ------------
 * The replay position is the number of *base* bars revealed (1..N), where base
 * bars are the finest-resolution candles in the loaded data. Higher timeframes
 * are aggregated from the revealed base bars only, so the newest candle on a
 * 1H chart is a partially formed candle — exactly what you would have seen
 * live — and nothing from the future leaks into any timeframe.
 * Lower timeframes are synthesized deterministically from parent base bars.
 */

export interface TimeframeIndex {
  /** Timeframe in minutes. */
  minutes: number;
  /** Fully aggregated or synthesized candles over the whole dataset. */
  bars: OHLCVBar[];
  /** rawStart[i] = index of the first base bar in candle i; rawStart[n] = N. */
  rawStart: number[];
  /** subRatio > 1 when minutes < baseTimeframe */
  subRatio?: number;
}

/**
 * Simple pseudo-random number generator seeded by an integer.
 * Produces deterministic floats in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let s = Math.abs(seed) % 2147483647;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Decomposes a parent base bar into `count` lower-timeframe sub-bars deterministically.
 * Guarantees:
 *  - First sub-bar open = parent.open
 *  - Last sub-bar close = parent.close
 *  - Max across all sub-bar highs = parent.high
 *  - Min across all sub-bar lows = parent.low
 *  - Sum of sub-bar volumes = parent.volume
 */
export function decomposeBar(parent: OHLCVBar, count: number, targetMinutes: number): OHLCVBar[] {
  if (count <= 1) return [parent];

  const targetSec = Math.max(1, Math.round(targetMinutes * 60));
  const rand = seededRandom(parent.time);
  const subBars: OHLCVBar[] = [];

  const isBull = parent.close >= parent.open;
  const lowIdx = isBull ? Math.min(Math.floor(count * 0.25), count - 2) : Math.max(Math.floor(count * 0.75), 1);
  const highIdx = isBull ? Math.max(Math.floor(count * 0.75), 1) : Math.min(Math.floor(count * 0.25), count - 2);

  const totalRange = Math.max(0.00001, parent.high - parent.low);
  const priceStep = (parent.close - parent.open) / count;
  let curPrice = parent.open;
  const subVol = parent.volume / count;

  for (let i = 0; i < count; i++) {
    const subTime = parent.time + i * targetSec;
    const subOpen = curPrice;
    let subClose = i === count - 1 ? parent.close : subOpen + priceStep + (rand() - 0.5) * totalRange * 0.2;

    // Clamp subClose inside parent extremes
    subClose = Math.max(parent.low, Math.min(parent.high, subClose));

    let subHigh = Math.max(subOpen, subClose) + rand() * totalRange * 0.15;
    let subLow = Math.min(subOpen, subClose) - rand() * totalRange * 0.15;

    // Anchor the parent high and low
    if (i === highIdx) subHigh = parent.high;
    if (i === lowIdx) subLow = parent.low;

    subHigh = Math.max(subHigh, subOpen, subClose);
    subLow = Math.min(subLow, subOpen, subClose);
    subHigh = Math.min(parent.high, subHigh);
    subLow = Math.max(parent.low, subLow);

    subBars.push({
      time: subTime,
      open: subOpen,
      high: subHigh,
      low: subLow,
      close: subClose,
      volume: subVol,
    });
    curPrice = subClose;
  }

  // Ensure exact extreme invariants
  let currentMax = -Infinity;
  let currentMin = Infinity;
  for (const sb of subBars) {
    if (sb.high > currentMax) currentMax = sb.high;
    if (sb.low < currentMin) currentMin = sb.low;
  }
  if (currentMax < parent.high && subBars[highIdx]) subBars[highIdx].high = parent.high;
  if (currentMin > parent.low && subBars[lowIdx]) subBars[lowIdx].low = parent.low;

  return subBars;
}

/** Aggregate or synthesize base bars into candles of `minutes`, remembering where each begins. */
export function buildTimeframeIndex(raw: OHLCVBar[], minutes: number): TimeframeIndex {
  const bars: OHLCVBar[] = [];
  const rawStart: number[] = [];
  if (raw.length === 0) return { minutes, bars, rawStart: [0] };

  const baseMinutes = detectBaseTimeframe(raw);

  // Case 1: minutes < baseMinutes -> Lower Timeframe Synthesis
  if (minutes < baseMinutes) {
    const subRatio = Math.max(2, Math.round(baseMinutes / minutes));
    for (let i = 0; i < raw.length; i++) {
      const sub = decomposeBar(raw[i], subRatio, minutes);
      for (let j = 0; j < sub.length; j++) {
        bars.push(sub[j]);
        rawStart.push(i);
      }
    }
    rawStart.push(raw.length);
    return { minutes, bars, rawStart, subRatio };
  }

  // Case 2: Standard higher or equal timeframe aggregation
  const intervalSec = Math.max(1, Math.round(minutes * 60));
  let bucket = -1;
  let cur: OHLCVBar | null = null;

  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    const start = Math.floor(b.time / intervalSec) * intervalSec;
    if (start !== bucket || !cur) {
      if (cur) bars.push(cur);
      bucket = start;
      cur = { time: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      rawStart.push(i);
    } else {
      if (b.high > cur.high) cur.high = b.high;
      if (b.low < cur.low) cur.low = b.low;
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) bars.push(cur);
  rawStart.push(raw.length);
  return { minutes, bars, rawStart };
}

/** Index of the candle containing base bar `rawIdx` (binary search). */
export function candleIndexForRaw(index: TimeframeIndex, rawIdx: number): number {
  if (index.subRatio && index.subRatio > 1) {
    return Math.max(0, Math.min(rawIdx * index.subRatio, index.bars.length - 1));
  }

  const { rawStart } = index;
  let lo = 0;
  let hi = rawStart.length - 2; // last real candle
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rawStart[mid] <= rawIdx) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Candles visible when `position` base bars are revealed.
 */
export function visibleCandles(raw: OHLCVBar[], index: TimeframeIndex, position: number): OHLCVBar[] {
  const pos = Math.max(0, Math.min(position, raw.length));
  if (pos === 0) return [];

  if (index.subRatio && index.subRatio > 1) {
    const count = pos * index.subRatio;
    return index.bars.slice(0, count);
  }

  const last = candleIndexForRaw(index, pos - 1);
  const out = index.bars.slice(0, last);

  const from = index.rawStart[last];
  const first = raw[from];
  const partial: OHLCVBar = {
    time: index.bars[last].time,
    open: first.open,
    high: first.high,
    low: first.low,
    close: first.close,
    volume: first.volume,
  };
  for (let i = from + 1; i < pos; i++) {
    const b = raw[i];
    if (b.high > partial.high) partial.high = b.high;
    if (b.low < partial.low) partial.low = b.low;
    partial.close = b.close;
    partial.volume += b.volume;
  }
  out.push(partial);
  return out;
}

export type StepUnit = 'bar' | 'candle';

/**
 * Position after stepping `count` units forward (negative = backward).
 *  - 'bar'    moves by base bars
 *  - 'candle' moves to the close of the Nth next candle on the current
 *             timeframe (or back to the close of the Nth previous candle)
 */
export function stepPosition(
  index: TimeframeIndex,
  position: number,
  total: number,
  unit: StepUnit,
  count: number,
): number {
  if (total === 0) return 0;
  if (unit === 'bar' || index.minutes <= 0) {
    return clampPosition(position + count, total);
  }

  if (index.subRatio && index.subRatio > 1) {
    return clampPosition(position + count, total);
  }

  const candles = index.bars.length;
  const cur = candleIndexForRaw(index, Math.max(0, position - 1));
  if (count > 0) {
    // From a partial candle the first step completes it; from a closed candle
    // it completes the next one.
    const isPartial = position < index.rawStart[cur + 1];
    const target = Math.min(cur + count - (isPartial ? 1 : 0), candles - 1);
    return clampPosition(index.rawStart[target + 1], total);
  }
  if (count < 0) {
    // Back to the close of an earlier candle. If the current candle is
    // partial, the first step back lands on the previous candle's close.
    const target = cur + count; // candle whose close we want
    if (target < 0) return clampPosition(1, total);
    return clampPosition(index.rawStart[target + 1], total);
  }
  return position;
}

export function clampPosition(position: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.min(Math.round(position), total));
}

/** First base-bar index whose time is >= `time` (binary search), or N if none. */
export function lowerBoundByTime(raw: OHLCVBar[], time: number): number {
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (raw[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Playback tick settings for a given speed (units per second). */
export function playbackTick(speed: number): { intervalMs: number; unitsPerTick: number } {
  const perSecond = Math.max(0.05, speed);
  const MIN_INTERVAL = 40; // keep the UI responsive at high speeds
  const ideal = 1000 / perSecond;
  if (ideal >= MIN_INTERVAL) return { intervalMs: ideal, unitsPerTick: 1 };
  return { intervalMs: MIN_INTERVAL, unitsPerTick: Math.max(1, Math.round((perSecond * MIN_INTERVAL) / 1000)) };
}

export const SPEEDS = [0.25, 0.5, 1, 2, 3, 5, 10, 20, 50, 100];
export const DEFAULT_SPEED = 2;
export const DEFAULT_START_POSITION = 50;

export function formatTimeframe(minutes: number): string {
  if (minutes >= 10080) return `${minutes / 10080}W`;
  if (minutes >= 1440) return `${minutes / 1440}D`;
  if (minutes >= 60) return `${minutes / 60}H`;
  return `${minutes}m`;
}

/** "2024-03-18 14:05" in UTC shifted by `tzOffsetHours`. */
export function formatBarTime(unixSeconds: number, tzOffsetHours = 0): string {
  const d = new Date((unixSeconds + tzOffsetHours * 3600) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Decimal places needed to show this instrument's prices (e.g. 5 for EURUSD,
 * 3 for USDJPY, 2 for stocks), found by sampling the data. Capped at 8.
 */
export function detectPricePrecision(raw: OHLCVBar[]): number {
  let max = 0;
  const step = Math.max(1, Math.floor(raw.length / 200));
  for (let i = 0; i < raw.length; i += step) {
    const b = raw[i];
    for (const v of [b.open, b.high, b.low, b.close]) {
      const str = String(v);
      if (str.includes('e')) continue;
      const dot = str.indexOf('.');
      if (dot !== -1) max = Math.max(max, str.length - dot - 1);
    }
  }
  return Math.min(8, Math.max(2, max));
}

/**
 * Generates synthetic whitespace timestamps for a blank chart (when no dataset is loaded).
 * Creates past and future intervals so the lower timeline is active and drawing tools can work.
 */
export function generateBlankChartWhitespace(timeframeMinutes = 60, count = 100, tzOffset = 0): { time: number }[] {
  const interval = Math.max(60, Math.round(timeframeMinutes * 60));
  const baseTime = Math.floor(Date.now() / 1000 / interval) * interval + tzOffset * 3600;
  const start = baseTime - Math.floor(count / 2) * interval;
  const items: { time: number }[] = [];
  for (let i = 0; i < count; i++) {
    items.push({ time: start + i * interval });
  }
  return items;
}

/**
 * Builds the full timeline for Lightweight Charts:
 * 1. Revealed bars (up to current replay position) with full OHLC values.
 * 2. Future bars across the dataset with ONLY `time` (Lightweight Charts WhitespaceData).
 * This enables viewing all future date/time marks on the lower timeline while keeping the
 * chart completely unrendered/blank ahead of the current replay position.
 */
export function buildTimelineSeriesData(
  revealedCandles: OHLCVBar[],
  allCandles: OHLCVBar[],
  isOHLC: boolean,
  tzOffset: number,
  fallbackTimeframe = 60
): any[] {
  if (revealedCandles.length === 0 && allCandles.length === 0) {
    return generateBlankChartWhitespace(fallbackTimeframe, 120, tzOffset);
  }

  const tzSec = tzOffset * 3600;
  const result: any[] = [];
  const revealedLen = revealedCandles.length;

  for (let i = 0; i < revealedLen; i++) {
    const b = revealedCandles[i];
    const t = b.time + tzSec;
    if (isOHLC) {
      result.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
    } else {
      result.push({ time: t, value: b.close });
    }
  }

  const totalCandles = allCandles.length;
  for (let i = revealedLen; i < totalCandles; i++) {
    result.push({ time: allCandles[i].time + tzSec });
  }

  return result;
}

/**
 * Builds volume data with future whitespace entries to keep timescale aligned.
 */
export function buildTimelineVolumeData(
  revealedCandles: OHLCVBar[],
  allCandles: OHLCVBar[],
  tzOffset: number,
  fallbackTimeframe = 60
): any[] {
  if (revealedCandles.length === 0 && allCandles.length === 0) {
    return generateBlankChartWhitespace(fallbackTimeframe, 120, tzOffset);
  }

  const tzSec = tzOffset * 3600;
  const result: any[] = [];
  const revealedLen = revealedCandles.length;

  for (let i = 0; i < revealedLen; i++) {
    const b = revealedCandles[i];
    result.push({
      time: b.time + tzSec,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(76, 175, 80, 0.25)' : 'rgba(224, 83, 71, 0.25)',
    });
  }

  const totalCandles = allCandles.length;
  for (let i = revealedLen; i < totalCandles; i++) {
    result.push({ time: allCandles[i].time + tzSec });
  }

  return result;
}
