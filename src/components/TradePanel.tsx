import { useState } from 'react';
import { TrendingUp, TrendingDown, X, ChevronRight, ChevronLeft } from 'lucide-react';
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
  const [collapsed, setCollapsed] = useState(false);
  const [showProjection, setShowProjection] = useState(true);

  const pipValue = currentPrice > 10 ? 0.01 : 0.0001;

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

  const totalUnrealized = openOrders.reduce((sum, o) => sum + o.unrealizedPnl, 0);
  const accountEquity = startingBalance + totalUnrealized;

  const buyTarget = currentPrice + tpPips * pipValue;
  const buyStop = currentPrice - slPips * pipValue;
  const sellTarget = currentPrice - tpPips * pipValue;
  const sellStop = currentPrice + slPips * pipValue;
  const riskReward = useSL && useTP && slPips > 0 ? (tpPips / slPips).toFixed(1) : '—';

  // Collapsed: just show a thin toggle bar
  if (collapsed) {
    return (
      <div className="w-8 bg-card border-l border-border flex flex-col items-center justify-center h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-primary"
          title="Show trade panel"
        >
          <ChevronLeft size={16} />
        </button>
        {openOrders.length > 0 && (
          <div className="mt-2 w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-mono flex items-center justify-center">
            {openOrders.length}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full overflow-hidden">
      {/* Header with collapse */}
      <div className="px-3 py-2 border-b border-border bg-secondary/30 flex items-center justify-between">
        <div className="flex-1">
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
        <button
          onClick={() => setCollapsed(true)}
          className="ml-2 p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="Collapse panel"
        >
          <ChevronRight size={14} />
        </button>
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
          <div className="flex gap-1">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={size}
              onChange={e => setSize(Number(e.target.value))}
              className="flex-1 bg-secondary text-secondary-foreground border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {/* Quick size buttons */}
            {[0.1, 0.5, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`px-1.5 py-1 text-[10px] font-mono rounded border transition-colors ${
                  size === s ? 'bg-primary/20 text-primary border-primary/40' : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
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
          R:R = 1:{riskReward} &nbsp;|&nbsp; Risk: {slPips}p &nbsp; Reward: {tpPips}p
        </div>

        {/* Visual DOM Projection - toggleable */}
        <button
          onClick={() => setShowProjection(!showProjection)}
          className="w-full text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between hover:text-foreground transition-colors"
        >
          <span>Projection View</span>
          <span className="text-[9px]">{showProjection ? '▼ Hide' : '▶ Show'}</span>
        </button>

        {showProjection && (
          <div className="mb-3 rounded-md border border-border overflow-hidden">
            <div className="flex">
              {/* BUY side */}
              <div className="flex-1 p-2 bg-long/5 border-r border-border">
                <div className="text-[9px] text-muted-foreground uppercase mb-1">Buy</div>
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
                <div className="mt-2 relative h-14 w-full rounded-sm overflow-hidden bg-muted/30">
                  {useSL && (
                    <div className="absolute bottom-0 left-0 right-0 bg-short/15 border-t border-short/40"
                      style={{ height: `${Math.min(50, (slPips / (slPips + tpPips)) * 100)}%` }}>
                      <div className="absolute top-0 left-0 right-0 h-px bg-short" />
                    </div>
                  )}
                  <div className="absolute left-0 right-0 bg-foreground/20 h-px"
                    style={{ top: useSL && useTP ? `${(tpPips / (slPips + tpPips)) * 100}%` : '50%' }} />
                  {useTP && (
                    <div className="absolute top-0 left-0 right-0 bg-long/15 border-b border-long/40"
                      style={{ height: `${Math.min(50, (tpPips / (slPips + tpPips)) * 100)}%` }}>
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-long" />
                    </div>
                  )}
                </div>
              </div>

              {/* SELL side */}
              <div className="flex-1 p-2 bg-short/5">
                <div className="text-[9px] text-muted-foreground uppercase mb-1">Sell</div>
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
                <div className="mt-2 relative h-14 w-full rounded-sm overflow-hidden bg-muted/30">
                  {useTP && (
                    <div className="absolute bottom-0 left-0 right-0 bg-long/15 border-t border-long/40"
                      style={{ height: `${Math.min(50, (tpPips / (slPips + tpPips)) * 100)}%` }}>
                      <div className="absolute top-0 left-0 right-0 h-px bg-long" />
                    </div>
                  )}
                  <div className="absolute left-0 right-0 bg-foreground/20 h-px"
                    style={{ top: useSL && useTP ? `${(slPips / (slPips + tpPips)) * 100}%` : '50%' }} />
                  {useSL && (
                    <div className="absolute top-0 left-0 right-0 bg-short/15 border-b border-short/40"
                      style={{ height: `${Math.min(50, (slPips / (slPips + tpPips)) * 100)}%` }}>
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-short" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Buy/Sell buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleOrder('buy')}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold
                       bg-long/20 text-long border border-long/40 hover:bg-long/30 transition-all active:scale-95"
          >
            <TrendingUp size={14} />
            BUY
          </button>
          <button
            onClick={() => handleOrder('sell')}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold
                       bg-short/20 text-short border border-short/40 hover:bg-short/30 transition-all active:scale-95"
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
                  {order.side === 'buy' ? '▲' : '▼'} {order.side.toUpperCase()} {order.size}
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
