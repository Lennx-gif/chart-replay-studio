import type { OHLCVBar } from '@/lib/csvParser';
import type { SessionRecord } from '@/lib/db';

/** `n` bars spaced `stepMin` minutes apart, starting at 2024-01-01 00:00 UTC. Price walks 100,101,102… */
export function makeBars(n: number, stepMin = 5, startPrice = 100): OHLCVBar[] {
  const t0 = Date.UTC(2024, 0, 1) / 1000;
  return Array.from({ length: n }, (_, i) => {
    const p = startPrice + i;
    return { time: t0 + i * stepMin * 60, open: p, high: p + 0.5, low: p - 0.5, close: p + 0.25, volume: 10 };
  });
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1', name: 'Test', datasetId: 'd1', symbol: 'TEST', createdAt: 0, updatedAt: 0, lastOpenedAt: 0,
    position: 10, startPosition: 10, speed: 2, stepUnit: 'bar', timeframe: 5, tzOffset: 0, chartStyle: 'candles',
    pauseOnTradeEvents: true, bookmarks: [], startingBalance: 10000, orders: [], drawings: [], notes: '',
    totalBars: 100, closedTrades: 0, realizedPnl: 0,
    ...overrides,
  };
}
