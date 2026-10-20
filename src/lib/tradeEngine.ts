import type { OHLCVBar } from './csvParser';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'pending' | 'filled' | 'closed' | 'cancelled';

export interface Order {
  id: string;
  /** Bar time (unix seconds, UTC) at which the order was placed. */
  createdTime: number;
  side: OrderSide;
  type: OrderType;
  entryPrice: number;
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  size: number; // lot size or units
  status: OrderStatus;
  fillPrice?: number;
  fillTime?: number;
  closePrice?: number;
  closeTime?: number;
  closeReason?: 'sl' | 'tp' | 'manual';
  pnl?: number;
  pnlPips?: number;
}

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  avgRR: number;
  equityCurve: { time: number; equity: number }[];
}

export function createOrderId(): string {
  return `order-${crypto.randomUUID()}`;
}

export function createMarketOrder(
  side: OrderSide,
  currentPrice: number,
  currentTime: number,
  size: number,
  stopLoss?: number,
  takeProfit?: number
): Order {
  return {
    id: createOrderId(),
    createdTime: currentTime,
    side,
    type: 'market',
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    size,
    status: 'filled',
    fillPrice: currentPrice,
    fillTime: currentTime,
  };
}

export function createLimitOrder(
  side: OrderSide,
  limitPrice: number,
  currentTime: number,
  size: number,
  stopLoss?: number,
  takeProfit?: number
): Order {
  return {
    id: createOrderId(),
    createdTime: currentTime,
    side,
    type: 'limit',
    entryPrice: limitPrice,
    limitPrice,
    stopLoss,
    takeProfit,
    size,
    status: 'pending',
  };
}

/**
 * Process a bar against open orders to check for fills, SL, TP hits
 */
export function processBar(bar: OHLCVBar, orders: Order[]): Order[] {
  return orders.map(order => {
    // Fill pending limit orders
    if (order.status === 'pending' && order.type === 'limit' && order.limitPrice != null) {
      const price = order.limitPrice;
      if (order.side === 'buy' && bar.low <= price) {
        return { ...order, status: 'filled' as OrderStatus, fillPrice: price, fillTime: bar.time };
      }
      if (order.side === 'sell' && bar.high >= price) {
        return { ...order, status: 'filled' as OrderStatus, fillPrice: price, fillTime: bar.time };
      }
    }

    // Check SL/TP on filled orders
    if (order.status === 'filled' && order.fillPrice != null) {
      const entry = order.fillPrice;

      if (order.side === 'buy') {
        // Check SL first (worst case)
        if (order.stopLoss != null && bar.low <= order.stopLoss) {
          const pnl = (order.stopLoss - entry) * order.size;
          const pnlPips = (order.stopLoss - entry) * 10000;
          return { ...order, status: 'closed' as OrderStatus, closePrice: order.stopLoss, closeTime: bar.time, closeReason: 'sl' as const, pnl, pnlPips };
        }
        // Check TP
        if (order.takeProfit != null && bar.high >= order.takeProfit) {
          const pnl = (order.takeProfit - entry) * order.size;
          const pnlPips = (order.takeProfit - entry) * 10000;
          return { ...order, status: 'closed' as OrderStatus, closePrice: order.takeProfit, closeTime: bar.time, closeReason: 'tp' as const, pnl, pnlPips };
        }
      } else {
        // Sell order
        if (order.stopLoss != null && bar.high >= order.stopLoss) {
          const pnl = (entry - order.stopLoss) * order.size;
          const pnlPips = (entry - order.stopLoss) * 10000;
          return { ...order, status: 'closed' as OrderStatus, closePrice: order.stopLoss, closeTime: bar.time, closeReason: 'sl' as const, pnl, pnlPips };
        }
        if (order.takeProfit != null && bar.low <= order.takeProfit) {
          const pnl = (entry - order.takeProfit) * order.size;
          const pnlPips = (entry - order.takeProfit) * 10000;
          return { ...order, status: 'closed' as OrderStatus, closePrice: order.takeProfit, closeTime: bar.time, closeReason: 'tp' as const, pnl, pnlPips };
        }
      }
    }

    return order;
  });
}

/**
 * Run a sequence of bars (oldest first) through the order book. Used when the
 * replay jumps several bars at once so nothing between the two positions is
 * skipped — every bar gets a chance to fill orders and hit SL/TP.
 */
export function processBars(bars: OHLCVBar[], orders: Order[]): Order[] {
  let result = orders;
  for (const bar of bars) {
    result = processBar(bar, result);
  }
  return result;
}

/**
 * Undo everything that happened after `time`, so stepping the replay backwards
 * never leaves trades that "haven't happened yet" on the books.
 *  - orders created after `time` are removed
 *  - orders closed after `time` are re-opened
 *  - limit orders filled after `time` go back to pending
 * Returns the same array reference when nothing needs to change.
 */
export function rewindOrders(orders: Order[], time: number): Order[] {
  let changed = false;
  const result: Order[] = [];

  for (const order of orders) {
    if (order.createdTime > time) {
      changed = true;
      continue;
    }

    if (order.status === 'closed' && order.closeTime != null && order.closeTime > time) {
      changed = true;
      const { closePrice, closeTime, closeReason, pnl, pnlPips, ...rest } = order;
      void closePrice; void closeTime; void closeReason; void pnl; void pnlPips;
      // It was filled before it closed; if the fill is also in the future, fall through.
      if (order.fillTime != null && order.fillTime > time && order.type === 'limit') {
        const { fillPrice, fillTime, ...pending } = rest;
        void fillPrice; void fillTime;
        result.push({ ...pending, status: 'pending' });
      } else {
        result.push({ ...rest, status: 'filled' });
      }
      continue;
    }

    if (order.status === 'filled' && order.type === 'limit' && order.fillTime != null && order.fillTime > time) {
      changed = true;
      const { fillPrice, fillTime, ...pending } = order;
      void fillPrice; void fillTime;
      result.push({ ...pending, status: 'pending' });
      continue;
    }

    result.push(order);
  }

  return changed ? result : orders;
}

export function calculateStats(orders: Order[], startingBalance: number = 10000): TradeStats {
  const closed = orders.filter(o => o.status === 'closed' && o.pnl != null);
  const wins = closed.filter(o => o.pnl! > 0);
  const losses = closed.filter(o => o.pnl! < 0);
  const breakeven = closed.filter(o => o.pnl === 0);

  const totalPnl = closed.reduce((sum, o) => sum + (o.pnl || 0), 0);
  const grossWin = wins.reduce((sum, o) => sum + (o.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, o) => sum + (o.pnl || 0), 0));

  // Equity curve starting from the configured balance
  let equity = startingBalance;
  const equityCurve = closed
    .sort((a, b) => (a.closeTime || 0) - (b.closeTime || 0))
    .map(o => {
      equity += o.pnl || 0;
      return { time: o.closeTime || 0, equity };
    });

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    totalPnl,
    avgWin: wins.length > 0 ? grossWin / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    bestTrade: closed.length > 0 ? Math.max(...closed.map(o => o.pnl || 0)) : 0,
    worstTrade: closed.length > 0 ? Math.min(...closed.map(o => o.pnl || 0)) : 0,
    avgRR: losses.length > 0 && wins.length > 0
      ? (grossWin / wins.length) / (grossLoss / losses.length)
      : 0,
    equityCurve,
  };
}
