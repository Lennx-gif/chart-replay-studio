import { describe, it, expect } from 'vitest';
import { generateSampleBars } from './sampleData';

describe('sampleData generator', () => {
  it('generates consistent, valid 1H bars for EURUSD', () => {
    const bars1 = generateSampleBars('EURUSD');
    const bars2 = generateSampleBars('EURUSD');

    expect(bars1.length).toBeGreaterThan(500);
    expect(bars1.length).toEqual(bars2.length);

    // Verify determinism
    expect(bars1[0]).toEqual(bars2[0]);
    expect(bars1[100]).toEqual(bars2[100]);

    // Verify OHLC invariants
    for (const b of bars1.slice(0, 50)) {
      expect(b.high).toBeGreaterThanOrEqual(b.open);
      expect(b.high).toBeGreaterThanOrEqual(b.close);
      expect(b.low).toBeLessThanOrEqual(b.open);
      expect(b.low).toBeLessThanOrEqual(b.close);
      expect(b.volume).toBeGreaterThan(0);
    }
  });

  it('generates consistent, valid 1D bars for BTCUSD', () => {
    const bars = generateSampleBars('BTCUSD');

    expect(bars.length).toBe(730);
    expect(bars[0].open).toBeGreaterThan(10000);

    for (const b of bars.slice(0, 50)) {
      expect(b.high).toBeGreaterThanOrEqual(b.open);
      expect(b.high).toBeGreaterThanOrEqual(b.close);
      expect(b.low).toBeLessThanOrEqual(b.open);
      expect(b.low).toBeLessThanOrEqual(b.close);
    }
  });
});
