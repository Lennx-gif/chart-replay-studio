import type { OHLCVBar } from './csvParser';
import { getInstrumentSpec } from './currency';

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
  grossWin: number;
  grossLoss: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
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

export interface SessionLedger {
  initialBalance: number;
  realizedPnl: number;
  currentBalance: number;
  unrealizedPnl: number;
  currentEquity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number;
  closedTradesCount: number;
  winRate: number;
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
  let peak = startingBalance;
  let maxDD = 0;

  const equityCurve = closed
    .sort((a, b) => (a.closeTime || 0) - (b.closeTime || 0))
    .map((o) => {
      equity += o.pnl || 0;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
      return { time: o.closeTime || 0, equity };
    });

  const maxDrawdownPercent = peak > 0 ? (maxDD / peak) * 100 : 0;

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    totalPnl,
    grossWin,
    grossLoss,
    maxDrawdown: maxDD,
    maxDrawdownPercent,
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

/**
 * Deterministic account balance and equity state machine.
 * Prevents account equity from resetting to starting balance after trade closes.
 */
export function calculateSessionLedger(
  initialBalance: number,
  orders: Order[],
  currentPrice: number,
  leverage: number = 100,
  symbol: string = 'EURUSD'
): SessionLedger {
  const spec = getInstrumentSpec(symbol, currentPrice);
  const pipValue = spec.getPipValuePerLot(currentPrice);

  let realizedPnl = 0;
  let closedCount = 0;
  let winsCount = 0;

  let unrealizedPnl = 0;
  let usedMargin = 0;

  for (const o of orders) {
    if (o.status === 'closed' && o.pnl != null) {
      realizedPnl += o.pnl;
      closedCount++;
      if (o.pnl > 0) winsCount++;
    } else if (o.status === 'filled' && o.fillPrice != null) {
      const entry = o.fillPrice;
      const diff = o.side === 'buy' ? currentPrice - entry : entry - currentPrice;
      const diffPips = diff / spec.pipSize;
      const pnl = diffPips * (pipValue * o.size);
      unrealizedPnl += pnl;

      const positionNotional = o.size * spec.contractSize * (spec.quoteCurrency === 'USD' ? currentPrice : 1);
      usedMargin += positionNotional / Math.max(1, leverage);
    }
  }

  const currentBalance = initialBalance + realizedPnl;
  const currentEquity = currentBalance + unrealizedPnl;
  const freeMargin = Math.max(0, currentEquity - usedMargin);
  const marginLevel = usedMargin > 0 ? (currentEquity / usedMargin) * 100 : 0;
  const winRate = closedCount > 0 ? (winsCount / closedCount) * 100 : 0;

  return {
    initialBalance,
    realizedPnl,
    currentBalance,
    unrealizedPnl,
    currentEquity,
    usedMargin,
    freeMargin,
    marginLevel,
    closedTradesCount: closedCount,
    winRate,
  };
}

/**
 * Close a partial percentage of an open position.
 */
export function partialCloseOrder(
  order: Order,
  closeRatio: number,
  currentPrice: number,
  currentTime: number,
  symbol: string = 'EURUSD'
): { remainingOrder: Order; closedSlice: Order } | null {
  if (order.status !== 'filled' || order.fillPrice == null || closeRatio <= 0 || closeRatio >= 1) {
    return null;
  }
  const spec = getInstrumentSpec(symbol, currentPrice);
  const pipValue = spec.getPipValuePerLot(currentPrice);
  const entry = order.fillPrice;
  const diff = order.side === 'buy' ? currentPrice - entry : entry - currentPrice;
  const pnlPips = diff / spec.pipSize;

  const closedSize = Math.max(0.01, Math.round(order.size * closeRatio * 100) / 100);
  const remainingSize = Math.max(0.01, Math.round((order.size - closedSize) * 100) / 100);

  const closedSlice: Order = {
    ...order,
    id: createOrderId(),
    size: closedSize,
    status: 'closed',
    closePrice: currentPrice,
    closeTime: currentTime,
    closeReason: 'manual',
    pnl: pnlPips * (pipValue * closedSize),
    pnlPips,
  };

  const remainingOrder: Order = {
    ...order,
    size: remainingSize,
  };

  return { remainingOrder, closedSlice };
}

/**
 * Move stop loss directly to fill price (break even).
 */
export function setBreakEven(order: Order): Order {
  if (order.status !== 'filled' || order.fillPrice == null) return order;
  return {
    ...order,
    stopLoss: order.fillPrice,
  };
}

export interface SessionAnalyticsData {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakEvens: number;
  winRate: number; // 0 to 100
  netPnl: number;
  netReturnPct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectancy: number; // $ per trade
  expectancyR: number; // in R
  avgWin: number;
  avgLoss: number;
  winLossRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  equityCurve: { tradeIndex: number; equity: number; pnl: number; time: number; side?: string }[];
  hourlyStats: { hour: number; label: string; count: number; wins: number; winRate: number; pnl: number }[];
  sessionStats: { session: string; label: string; timeRange: string; count: number; wins: number; winRate: number; pnl: number }[];
  weekdayStats: { day: number; label: string; count: number; wins: number; winRate: number; pnl: number }[];
}

export function calculateSessionAnalytics(
  orders: Order[],
  startingBalance: number,
  tzOffset = 0
): SessionAnalyticsData {
  const closed = orders.filter((o) => o.status === 'closed' && o.pnl != null);
  const openCount = orders.filter((o) => o.status === 'filled').length;

  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;

  // Hourly buckets: 0..23 (adjusted by tzOffset)
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    count: 0,
    wins: 0,
    winRate: 0,
    pnl: 0,
  }));

  // Forex Sessions based on UTC hours (Sydney: 21-06, Tokyo: 00-09, London: 07-16, New York: 12-21)
  const sessionsMap: Record<string, { label: string; timeRange: string; count: number; wins: number; winRate: number; pnl: number }> = {
    sydney: { label: 'Sydney', timeRange: '21:00 - 06:00 UTC', count: 0, wins: 0, winRate: 0, pnl: 0 },
    tokyo: { label: 'Tokyo', timeRange: '00:00 - 09:00 UTC', count: 0, wins: 0, winRate: 0, pnl: 0 },
    london: { label: 'London', timeRange: '07:00 - 16:00 UTC', count: 0, wins: 0, winRate: 0, pnl: 0 },
    newyork: { label: 'New York', timeRange: '12:00 - 21:00 UTC', count: 0, wins: 0, winRate: 0, pnl: 0 },
  };

  // Weekdays: 1..5 (Mon..Fri)
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdays = [1, 2, 3, 4, 5].map((d) => ({
    day: d,
    label: weekdayNames[d],
    count: 0,
    wins: 0,
    winRate: 0,
    pnl: 0,
  }));

  let currentEquity = startingBalance;
  let peakEquity = startingBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const equityCurve: SessionAnalyticsData['equityCurve'] = [
    { tradeIndex: 0, equity: startingBalance, pnl: 0, time: 0 },
  ];

  // Sort closed orders by fillTime / closeTime ascending
  const sorted = [...closed].sort((a, b) => (a.closeTime ?? a.fillTime ?? 0) - (b.closeTime ?? b.fillTime ?? 0));

  sorted.forEach((o, idx) => {
    const pnl = o.pnl ?? 0;
    if (pnl > 0.0001) {
      wins++;
      grossProfit += pnl;
    } else if (pnl < -0.0001) {
      losses++;
      grossLoss += Math.abs(pnl);
    } else {
      breakEvens++;
    }

    currentEquity += pnl;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const dd = peakEquity - currentEquity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }
    const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
    }

    equityCurve.push({
      tradeIndex: idx + 1,
      equity: currentEquity,
      pnl,
      time: o.closeTime ?? o.fillTime ?? 0,
      side: o.side,
    });

    // Time attribution based strictly on simulated historical trade time
    const tradeTime = o.fillTime ?? o.createdTime ?? 0;
    if (tradeTime > 0) {
      // Adjusted by timezone offset in hours
      const date = new Date((tradeTime + tzOffset * 3600) * 1000);
      const h = date.getUTCHours();
      if (hours[h]) {
        hours[h].count++;
        hours[h].pnl += pnl;
        if (pnl > 0) hours[h].wins++;
      }

      // Weekday (0=Sun, 1=Mon, ..., 6=Sat)
      const day = date.getUTCDay();
      const targetDay = day === 0 ? 1 : day === 6 ? 5 : day; // fold weekend into Mon/Fri
      const wIdx = targetDay - 1;
      if (wIdx >= 0 && wIdx < weekdays.length) {
        weekdays[wIdx].count++;
        weekdays[wIdx].pnl += pnl;
        if (pnl > 0) weekdays[wIdx].wins++;
      }

      // Check Forex Killzones (UTC hour)
      const utcDate = new Date(tradeTime * 1000);
      const utcH = utcDate.getUTCHours();
      if (utcH >= 21 || utcH < 6) {
        sessionsMap.sydney.count++;
        sessionsMap.sydney.pnl += pnl;
        if (pnl > 0) sessionsMap.sydney.wins++;
      }
      if (utcH >= 0 && utcH < 9) {
        sessionsMap.tokyo.count++;
        sessionsMap.tokyo.pnl += pnl;
        if (pnl > 0) sessionsMap.tokyo.wins++;
      }
      if (utcH >= 7 && utcH < 16) {
        sessionsMap.london.count++;
        sessionsMap.london.pnl += pnl;
        if (pnl > 0) sessionsMap.london.wins++;
      }
      if (utcH >= 12 && utcH < 21) {
        sessionsMap.newyork.count++;
        sessionsMap.newyork.pnl += pnl;
        if (pnl > 0) sessionsMap.newyork.wins++;
      }
    }
  });

  // Calculate win rates
  hours.forEach((h) => {
    h.winRate = h.count > 0 ? (h.wins / h.count) * 100 : 0;
  });
  weekdays.forEach((w) => {
    w.winRate = w.count > 0 ? (w.wins / w.count) * 100 : 0;
  });
  Object.values(sessionsMap).forEach((s) => {
    s.winRate = s.count > 0 ? (s.wins / s.count) * 100 : 0;
  });

  const netPnl = grossProfit - grossLoss;
  const netReturnPct = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;
  const totalClosed = closed.length;
  const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? avgWin : 1;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy = totalClosed > 0 ? netPnl / totalClosed : 0;
  const expectancyR = avgLoss > 0 ? (winRate / 100) * winLossRatio - (1 - winRate / 100) : 0;

  return {
    totalTrades: orders.length,
    closedTrades: totalClosed,
    openTrades: openCount,
    wins,
    losses,
    breakEvens,
    winRate,
    netPnl,
    netReturnPct,
    grossProfit,
    grossLoss,
    profitFactor,
    expectancy,
    expectancyR,
    avgWin,
    avgLoss,
    winLossRatio,
    maxDrawdown,
    maxDrawdownPct,
    equityCurve,
    hourlyStats: hours,
    sessionStats: [
      { session: 'sydney', ...sessionsMap.sydney },
      { session: 'tokyo', ...sessionsMap.tokyo },
      { session: 'london', ...sessionsMap.london },
      { session: 'newyork', ...sessionsMap.newyork },
    ],
    weekdayStats: weekdays,
  };
}
