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
  size: number; // lot size or units (e.g. 1.0 = 1 standard lot)
  status: OrderStatus;
  fillPrice?: number;
  fillTime?: number;
  closePrice?: number;
  closeTime?: number;
  closeReason?: 'sl' | 'tp' | 'manual';
  pnl?: number;
  pnlPips?: number;
  contractMultiplier?: number;
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

export interface RiskCalculation {
  size: number;          // Position in lots (e.g. 0.50)
  riskAmount: number;    // Total $ risked (e.g. $100)
  pipValue: number;      // Dollar value of 1 pip for 1.0 standard lot
  pips: number;          // Stop loss distance in pips
}

/**
 * Institutional contract multiplier:
 * - Forex standard pairs (price < 20, e.g. EURUSD ~ 1.08): 1 standard lot = 100,000 units.
 *   Each 1 pip (0.0001) move on 1.0 lot equals $10.00.
 * - JPY pairs (price 50-300, e.g. USDJPY ~ 150): 1 pip (0.01) * 1,000 = $10.00 per lot.
 * - Gold / Commodities (price 1500-4000, e.g. XAUUSD ~ 2600): 100 oz per lot ($1 move = $100).
 * - Crypto / Equities (price > 4000 or general, e.g. BTCUSD ~ $65,000): 1 unit per lot ($1 move = $1).
 */
export function getContractMultiplier(price: number): number {
  if (price <= 0) return 1;
  if (price < 20) return 100000;
  if (price >= 50 && price < 300) return 1000;
  if (price >= 1500 && price <= 4000) return 100;
  return 1;
}

export function getPipSize(price: number): number {
  if (price < 20) return 0.0001;
  if (price >= 50 && price < 300) return 0.01;
  if (price > 500) return 1.0;
  return 0.01;
}

/**
 * Calculates accurate position size in lots based on account balance,
 * chosen risk percentage or cash amount, and SL distance in pips.
 */
export function calculateRiskPositionSize(
  balance: number,
  riskInput: { mode: 'percent' | 'cash'; value: number },
  slPips: number,
  currentPrice: number
): RiskCalculation {
  const safePrice = Math.max(0.0001, currentPrice);
  const mult = getContractMultiplier(safePrice);
  const pip = getPipSize(safePrice);
  const pipValuePerLot = pip * mult; // e.g. 0.0001 * 100000 = $10/pip

  const riskAmount =
    riskInput.mode === 'percent'
      ? Math.max(1, (balance * Math.min(100, Math.max(0.01, riskInput.value))) / 100)
      : Math.max(1, riskInput.value);

  const safePips = Math.max(1, slPips);
  const rawSize = riskAmount / (safePips * pipValuePerLot);
  const size = Math.max(0.01, Math.round(rawSize * 100) / 100);

  return {
    size,
    riskAmount,
    pipValue: pipValuePerLot,
    pips: safePips,
  };
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
    contractMultiplier: getContractMultiplier(currentPrice),
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
    contractMultiplier: getContractMultiplier(limitPrice),
  };
}

/**
 * Process a bar against open orders to check for fills, SL, TP hits
 */
