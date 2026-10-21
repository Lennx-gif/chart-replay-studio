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
