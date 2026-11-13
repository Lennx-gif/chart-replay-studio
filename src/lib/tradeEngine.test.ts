import { describe, it, expect } from 'vitest';
import { makeBars } from '@/test/helpers';
import {
  createLimitOrder,
  createMarketOrder,
  processBars,
  rewindOrders,
  getContractMultiplier,
  getPipSize,
  calculateRiskPositionSize,
  closeOrder,
  calculateSessionLedger,
  setBreakEven,
  partialCloseOrder,
  calculateSessionAnalytics,
} from './tradeEngine';

const bars = makeBars(20, 5);

describe('processBars', () => {
  it('does not skip an SL/TP hit in the middle of a jump', () => {
    // Long at 100 with TP 103: bar i has high i+100.5, so TP trips on bar 3.
    const order = createMarketOrder('buy', 100, bars[0].time, 1, 90, 103);
    const [done] = processBars(bars.slice(1, 15), [order]);
    expect(done.status).toBe('closed');
    expect(done.closeReason).toBe('tp');
    expect(done.closeTime).toBe(bars[3].time);
  });

  it('calculates expected pip movements and standard Forex lot profit', () => {
    // 1 standard lot of EURUSD at 1.0800 with TP at 1.0820 (20 pips)
    const fxBar: any = { time: 1000, open: 1.0805, high: 1.0825, low: 1.0795, close: 1.0822, volume: 100 };
    const order = createMarketOrder('buy', 1.0800, 900, 1.0, 1.0780, 1.0820);
    const [closed] = processBars([fxBar], [order]);

    expect(closed.status).toBe('closed');
    expect(closed.closeReason).toBe('tp');
    // 20 pips * 1.0 lot * 100,000 = $200.00
    expect(closed.pnl).toBeCloseTo(200, 1);
    expect(closed.pnlPips).toBeCloseTo(20, 1);
  });
});

describe('calculateRiskPositionSize', () => {
  it('calculates position size for 1% risk on $10,000 balance with 20 pip SL', () => {
    // Balance $10,000, 1% risk = $100.
    // At EURUSD (price 1.08), 1 pip on 1 lot = $10.
    // 20 pips * $10 = $200 risk per 1.0 lot.
    // $100 / $200 = 0.50 lots.
    const result = calculateRiskPositionSize(10000, { mode: 'percent', value: 1.0 }, 20, 1.0850);
    expect(result.riskAmount).toBe(100);
    expect(result.size).toBe(0.5);
    expect(result.pipValue).toBe(10);
  });

  it('calculates position size for fixed $250 cash risk with 50 pip SL', () => {
    // $250 risk / (50 pips * $10/pip) = 0.50 lots
    const result = calculateRiskPositionSize(25000, { mode: 'cash', value: 250 }, 50, 1.0850);
    expect(result.riskAmount).toBe(250);
    expect(result.size).toBe(0.5);
  });
});

describe('rewindOrders', () => {
  it('removes orders created after the target time', () => {
    const o = createMarketOrder('buy', 100, bars[10].time, 1);
    expect(rewindOrders([o], bars[5].time)).toEqual([]);
  });
  it('reopens a trade that closed in the future', () => {
    const o = createMarketOrder('buy', 100, bars[0].time, 1, 90, 103);
    const [closed] = processBars(bars.slice(1, 6), [o]);
    const [reopened] = rewindOrders([closed], bars[1].time);
    expect(reopened.status).toBe('filled');
    expect(reopened.pnl).toBeUndefined();
    expect(reopened.closeTime).toBeUndefined();
  });
  it('returns pending to pending when its fill is in the future', () => {
    const o = createLimitOrder('sell', 102.6, bars[0].time, 1); // fills when high >= 102.6 → bar 2
    const [filled] = processBars(bars.slice(1, 10), [o]);
    expect(filled.status).toBe('filled');
    const [pending] = rewindOrders([filled], bars[1].time);
    expect(pending.status).toBe('pending');
    expect(pending.fillTime).toBeUndefined();
  });
  it('keeps the same array reference when nothing changes', () => {
    const o = createMarketOrder('buy', 100, bars[0].time, 1);
    const orders = [o];
    expect(rewindOrders(orders, bars[10].time)).toBe(orders);
  });
});

