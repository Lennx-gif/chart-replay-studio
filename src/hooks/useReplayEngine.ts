import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { OHLCVBar } from '@/lib/csvParser';
import type { Bookmark, SessionRecord, StepUnit } from '@/lib/db';
import {
  buildTimeframeIndex, clampPosition, formatBarTime, lowerBoundByTime, playbackTick, stepPosition, visibleCandles,
} from '@/lib/replay';
import {
  createLimitOrder, createMarketOrder, processBar, rewindOrders, type Order, type OrderSide,
} from '@/lib/tradeEngine';

const isActive = (o: Order) => o.status === 'pending' || o.status === 'filled';

export interface TradeEvent {
  order: Order;
  kind: 'filled' | 'closed';
}

/** Orders whose status changed between two snapshots of the same order book. */
function diffOrders(before: Order[], after: Order[]): TradeEvent[] {
  const prev = new Map(before.map((o) => [o.id, o.status]));
  const events: TradeEvent[] = [];
  for (const o of after) {
    const was = prev.get(o.id);
    if (was === 'pending' && o.status === 'filled') events.push({ order: o, kind: 'filled' });
    else if (was !== 'closed' && o.status === 'closed') events.push({ order: o, kind: 'closed' });
  }
  return events;
}

function announce(events: TradeEvent[]) {
  for (const { order, kind } of events) {
    if (kind === 'filled') {
      toast.info(`${order.type.toUpperCase()} ${order.side.toUpperCase()} filled @ ${order.fillPrice?.toFixed(5)}`);
    } else {
      const pnl = order.pnl ?? 0;
      const label = `${order.side.toUpperCase()} closed by ${order.closeReason?.toUpperCase()}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`;
      if (order.closeReason === 'tp') toast.success(label);
      else toast.error(label);
    }
  }
}

export interface MoveOptions {
  /**
   * Halt on the first bar that fills an order or hits SL/TP (when the session
   * has "pause on trade events" on). Used for playback and stepping; seeking
   * (slider, go-to-date) runs through every bar without stopping.
   */
  stopAtEvents?: boolean;
}

/**
 * The replay engine: owns the replay position, the order book and playback.
 *
 * Position is the number of *base* bars revealed. Orders are evaluated against
 * every base bar between two positions, so a big jump can never skip an SL/TP,
 * and stepping backwards rewinds trades that "haven't happened yet".
 */
