import type { OHLCVBar } from './csvParser';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'pending' | 'filled' | 'closed' | 'cancelled';

export interface Order {
  id: string;
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

let nextOrderId = 1;
export function createOrderId(): string {
  return `order-${nextOrderId++}`;
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
  size: number,
  stopLoss?: number,
  takeProfit?: number
): Order {
  return {
    id: createOrderId(),
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
