import { useState } from 'react';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import type { OrderSide } from '@/lib/tradeEngine';

interface TradePanelProps {
  currentPrice: number;
  onPlaceOrder: (side: OrderSide, size: number, sl?: number, tp?: number) => void;
  onCloseOrder: (orderId: string) => void;
  openOrders: { id: string; side: OrderSide; fillPrice?: number; stopLoss?: number; takeProfit?: number; size: number; unrealizedPnl: number }[];
}

export function TradePanel({ currentPrice, onPlaceOrder, onCloseOrder, openOrders }: TradePanelProps) {
  const [size, setSize] = useState(1);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [useSL, setUseSL] = useState(true);
  const [useTP, setUseTP] = useState(true);

  const pipValue = 0.0001; // forex standard

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

  return (
    <div className="w-64 bg-card border-l border-border flex flex-col h-full overflow-hidden">
      {/* Order Entry */}
      <div className="p-3 border-b border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Order Entry</div>

        {/* Current price */}
        <div className="text-center mb-3">
          <span className="font-mono text-lg font-bold text-foreground">{currentPrice.toFixed(5)}</span>
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
          <input type="checkbox" checked={useSL} onChange={e => setUseSL(e.target.checked)} className="accent-primary" />
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">SL (pips)</label>
          <input
            type="number"
            min={1}
            value={slPips}
            onChange={e => setSlPips(Number(e.target.value))}
            disabled={!useSL}
            className="w-16 ml-auto bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          />
        </div>

        {/* TP */}
        <div className="mb-3 flex items-center gap-2">
          <input type="checkbox" checked={useTP} onChange={e => setUseTP(e.target.checked)} className="accent-primary" />
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">TP (pips)</label>
          <input
            type="number"
            min={1}
            value={tpPips}
            onChange={e => setTpPips(Number(e.target.value))}
            disabled={!useTP}
            className="w-16 ml-auto bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
          />
        </div>

        {/* R:R display */}
        {useSL && useTP && (
          <div className="text-center text-[10px] text-muted-foreground mb-3 font-mono">
            R:R = 1:{(tpPips / slPips).toFixed(1)}
          </div>
        )}

        {/* Buy / Sell buttons */}
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
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-short transition-all"
                  title="Close position"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
                <span>@ {order.fillPrice?.toFixed(5)}</span>
                {order.stopLoss && <span className="text-short">SL {order.stopLoss.toFixed(5)}</span>}
                {order.takeProfit && <span className="text-long">TP {order.takeProfit.toFixed(5)}</span>}
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
