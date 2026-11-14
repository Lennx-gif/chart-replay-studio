import { describe, it, expect } from 'vitest';
import type { SessionRecord } from '@/lib/db';
import { calculateSessionAnalytics, type Order } from '@/lib/tradeEngine';

describe('DashboardAnalytics Aggregation & Filtering Logic', () => {
  const baseTime = 1700000000; // arbitrary timestamp

  const mockOrdersSession1: Order[] = [
    {
      id: 'o1',
      status: 'closed',
      side: 'buy',
      type: 'market',
      entryPrice: 1.0500,
      fillPrice: 1.0500,
      closePrice: 1.0550,
      size: 1.0,
      createdTime: baseTime,
      fillTime: baseTime,
      closeTime: baseTime + 3600,
      pnl: 500,
      pnlPips: 50,
    },
    {
      id: 'o2',
      status: 'closed',
      side: 'sell',
      type: 'market',
      entryPrice: 1.0550,
      fillPrice: 1.0550,
      closePrice: 1.0580,
      size: 1.0,
      createdTime: baseTime + 7200,
      fillTime: baseTime + 7200,
      closeTime: baseTime + 10800,
      pnl: -300,
      pnlPips: -30,
    },
  ];

  const mockOrdersSession2: Order[] = [
    {
      id: 'o3',
      status: 'closed',
      side: 'buy',
      type: 'market',
      entryPrice: 150.00,
      fillPrice: 150.00,
      closePrice: 151.00,
      size: 2.0,
      createdTime: baseTime + 20000,
      fillTime: baseTime + 20000,
      closeTime: baseTime + 25000,
      pnl: 1000,
      pnlPips: 100,
    },
    {
      id: 'o4',
      status: 'closed',
      side: 'buy',
      type: 'market',
      entryPrice: 151.00,
      fillPrice: 151.00,
      closePrice: 151.00,
      size: 1.0,
      createdTime: baseTime + 30000,
      fillTime: baseTime + 30000,
      closeTime: baseTime + 32000,
      pnl: 0,
      pnlPips: 0,
    },
  ];

  const mockSessions: Partial<SessionRecord>[] = [
    {
      id: 'sess-1',
      name: 'London Breakout EURUSD',
      symbol: 'EURUSD',
      startingBalance: 10000,
      orders: mockOrdersSession1,
    },
    {
      id: 'sess-2',
      name: 'Tokyo Trend USDJPY',
      symbol: 'USDJPY',
      startingBalance: 20000,
      orders: mockOrdersSession2,
    },
  ];

  it('aggregates trades across all sessions into general analytics metrics', () => {
    const allTrades = [
      ...(mockSessions[0].orders || []),
      ...(mockSessions[1].orders || []),
    ];

    const analytics = calculateSessionAnalytics(allTrades, 10000, 0);

    expect(analytics.totalTrades).toBe(4);
    expect(analytics.closedTrades).toBe(4);
    expect(analytics.wins).toBe(2);
    expect(analytics.losses).toBe(1);
    expect(analytics.breakEvens).toBe(1);
    expect(analytics.winRate).toBe(50); // 2 wins out of 4 trades = 50%
    expect(analytics.netPnl).toBe(1200); // 500 - 300 + 1000 + 0 = 1200
    expect(analytics.grossProfit).toBe(1500);
    expect(analytics.grossLoss).toBe(300);
    expect(analytics.profitFactor).toBe(5); // 1500 / 300 = 5.0
    expect(analytics.expectancy).toBe(300); // 1200 / 4 = 300
  });

  it('filters correctly when single session is selected', () => {
    const session1Trades = mockSessions[0].orders || [];
    const analytics = calculateSessionAnalytics(session1Trades, 10000, 0);

    expect(analytics.totalTrades).toBe(2);
    expect(analytics.wins).toBe(1);
    expect(analytics.losses).toBe(1);
    expect(analytics.winRate).toBe(50);
    expect(analytics.netPnl).toBe(200); // 500 - 300 = 200
  });

  it('filters by side (buy vs sell)', () => {
    const allTrades = [
      ...(mockSessions[0].orders || []),
      ...(mockSessions[1].orders || []),
    ];

    const buysOnly = allTrades.filter((t) => t.side === 'buy');
    const analytics = calculateSessionAnalytics(buysOnly, 10000, 0);

    expect(analytics.totalTrades).toBe(3);
    expect(analytics.wins).toBe(2);
    expect(analytics.breakEvens).toBe(1);
    expect(analytics.netPnl).toBe(1500); // 500 + 1000 = 1500
  });

  it('filters by outcome (wins, losses, breakeven)', () => {
    const allTrades = [
      ...(mockSessions[0].orders || []),
      ...(mockSessions[1].orders || []),
    ];

    const winsOnly = allTrades.filter((t) => (t.pnl ?? 0) > 0.0001);
    const analytics = calculateSessionAnalytics(winsOnly, 10000, 0);

    expect(analytics.totalTrades).toBe(2);
    expect(analytics.winRate).toBe(100);
    expect(analytics.netPnl).toBe(1500);
  });
});
