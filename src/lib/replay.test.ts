import { describe, it, expect } from 'vitest';
import { makeBars } from '@/test/helpers';
import {
  buildTimeframeIndex, candleIndexForRaw, detectPricePrecision, clampPosition, lowerBoundByTime, playbackTick, stepPosition, visibleCandles,
} from './replay';

// 5-minute bars; a 15m candle holds 3 base bars.
const raw = makeBars(30, 5);

describe('visibleCandles', () => {
  it('builds a partial last candle from revealed bars only (no future leak)', () => {
    const idx = buildTimeframeIndex(raw, 15);
    const out = visibleCandles(raw, idx, 4); // 1 full 15m candle + 1 bar of the next
    expect(out).toHaveLength(2);
    const partial = out[1];
    expect(partial.open).toBe(raw[3].open);
    expect(partial.close).toBe(raw[3].close);
    expect(partial.high).toBe(raw[3].high); // would be raw[5].high if the future leaked
  });

  it('matches full aggregation once a candle is complete', () => {
    const idx = buildTimeframeIndex(raw, 15);
    const out = visibleCandles(raw, idx, 6);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(idx.bars[1]);
  });

  it('is empty at position 0', () => {
    expect(visibleCandles(raw, buildTimeframeIndex(raw, 15), 0)).toEqual([]);
  });
});

describe('stepPosition', () => {
  const idx = buildTimeframeIndex(raw, 15);
  it('steps by base bars', () => {
    expect(stepPosition(idx, 10, raw.length, 'bar', 1)).toBe(11);
    expect(stepPosition(idx, 10, raw.length, 'bar', -3)).toBe(7);
  });
  it('steps forward by candle: completes a partial candle first', () => {
    expect(stepPosition(idx, 4, raw.length, 'candle', 1)).toBe(6); // 4 is mid-candle → close at 6
    expect(stepPosition(idx, 6, raw.length, 'candle', 1)).toBe(9); // from a close → next close
  });
  it('steps back by candle to the previous close', () => {
    expect(stepPosition(idx, 9, raw.length, 'candle', -1)).toBe(6);
    expect(stepPosition(idx, 7, raw.length, 'candle', -1)).toBe(6); // partial candle → previous close
    expect(stepPosition(idx, 6, raw.length, 'candle', -1)).toBe(3); // from a close → the close before
  });
  it('clamps at both ends', () => {
    expect(stepPosition(idx, 1, raw.length, 'bar', -5)).toBe(1);
    expect(stepPosition(idx, 29, raw.length, 'bar', 5)).toBe(30);
    expect(clampPosition(0, 30)).toBe(1);
  });
});

describe('helpers', () => {
  it('finds a candle for a base bar', () => {
    const idx = buildTimeframeIndex(raw, 15);
    expect(candleIndexForRaw(idx, 0)).toBe(0);
    expect(candleIndexForRaw(idx, 2)).toBe(0);
    expect(candleIndexForRaw(idx, 3)).toBe(1);
  });
  it('lowerBoundByTime returns first bar at or after the time', () => {
    expect(lowerBoundByTime(raw, raw[5].time)).toBe(5);
    expect(lowerBoundByTime(raw, raw[5].time + 1)).toBe(6);
    expect(lowerBoundByTime(raw, raw[29].time + 1)).toBe(30);
  });
  it('batches units per tick at high speed', () => {
    expect(playbackTick(2)).toEqual({ intervalMs: 500, unitsPerTick: 1 });
    expect(playbackTick(100).unitsPerTick).toBeGreaterThan(1);
  });
});

describe('detectPricePrecision', () => {
  const bar = (p: number) => ({ time: 0, open: p, high: p, low: p, close: p, volume: 0 });
  it('finds the decimals the instrument needs', () => {
    expect(detectPricePrecision([bar(1.09738), bar(1.1)])).toBe(5);
    expect(detectPricePrecision([bar(150.123), bar(150.1)])).toBe(3);
    expect(detectPricePrecision([bar(187.35), bar(188)])).toBe(2);
    expect(detectPricePrecision([bar(100), bar(101)])).toBe(2);
  });
});