export function useReplayEngine(raw: OHLCVBar[], session: SessionRecord) {
  const total = raw.length;

  const [position, setPosition] = useState(() => clampPosition(session.position, total));
  const [orders, setOrders] = useState<Order[]>(session.orders);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(session.speed);
  const [stepUnit, setStepUnit] = useState<StepUnit>(session.stepUnit);
  const [timeframe, setTimeframe] = useState(session.timeframe);
  const [pauseOnTradeEvents, setPauseOnTradeEvents] = useState(session.pauseOnTradeEvents);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(session.bookmarks);
  const [startPosition, setStartPosition] = useState(session.startPosition);

  const index = useMemo(() => buildTimeframeIndex(raw, timeframe), [raw, timeframe]);
  const candles = useMemo(() => visibleCandles(raw, index, position), [raw, index, position]);

  // Mirrors so callbacks and the playback interval always see current values.
  const live = useRef({ position, orders, index, stepUnit, pauseOnTradeEvents });
  live.current = { position, orders, index, stepUnit, pauseOnTradeEvents };

  const moveTo = useCallback((target: number, opts: MoveOptions = {}) => {
    const { position: cur, orders: curOrders, pauseOnTradeEvents: pauseOn } = live.current;
    let next = clampPosition(target, total);
    if (total === 0 || next === cur) return;

    let nextOrders = curOrders;
    let events: TradeEvent[] = [];
    let halted = false;

    if (next > cur) {
      if (curOrders.some(isActive)) {
        for (let i = cur; i < next; i++) {
          const updated = processBar(raw[i], nextOrders);
          const changed = updated.some((o, k) => o.status !== nextOrders[k].status);
          nextOrders = updated;
          if (changed && opts.stopAtEvents && pauseOn) {
            next = i + 1;
            halted = true;
            break;
          }
        }
        events = diffOrders(curOrders, nextOrders);
      }
    } else {
      nextOrders = rewindOrders(curOrders, raw[next - 1].time);
      const undone = curOrders.length - nextOrders.length;
      if (undone > 0) toast.info(`Rewound: ${undone} trade${undone === 1 ? '' : 's'} placed after this point removed`);
    }

    live.current = { ...live.current, position: next, orders: nextOrders };
    setPosition(next);
    if (nextOrders !== curOrders) setOrders(nextOrders);
    if (events.length) announce(events);
    if (halted || next >= total) setIsPlaying(false);
  }, [raw, total]);

  /** Step `count` units (bars or candles per the step unit); negative goes back. */
  const step = useCallback((count: number) => {
    const { position: p, index: idx, stepUnit: unit } = live.current;
    moveTo(stepPosition(idx, p, total, unit, count), { stopAtEvents: count > 0 });
  }, [moveTo, total]);

  const seek = useCallback((target: number) => moveTo(target), [moveTo]);

  const seekToTime = useCallback((unixSeconds: number) => {
    moveTo(lowerBoundByTime(raw, unixSeconds) + 1);
  }, [moveTo, raw]);

  const restart = useCallback(() => {
    setIsPlaying(false);
    moveTo(startPosition);
  }, [moveTo, startPosition]);

  const togglePlay = useCallback(() => {
    if (live.current.position >= total) {
      moveTo(startPosition);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  }, [moveTo, startPosition, total]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const { intervalMs, unitsPerTick } = playbackTick(speed);
    const id = setInterval(() => {
      const { position: p, index: idx, stepUnit: unit } = live.current;
      if (p >= total) { setIsPlaying(false); return; }
      moveTo(stepPosition(idx, p, total, unit, unitsPerTick), { stopAtEvents: true });
    }, intervalMs);
    return () => clearInterval(id);
  }, [isPlaying, speed, total, moveTo]);

  // ---------------------------------------------------------------- trading

  const placeMarket = useCallback((side: OrderSide, size: number, stopLoss?: number, takeProfit?: number) => {
    const bar = raw[live.current.position - 1];
    if (!bar) return;
    const order = createMarketOrder(side, bar.close, bar.time, size, stopLoss, takeProfit);
    setOrders((prev) => [...prev, order]);
    live.current = { ...live.current, orders: [...live.current.orders, order] };
    toast.success(`${side.toUpperCase()} order placed @ ${bar.close.toFixed(5)}`);
  }, [raw]);

  const placePending = useCallback((side: OrderSide, price: number, stopLoss?: number, takeProfit?: number, size = 1) => {
    const bar = raw[live.current.position - 1];
    if (!bar) return;
    const order = createLimitOrder(side, price, bar.time, size, stopLoss, takeProfit);
    setOrders((prev) => [...prev, order]);
    live.current = { ...live.current, orders: [...live.current.orders, order] };
    toast.success(`Pending ${side.toUpperCase()} limit @ ${price.toFixed(5)}`);
  }, [raw]);

  const closeAtMarket = useCallback((o: Order, bar: OHLCVBar): Order => {
    const entry = o.fillPrice ?? 0;
    const diff = o.side === 'buy' ? bar.close - entry : entry - bar.close;
    return {
      ...o, status: 'closed', closePrice: bar.close, closeTime: bar.time, closeReason: 'manual',
      pnl: diff * o.size, pnlPips: diff * 10000,
    };
  }, []);

  const closeOrder = useCallback((orderId: string) => {
    const bar = raw[live.current.position - 1];
    if (!bar) return;
    setOrders((prev) => prev.map((o) => (o.id === orderId && o.status === 'filled' ? closeAtMarket(o, bar) : o)));
  }, [raw, closeAtMarket]);

  const closeAll = useCallback(() => {
    const bar = raw[live.current.position - 1];
    if (!bar) return;
    setOrders((prev) => prev.map((o) => (o.status === 'filled' ? closeAtMarket(o, bar) : o)));
  }, [raw, closeAtMarket]);

  const cancelOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId && o.status === 'pending' ? { ...o, status: 'cancelled' } : o)));
  }, []);

  // -------------------------------------------------------------- bookmarks

  const addBookmark = useCallback((label?: string) => {
    const bar = raw[live.current.position - 1];
    if (!bar) return;
    setBookmarks((prev) => {
      if (prev.some((b) => b.position === live.current.position)) return prev;
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        position: live.current.position,
        time: bar.time,
        label: label?.trim() || `Bookmark ${prev.length + 1}`,
        createdAt: Date.now(),
      };
      return [...prev, bookmark].sort((a, b) => a.position - b.position);
    });
    toast.success(`Bookmarked ${formatBarTime(bar.time)}`);
  }, [raw]);

  const removeBookmark = useCallback((id: string) => setBookmarks((prev) => prev.filter((b) => b.id !== id)), []);
  const renameBookmark = useCallback((id: string, label: string) => {
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, label: label.trim() || b.label } : b)));
  }, []);

  /** Jump to the next (dir 1) or previous (dir -1) bookmark relative to the current position. */
  const jumpBookmark = useCallback((dir: 1 | -1) => {
    const p = live.current.position;
    const target = dir === 1
      ? bookmarks.find((b) => b.position > p)
      : [...bookmarks].reverse().find((b) => b.position < p);
    if (target) moveTo(target.position);
    else toast.info(dir === 1 ? 'No later bookmark' : 'No earlier bookmark');
  }, [bookmarks, moveTo]);

  return {
    total, position, candles, index, orders, isPlaying, speed, stepUnit, timeframe, pauseOnTradeEvents, bookmarks, startPosition,
    setSpeed, setStepUnit, setTimeframe, setPauseOnTradeEvents, setStartPosition, setIsPlaying,
    moveTo, step, seek, seekToTime, restart, togglePlay,
    placeMarket, placePending, closeOrder, closeAll, cancelOrder,
    addBookmark, removeBookmark, renameBookmark, jumpBookmark,
  };
}