export function processBar(bar: OHLCVBar, orders: Order[]): Order[] {
  return orders.map((order) => {
    // Fill pending limit orders
    if (order.status === 'pending' && order.type === 'limit' && order.limitPrice != null) {
      const price = order.limitPrice;
      if (order.side === 'buy' && bar.low <= price) {
        return {
          ...order,
          status: 'filled' as OrderStatus,
          fillPrice: price,
          fillTime: bar.time,
          contractMultiplier: order.contractMultiplier ?? getContractMultiplier(price),
        };
      }
      if (order.side === 'sell' && bar.high >= price) {
        return {
          ...order,
          status: 'filled' as OrderStatus,
          fillPrice: price,
          fillTime: bar.time,
          contractMultiplier: order.contractMultiplier ?? getContractMultiplier(price),
        };
      }
    }

    // Check SL/TP on filled orders
    if (order.status === 'filled' && order.fillPrice != null) {
      const entry = order.fillPrice;
      const mult = order.contractMultiplier ?? getContractMultiplier(entry);
      const pip = getPipSize(entry);

      if (order.side === 'buy') {
        // Check SL first (worst case)
        if (order.stopLoss != null && bar.low <= order.stopLoss) {
          const diff = order.stopLoss - entry;
          const pnl = diff * order.size * mult;
          const pnlPips = diff / pip;
          return {
            ...order,
            status: 'closed' as OrderStatus,
            closePrice: order.stopLoss,
            closeTime: bar.time,
            closeReason: 'sl' as const,
            pnl,
            pnlPips,
          };
        }
        // Check TP
        if (order.takeProfit != null && bar.high >= order.takeProfit) {
          const diff = order.takeProfit - entry;
          const pnl = diff * order.size * mult;
          const pnlPips = diff / pip;
          return {
            ...order,
            status: 'closed' as OrderStatus,
            closePrice: order.takeProfit,
            closeTime: bar.time,
            closeReason: 'tp' as const,
            pnl,
            pnlPips,
          };
        }
      } else {
        // Sell order
        if (order.stopLoss != null && bar.high >= order.stopLoss) {
          const diff = entry - order.stopLoss;
          const pnl = diff * order.size * mult;
          const pnlPips = diff / pip;
          return {
            ...order,
            status: 'closed' as OrderStatus,
            closePrice: order.stopLoss,
            closeTime: bar.time,
            closeReason: 'sl' as const,
            pnl,
            pnlPips,
          };
        }
        if (order.takeProfit != null && bar.low <= order.takeProfit) {
          const diff = entry - order.takeProfit;
          const pnl = diff * order.size * mult;
          const pnlPips = diff / pip;
          return {
            ...order,
            status: 'closed' as OrderStatus,
            closePrice: order.takeProfit,
            closeTime: bar.time,
            closeReason: 'tp' as const,
            pnl,
            pnlPips,
          };
        }
      }
    }

    return order;
  });
}

/**
 * Run a sequence of bars (oldest first) through the order book.
 */
export function processBars(bars: OHLCVBar[], orders: Order[]): Order[] {
  let result = orders;
  for (const bar of bars) {
    result = processBar(bar, result);
  }
  return result;
}

export function closeOrder(
  order: Order,
  currentPrice: number,
  currentTime: number,
  reason: 'manual' | 'sl' | 'tp' = 'manual'
): Order {
  if (order.status !== 'filled' || order.fillPrice == null) return order;
  const entry = order.fillPrice;
  const mult = order.contractMultiplier ?? getContractMultiplier(entry);
  const pip = getPipSize(entry);
  const diff = order.side === 'buy' ? currentPrice - entry : entry - currentPrice;
  const pnl = diff * order.size * mult;
  const pnlPips = diff / pip;
  return {
    ...order,
    status: 'closed',
    closePrice: currentPrice,
    closeTime: currentTime,
    closeReason: reason,
    pnl,
    pnlPips,
  };
}

/**
 * Undo everything that happened after `time`, so stepping the replay backwards
 * never leaves trades that "haven't happened yet" on the books.
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
      void closePrice;
      void closeTime;
      void closeReason;
      void pnl;
      void pnlPips;
      if (order.fillTime != null && order.fillTime > time && order.type === 'limit') {
        const { fillPrice, fillTime, ...pending } = rest;
        void fillPrice;
        void fillTime;
        result.push({ ...pending, status: 'pending' });
      } else {
        result.push({ ...rest, status: 'filled' });
      }
      continue;
    }

    if (order.status === 'filled' && order.type === 'limit' && order.fillTime != null && order.fillTime > time) {
      changed = true;
      const { fillPrice, fillTime, ...pending } = order;
      void fillPrice;
      void fillTime;
      result.push({ ...pending, status: 'pending' });
      continue;
    }

    result.push(order);
  }

  return changed ? result : orders;
}

export function calculateStats(orders: Order[], startingBalance: number = 10000): TradeStats {
  const closed = orders.filter((o) => o.status === 'closed' && o.pnl != null);
  const wins = closed.filter((o) => o.pnl! > 0);
  const losses = closed.filter((o) => o.pnl! < 0);
  const breakeven = closed.filter((o) => o.pnl === 0);

  const totalPnl = closed.reduce((sum, o) => sum + (o.pnl || 0), 0);
  const grossWin = wins.reduce((sum, o) => sum + (o.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, o) => sum + (o.pnl || 0), 0));

  let equity = startingBalance;
  const equityCurve = closed
    .sort((a, b) => (a.closeTime || 0) - (b.closeTime || 0))
    .map((o) => {
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
    bestTrade: closed.length > 0 ? Math.max(...closed.map((o) => o.pnl || 0)) : 0,
    worstTrade: closed.length > 0 ? Math.min(...closed.map((o) => o.pnl || 0)) : 0,
    avgRR:
      losses.length > 0 && wins.length > 0
        ? grossWin / wins.length / (grossLoss / losses.length)
        : 0,
    equityCurve,
  };
}
