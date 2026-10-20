import { describe, it, expect } from 'vitest';
import { makeBars } from '@/test/helpers';
import { createLimitOrder, createMarketOrder, processBars, rewindOrders } from './tradeEngine';

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
