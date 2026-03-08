import { useState } from 'react';
import { TrendingUp, TrendingDown, X, DollarSign } from 'lucide-react';
import type { OrderSide } from '@/lib/tradeEngine';

interface TradePanelProps {
  currentPrice: number;
  onPlaceOrder: (side: OrderSide, size: number, sl?: number, tp?: number) => void;
  onCloseOrder: (orderId: string) => void;
  openOrders: { id: string; side: OrderSide; fillPrice?: number; stopLoss?: number; takeProfit?: number; size: number; unrealizedPnl: number }[];
  startingBalance: number;
}

export function TradePanel({ currentPrice, onPlaceOrder, onCloseOrder, openOrders, startingBalance }: TradePanelProps) {
  const [size, setSize] = useState(1);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [useSL, setUseSL] = useState(true);
  const [useTP, setUseTP] = useState(true);

  const pipValue = currentPrice > 10 ? 0.01 : 0.0001; // Auto-detect: stocks vs forex

  const handleOrder = (side: OrderSide) => {
    const sl = useSL
      ? side === 'buy'
        ? currentPrice - slPips * pipValue
        : currentPrice + slPips * pipValue
      : undefined;
    const tp = useTP
      ? side === 'buy'
        ? currentPrice + tpPips * pipValue
        : currentPrice - tpPips * pipValue
      : undefined;
    onPlaceOrder(side, size, sl, tp);
  };

  // Calculate total unrealized P&L
  const totalUnrealized = openOrders.reduce((sum, o) => sum + o.unrealizedPnl, 0);
  const accountEquity = startingBalance + totalUnrealized;

  // DOM-style visual projection
  const buyTarget = currentPrice + tpPips * pipValue;
  const buyStop = currentPrice - slPips * pipValue;
  const sellTarget = currentPrice - tpPips * pipValue;
  const sellStop = currentPrice + slPips * pipValue;
  const riskReward = useSL && useTP && slPips > 0 ? (tpPips / slPips).toFixed(1) : '—';

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full overflow-hidden">
      {/* Account equity bar */}
      <div className="px-3 py-2 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Equity</span>
          <span className={`text-xs font-mono font-bold ${accountEquity >= startingBalance ? 'text-long' : 'text-short'}`}>
            ${accountEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {totalUnrealized !== 0 && (
          <div className="text-[10px] font-mono text-right mt-0.5">
            <span className={totalUnrealized >= 0 ? 'text-long' : 'text-short'}>
              {totalUnrealized >= 0 ? '+' : ''}{totalUnrealized.toFixed(2)} unrealized
            </span>
          </div>
        )}
      </div>

      {/* Order Entry */}
      <div className="p-3 border-b border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Order Entry</div>

        {/* Current price */}
        <div className="text-center mb-3">
          <span className="font-mono text-lg font-bold text-foreground">
            {currentPrice > 10 ? currentPrice.toFixed(2) : currentPrice.toFixed(5)}
          </span>
        </div>

        {/* Size */}
        <div className="mb-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Lot Size</label>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={size}
            onChange={e => setSize(Number(e.target.value))}
            className="w-full bg-secondary text-secondary-foreground border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* SL */}
        <div className="mb-2 flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider cursor-pointer">
            <input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} className="rounded border-border" />
            SL (pips)
          </label>
          <input
            type="number"
            min={1}
            value={slPips}
            onChange={e => setSlPips(Number(e.target.value))}
            disabled={!useSL}
            className="flex-1 bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          />
        </div>

        {/* TP */}
        <div className="mb-3 flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider cursor-pointer">
            <input type="checkbox" checked={useTP} onChange={e => setUseTP(e.target.checked)} className="rounded border-border" />
            TP (pips)
          </label>
          <input
            type="number"
            min={1}
            value={tpPips}
            onChange={e => setTpPips(Number(e.target.value))}
            disabled={!useTP}
            className="flex-1 bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          />
        </div>

        {/* R:R display */}
        <div className="text-center text-[10px] font-mono text-muted-foreground mb-3">
          R:R = 1:{riskReward}
        </div>

        {/* Visual DOM Projection */}
        <div className="mb-3 rounded-md border border-border overflow-hidden">
          {/* BUY side */}
          <div className="flex">
            <div className="flex-1 p-2 bg-long/5 border-r border-border">
              <div className="text-[9px] text-muted-foreground uppercase mb-1">Buy Projection</div>
              {useTP && (
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-long font-medium">TP</span>
                  <span className="font-mono text-long">{currentPrice > 10 ? buyTarget.toFixed(2) : buyTarget.toFixed(5)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-foreground font-medium">Entry</span>
                <span className="font-mono text-foreground">{currentPrice > 10 ? currentPrice.toFixed(2) : currentPrice.toFixed(5)}</span>
              </div>
              {useSL && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-short font-medium">SL</span>
                  <span className="font-mono text-short">{currentPrice > 10 ? buyStop.toFixed(2) : buyStop.toFixed(5)}</span>
                </div>
              )}
              {/* Visual bar */}
              <div className="mt-2 relative h-16 w-full rounded-sm overflow-hidden bg-muted/30">
                {useSL && (
                  <div className="absolute bottom-0 left-0 right-0 bg-short/20 border-t border-short/50"
                    style={{ height: `${Math.min(50, (slPips / (slPips + tpPips)) * 100)}%` }}>
                    <div className="absolute top-0 left-0 right-0 h-px bg-short" />
                  </div>
                )}
                <div className="absolute left-0 right-0 bg-foreground/30 h-px"
                  style={{ top: useSL && useTP ? `${(tpPips / (slPips + tpPips)) * 100}%` : '50%' }} />
                {useTP && (
                  <div className="absolute top-0 left-0 right-0 bg-long/20 border-b border-long/50"
                    style={{ height: `${Math.min(50, (tpPips / (slPips + tpPips)) * 100)}%` }}>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-long" />
                  </div>
                )}
              </div>
            </div>

            {/* SELL side */}
            <div className="flex-1 p-2 bg-short/5">
              <div className="text-[9px] text-muted-foreground uppercase mb-1">Sell Projection</div>
              {useSL && (
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-short font-medium">SL</span>
                  <span className="font-mono text-short">{currentPrice > 10 ? sellStop.toFixed(2) : sellStop.toFixed(5)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-foreground font-medium">Entry</span>
                <span className="font-mono text-foreground">{currentPrice > 10 ? currentPrice.toFixed(2) : currentPrice.toFixed(5)}</span>
              </div>
              {useTP && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-long font-medium">TP</span>
                  <span className="font-mono text-long">{currentPrice > 10 ? sellTarget.toFixed(2) : sellTarget.toFixed(5)}</span>
                </div>
              )}
              {/* Visual bar */}
              <div className="mt-2 relative h-16 w-full rounded-sm overflow-hidden bg-muted/30">
                {useTP && (
                  <div className="absolute bottom-0 left-0 right-0 bg-long/20 border-t border-long/50"
                    style={{ height: `${Math.min(50, (tpPips / (slPips + tpPips)) * 100)}%` }}>
                    <div className="absolute top-0 left-0 right-0 h-px bg-long" />
                  </div>
                )}
                <div className="absolute left-0 right-0 bg-foreground/30 h-px"
                  style={{ top: useSL && useTP ? `${(slPips / (slPips + tpPips)) * 100}%` : '50%' }} />
                {useSL && (
                  <div className="absolute top-0 left-0 right-0 bg-short/20 border-b border-short/50"
                    style={{ height: `${Math.min(50, (slPips / (slPips + tpPips)) * 100)}%` }}>
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-short" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Buy/Sell buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleOrder('buy')}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold
                       bg-long/20 text-long border border-long/40 hover:bg-long/30 transition-all"
          >
            <TrendingUp size={14} />
            BUY
          </button>
          <button
            onClick={() => handleOrder('sell')}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold
                       bg-short/20 text-short border border-short/40 hover:bg-short/30 transition-all"
          >
            <TrendingDown size={14} />
            SELL
          </button>
        </div>
      </div>

      {/* Open Orders */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border">
          Open Positions ({openOrders.length})
        </div>
        {openOrders.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">No open positions</div>
        ) : (
          openOrders.map(order => (
            <div key={order.id} className="px-3 py-2 border-b border-border hover:bg-muted/30 group">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${order.side === 'buy' ? 'text-long' : 'text-short'}`}>
                  {order.side.toUpperCase()} {order.size}
                </span>
                <button
                  onClick={() => onCloseOrder(order.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  title="Close position"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
                <span>@ {order.fillPrice != null ? (order.fillPrice > 10 ? order.fillPrice.toFixed(2) : order.fillPrice.toFixed(5)) : '—'}</span>
                {order.stopLoss && <span className="text-short">SL {order.stopLoss > 10 ? order.stopLoss.toFixed(2) : order.stopLoss.toFixed(5)}</span>}
                {order.takeProfit && <span className="text-long">TP {order.takeProfit > 10 ? order.takeProfit.toFixed(2) : order.takeProfit.toFixed(5)}</span>}
              </div>
              <div className={`text-[10px] font-mono mt-0.5 ${order.unrealizedPnl >= 0 ? 'text-long' : 'text-short'}`}>
                P&L: {order.unrealizedPnl >= 0 ? '+' : ''}{order.unrealizedPnl.toFixed(2)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
