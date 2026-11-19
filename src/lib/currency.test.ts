import { describe, it, expect } from 'vitest';
import { getInstrumentSpec, priceDiffToPips, pipsToPriceDelta } from './currency';

describe('currency and instrument specifications', () => {
  it('correctly configures EURUSD with 0.0001 pip size and $10/pip on 1 lot', () => {
    const spec = getInstrumentSpec('EURUSD', 1.085);
    expect(spec.pipSize).toBe(0.0001);
    expect(spec.contractSize).toBe(100000);
    expect(spec.getPipValuePerLot(1.085)).toBe(10);
    expect(priceDiffToPips(0.0020, 'EURUSD', 1.085)).toBeCloseTo(20);
    expect(pipsToPriceDelta(50, 'EURUSD', 1.085)).toBeCloseTo(0.0050);
  });

  it('dynamically computes USDJPY pip value based on exchange rate', () => {
    const spec = getInstrumentSpec('USDJPY', 150.0);
    expect(spec.pipSize).toBe(0.01);
    expect(spec.contractSize).toBe(100000);
    // 1000 JPY / 150 = $6.6667
    expect(spec.getPipValuePerLot(150.0)).toBeCloseTo(6.6667, 3);
    expect(priceDiffToPips(0.50, 'USDJPY', 150.0)).toBeCloseTo(50);
  });

  it('correctly configures Gold (XAUUSD)', () => {
    const spec = getInstrumentSpec('XAUUSD', 2650.0);
    expect(spec.pipSize).toBe(0.1);
    expect(spec.contractSize).toBe(100);
    expect(spec.getPipValuePerLot(2650.0)).toBe(10);
    expect(priceDiffToPips(5.0, 'XAUUSD', 2650.0)).toBeCloseTo(50);
  });

  it('correctly configures Bitcoin (BTCUSD)', () => {
    const spec = getInstrumentSpec('BTCUSD', 65000.0);
    expect(spec.pipSize).toBe(1.0);
    expect(spec.contractSize).toBe(1);
    expect(spec.getPipValuePerLot(65000.0)).toBe(1.0);
  });
});
