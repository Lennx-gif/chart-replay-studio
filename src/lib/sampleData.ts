import type { OHLCVBar } from './csvParser';
import { saveDataset } from './store';
import type { DatasetRecord } from './db';

/** Deterministic pseudo-random number generator (Mulberry32) */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate high-quality realistic sample OHLCV data for instant testing
 * without needing an external CSV download.
 */
export function generateSampleBars(type: 'EURUSD' | 'BTCUSD'): OHLCVBar[] {
  const bars: OHLCVBar[] = [];

  if (type === 'EURUSD') {
    // 1H bars over ~3 months (1,200 bars)
    // Start timestamp: 2024-01-08 00:00:00 UTC (Monday)
    const startTime = 1704672000;
    const intervalSec = 3600; // 1 hour
    const rand = mulberry32(42);

    let price = 1.095;
    let trend = 0.00005;

    for (let i = 0; i < 1200; i++) {
      const time = startTime + i * intervalSec;
      const dayOfWeek = new Date(time * 1000).getUTCDay();

      // Skip weekend hours (Saturday = 6, Sunday before 21:00)
      if (dayOfWeek === 6) continue;
      if (dayOfWeek === 0 && new Date(time * 1000).getUTCHours() < 21) continue;

      // Periodically shift trend
      if (i % 80 === 0) {
        trend = (rand() - 0.5) * 0.0003;
      }

      const open = price;
      const change = trend + (rand() - 0.495) * 0.0018;
      let close = open + change;
      close = Math.max(1.05, Math.min(1.13, close));

      const wickHigh = rand() * 0.0012;
      const wickLow = rand() * 0.0012;
      const high = Math.max(open, close) + wickHigh;
      const low = Math.min(open, close) - wickLow;

      const volume = Math.floor(1500 + rand() * 4500 + (Math.abs(change) / 0.001) * 2000);

      bars.push({
        time,
        open: Number(open.toFixed(5)),
        high: Number(high.toFixed(5)),
        low: Number(low.toFixed(5)),
        close: Number(close.toFixed(5)),
        volume,
      });

      price = close;
    }
  } else {
    // BTCUSD: 1D bars over 2 years (~730 bars)
    // Start timestamp: 2023-01-01 00:00:00 UTC
    const startTime = 1672531200;
    const intervalSec = 86400; // 1 day
    const rand = mulberry32(1337);

    let price = 16500;
    let target = 68000;

    for (let i = 0; i < 730; i++) {
      const time = startTime + i * intervalSec;

      // Long term upward macro drift with crypto cycles
      const cycle = Math.sin((i / 730) * Math.PI * 1.5);
      const macroDrift = (target - 16500) / 730 + cycle * 45;

      const dailyVolatility = price * (0.015 + rand() * 0.035);
      const change = macroDrift + (rand() - 0.47) * dailyVolatility;

      const open = price;
      let close = Math.max(15000, open + change);

      const wickHigh = rand() * dailyVolatility * 0.6;
      const wickLow = rand() * dailyVolatility * 0.6;
      const high = Math.max(open, close) + wickHigh;
      const low = Math.max(14000, Math.min(open, close) - wickLow);

      const volume = Math.floor(15000 + rand() * 65000 + (dailyVolatility / 1000) * 8000);

      bars.push({
        time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });

      price = close;
    }
  }

  return bars;
}

/**
 * Ensures standard sample datasets are available for quick onboarding.
 */
export async function installSampleDataset(type: 'EURUSD' | 'BTCUSD'): Promise<DatasetRecord> {
  const bars = generateSampleBars(type);
  const name = type === 'EURUSD' ? 'EURUSD · 1H Sample' : 'BTCUSD · 1D Sample';
  return saveDataset(name, bars);
}