describe('calculateSessionLedger (Account Equity state machine)', () => {
  it('correctly preserves realized PnL in balance and current equity after trades close', () => {
    const closedTrade: any = {
      id: 'o1',
      status: 'closed',
      pnl: 350.0,
      pnlPips: 35.0,
      side: 'buy',
      size: 1.0,
      fillPrice: 1.0800,
      closePrice: 1.0835,
    };
    const openTrade: any = {
      id: 'o2',
      status: 'filled',
      side: 'buy',
      size: 0.5,
      fillPrice: 1.0835,
    };

    // Current price is 1.0855 (20 pips floating gain on 0.5 lot = $100.00)
    const ledger = calculateSessionLedger(10000, [closedTrade, openTrade], 1.0855, 100, 'EURUSD');

    expect(ledger.initialBalance).toBe(10000);
    expect(ledger.realizedPnl).toBe(350.0);
    expect(ledger.currentBalance).toBe(10350.0);
    expect(ledger.unrealizedPnl).toBeCloseTo(100.0, 1);
    expect(ledger.currentEquity).toBeCloseTo(10450.0, 1);
    expect(ledger.closedTradesCount).toBe(1);
    expect(ledger.winRate).toBe(100);
  });

  it('handles partial close and break-even modifications', () => {
    const openTrade: any = {
      id: 'o1',
      status: 'filled',
      side: 'buy',
      size: 1.0,
      fillPrice: 1.0800,
    };

    const beTrade = setBreakEven(openTrade);
    expect(beTrade.stopLoss).toBe(1.0800);

    const partial = partialCloseOrder(openTrade, 0.5, 1.0820, 2000, 'EURUSD');
    expect(partial).not.toBeNull();
    expect(partial!.remainingOrder.size).toBe(0.5);
    expect(partial!.closedSlice.size).toBe(0.5);
    expect(partial!.closedSlice.status).toBe('closed');
    expect(partial!.closedSlice.pnl).toBeCloseTo(100.0, 1);
  });

  it('computes accurate session analytics scoped to simulated historical timestamps', () => {
    // 2023-01-11 08:30:00 UTC (Wednesday, London Session)
    const tLondonWed = Math.floor(new Date('2023-01-11T08:30:00Z').getTime() / 1000);
    // 2023-01-12 17:00:00 UTC (Thursday, New York Session)
    const tNyThu = Math.floor(new Date('2023-01-12T17:00:00Z').getTime() / 1000);

    const trades: any[] = [
      {
        id: 't1',
        status: 'closed',
        side: 'buy',
        size: 1,
        fillPrice: 1.0800,
        closePrice: 1.0850,
        fillTime: tLondonWed,
        closeTime: tLondonWed + 3600,
        pnl: 500,
      },
      {
        id: 't2',
        status: 'closed',
        side: 'sell',
        size: 1,
        fillPrice: 1.0850,
        closePrice: 1.0870,
        fillTime: tNyThu,
        closeTime: tNyThu + 1800,
        pnl: -200,
      },
    ];

    const analytics = calculateSessionAnalytics(trades, 10000, 0);

    expect(analytics.closedTrades).toBe(2);
    expect(analytics.wins).toBe(1);
    expect(analytics.losses).toBe(1);
    expect(analytics.winRate).toBe(50);
    expect(analytics.netPnl).toBe(300);
    expect(analytics.netReturnPct).toBe(3);
    expect(analytics.profitFactor).toBe(2.5);
    expect(analytics.equityCurve.length).toBe(3); // start, trade 1, trade 2

    // Check hourly attribution (UTC)
    const hour8 = analytics.hourlyStats.find((h) => h.hour === 8);
    expect(hour8?.count).toBe(1);
    expect(hour8?.pnl).toBe(500);

    const hour17 = analytics.hourlyStats.find((h) => h.hour === 17);
    expect(hour17?.count).toBe(1);
    expect(hour17?.pnl).toBe(-200);

    // Check weekday attribution
    const wednesday = analytics.weekdayStats.find((w) => w.day === 3);
    expect(wednesday?.count).toBe(1);
    expect(wednesday?.wins).toBe(1);

    const thursday = analytics.weekdayStats.find((w) => w.day === 4);
    expect(thursday?.count).toBe(1);
    expect(thursday?.wins).toBe(0);

    // Check Session attribution
    const london = analytics.sessionStats.find((s) => s.session === 'london');
    expect(london?.count).toBe(1);
    expect(london?.pnl).toBe(500);

    const ny = analytics.sessionStats.find((s) => s.session === 'newyork');
    expect(ny?.count).toBe(1);
    expect(ny?.pnl).toBe(-200);
  });
});

