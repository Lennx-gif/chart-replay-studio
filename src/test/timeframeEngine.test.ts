import { describe, it, expect } from 'vitest';
import {
  aggregateBars,
  decomposeBarToSubBars,
  resolveBarsForTimeframe,
  findBarIndexForTimestamp,
  timeframeToLabel,
  labelToMinutes,
} from '../lib/timeframeEngine';
import type { OHLCVBar } from '../lib/csvParser';

describe('Timeframe Engine', () => {
  const sample1mBars: OHLCVBar[] = [
    { time: 1672531200, open: 1.0700, high: 1.0710, low: 1.0695, close: 1.0705, volume: 100 },
    { time: 1672531260, open: 1.0705, high: 1.0715, low: 1.0702, close: 1.0712, volume: 120 },
    { time: 1672531320, open: 1.0712, high: 1.0720, low: 1.0708, close: 1.0718, volume: 140 },
    { time: 1672531380, open: 1.0718, high: 1.0725, low: 1.0714, close: 1.0722, volume: 110 },
    { time: 1672531440, open: 1.0722, high: 1.0730, low: 1.0719, close: 1.0728, volume: 130 },
  ];

  const sample4HBar: OHLCVBar = {
    time: 1672531200,
    open: 1.0700,
    high: 1.0850,
    low: 1.0650,
    close: 1.0820,
    volume: 5000,
  };

  it('correctly aggregates lower timeframe bars into higher timeframe bar', () => {
    const agg5m = aggregateBars(sample1mBars, 5);
    expect(agg5m.length).toBe(1);
    expect(agg5m[0].open).toBe(sample1mBars[0].open);
    expect(agg5m[0].close).toBe(sample1mBars[sample1mBars.length - 1].close);
    expect(agg5m[0].high).toBe(1.0730);
    expect(agg5m[0].low).toBe(1.0695);
    expect(agg5m[0].volume).toBe(600);
  });

  it('decomposes a 4H bar into 4 one-hour sub-bars preserving exact invariants', () => {
    const subBars = decomposeBarToSubBars(sample4HBar, 240, 60);
    expect(subBars.length).toBe(4);

    // Invariant 1: First bar open == parent open
    expect(subBars[0].open).toBe(sample4HBar.open);

    // Invariant 2: Last bar close == parent close
    expect(subBars[subBars.length - 1].close).toBe(sample4HBar.close);

    // Invariant 3: Highest high across all sub-bars == parent high
    const maxHigh = Math.max(...subBars.map((b) => b.high));
    expect(maxHigh).toBe(sample4HBar.high);

    // Invariant 4: Lowest low across all sub-bars == parent low
    const minLow = Math.min(...subBars.map((b) => b.low));
    expect(minLow).toBe(sample4HBar.low);

    // Invariant 5: Total volume preserved
    const totalVol = subBars.reduce((s, b) => s + b.volume, 0);
    expect(totalVol).toBe(sample4HBar.volume);
  });

  it('decomposes a 4H bar into 16 fifteen-minute sub-bars deterministically', () => {
    const run1 = decomposeBarToSubBars(sample4HBar, 240, 15);
    const run2 = decomposeBarToSubBars(sample4HBar, 240, 15);
    expect(run1.length).toBe(16);
    expect(run1).toEqual(run2); // Deterministic! No flicker!
  });

  it('resolves timeframes upwards and downwards seamlessly', () => {
    // 1m -> 5m (aggregation)
    const agg = resolveBarsForTimeframe(sample1mBars, 1, 5);
    expect(agg.length).toBe(1);

    // 4H -> 1H (decomposition)
    const decomp = resolveBarsForTimeframe([sample4HBar], 240, 60);
    expect(decomp.length).toBe(4);
  });

  it('finds binary search bar index for timestamp correctly', () => {
    const idx = findBarIndexForTimestamp(sample1mBars, 1672531320);
    expect(idx).toBe(2);
  });

  it('formats and parses timeframe labels', () => {
    expect(timeframeToLabel(1)).toBe('1m');
    expect(timeframeToLabel(60)).toBe('1H');
    expect(timeframeToLabel(240)).toBe('4H');
    expect(timeframeToLabel(1440)).toBe('1D');
    expect(labelToMinutes('15m')).toBe(15);
    expect(labelToMinutes('4h')).toBe(240);
  });
});
