import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  X,
  ChevronRight,
  ChevronLeft,
  Calculator,
  Shield,
  Sliders,
  DollarSign,
  Percent,
  Check,
  Edit2,
  ArrowUpDown,
} from 'lucide-react';
import type { OrderSide } from '@/lib/tradeEngine';
import {
  getContractMultiplier,
  getPipSize,
  calculateRiskPositionSize,
} from '@/lib/tradeEngine';

interface TradePanelProps {
  currentPrice: number;
  onPlaceOrder: (side: OrderSide, size: number, sl?: number, tp?: number) => void;
  onCloseOrder: (orderId: string) => void;
  onUpdateOrder?: (orderId: string, updates: { stopLoss?: number; takeProfit?: number; limitPrice?: number }) => void;
  openOrders: {
    id: string;
    side: OrderSide;
    fillPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    size: number;
    unrealizedPnl: number;
  }[];
  pendingOrders?: {
    id: string;
    side: OrderSide;
    limitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    size: number;
  }[];
  onCancelOrder?: (orderId: string) => void;
  onCloseAll?: () => void;
  startingBalance: number;
  collapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export function TradePanel({
  currentPrice,
  onPlaceOrder,
  onCloseOrder,
  onUpdateOrder,
  openOrders,
  pendingOrders = [],
  onCancelOrder,
  onCloseAll,
  startingBalance,
  collapsed: externalCollapsed,
  onToggleCollapse,
}: TradePanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const handleSetCollapsed = (val: boolean) => {
    setInternalCollapsed(val);
    onToggleCollapse?.(val);
  };

  const [size, setSize] = useState(1);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [useSL, setUseSL] = useState(true);
  const [useTP, setUseTP] = useState(true);
  const [showProjection, setShowProjection] = useState(true);

  // Risk Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [riskMode, setRiskMode] = useState<'percent' | 'cash'>('percent');
  const [riskValue, setRiskValue] = useState(1.0); // 1% default

  // Editing level for open order
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editSL, setEditSL] = useState<string>('');
  const [editTP, setEditTP] = useState<string>('');

  const pipSize = getPipSize(currentPrice);
  const contractMultiplier = getContractMultiplier(currentPrice);
  const pipDollarValuePerLot = pipSize * contractMultiplier;

  // Real-time calculated risk position size
  const calculatedRisk = useMemo(() => {
    return calculateRiskPositionSize(
      startingBalance,
      { mode: riskMode, value: riskValue },
      slPips,
      currentPrice
    );
  }, [startingBalance, riskMode, riskValue, slPips, currentPrice]);

  const handleApplyCalculatedSize = () => {
    setSize(calculatedRisk.size);
    setShowCalculator(false);
  };

  const handleOrder = (side: OrderSide) => {
    const sl = useSL
      ? side === 'buy'
        ? currentPrice - slPips * pipSize
        : currentPrice + slPips * pipSize
      : undefined;
    const tp = useTP
      ? side === 'buy'
        ? currentPrice + tpPips * pipSize
        : currentPrice - tpPips * pipSize
      : undefined;
    onPlaceOrder(side, size, sl, tp);
  };

  const totalUnrealized = openOrders.reduce((sum, o) => sum + o.unrealizedPnl, 0);
  const accountEquity = startingBalance + totalUnrealized;

  const buyTarget = currentPrice + tpPips * pipSize;
  const buyStop = currentPrice - slPips * pipSize;
  const sellTarget = currentPrice - tpPips * pipSize;
  const sellStop = currentPrice + slPips * pipSize;
  const riskReward = useSL && useTP && slPips > 0 ? (tpPips / slPips).toFixed(1) : '—';

  // Projected monetary outcome
  const projectedLoss = useSL ? slPips * pipDollarValuePerLot * size : 0;
  const projectedGain = useTP ? tpPips * pipDollarValuePerLot * size : 0;

  // Handle saving inline SL/TP edits on an open position
  const handleSaveOrderLevels = (orderId: string) => {
    if (!onUpdateOrder) return;
    const newSL = editSL ? parseFloat(editSL) : undefined;
    const newTP = editTP ? parseFloat(editTP) : undefined;
    onUpdateOrder(orderId, {
      stopLoss: !isNaN(newSL as number) ? newSL : undefined,
      takeProfit: !isNaN(newTP as number) ? newTP : undefined,
    });
    setEditingOrderId(null);
  };

  // Collapsed: sleek vertical strip
  if (collapsed) {
    return (
      <div className="w-8 bg-card border-l border-border flex flex-col items-center justify-between py-3 h-full select-none shrink-0 transition-all">
        <button
          onClick={() => handleSetCollapsed(false)}
          className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary cursor-pointer"
          title="Expand Trade Panel"
        >
          <ChevronLeft size={16} />
        </button>

        {openOrders.length > 0 && (
          <div
            className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer"
            onClick={() => handleSetCollapsed(false)}
            title={`${openOrders.length} active positions`}
          >
            {openOrders.length}
          </div>
        )}

        <div className="writing-mode-vertical text-[10px] font-mono text-muted-foreground uppercase tracking-widest rotate-180">
          Trade Panel
        </div>
      </div>
    );
  }

  return (
    <div className="w-76 bg-card border-l border-border flex flex-col h-full overflow-hidden select-none shrink-0 transition-all">
      {/* Header with collapse */}
      <div className="px-3 py-2 border-b border-border bg-secondary/30 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Account Equity
            </span>
            <span
              className={`text-xs font-mono font-bold ${
                accountEquity >= startingBalance ? 'text-long' : 'text-short'
              }`}
            >
              ${accountEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          {totalUnrealized !== 0 && (
            <div className="text-[10px] font-mono text-right mt-0.5">
              <span className={totalUnrealized >= 0 ? 'text-long' : 'text-short'}>
                {totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(2)} unrealized
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => handleSetCollapsed(true)}
          className="ml-2 p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          title="Collapse Trade Panel"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Order Entry */}
      <div className="p-3 border-b border-border space-y-2.5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Order Entry & Risk
          </div>
          <button
            onClick={() => setShowCalculator((prev) => !prev)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
              showCalculator
                ? 'bg-primary text-primary-foreground font-bold'
                : 'bg-secondary text-primary hover:bg-secondary/80'
            }`}
            title="Toggle Risk Size Calculator"
          >
            <Calculator size={11} />
            <span>Risk Calc</span>
          </button>
        </div>

        {/* Risk Size Calculator Popover / Section */}
        {showCalculator && (
          <div className="p-2.5 rounded-lg bg-secondary/60 border border-primary/30 space-y-2 animate-in fade-in duration-100">
            <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
              <span className="flex items-center gap-1">
                <Shield size={12} className="text-primary" />
                <span>Risk Position Calculator</span>
              </span>
              <span className="font-mono text-[10px] text-primary">
                ${pipDollarValuePerLot.toFixed(2)} / pip
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setRiskMode('percent')}
                className={`py-1 text-[10px] font-semibold rounded transition-colors ${
                  riskMode === 'percent'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                % of Balance
              </button>
              <button
                type="button"
                onClick={() => setRiskMode('cash')}
                className={`py-1 text-[10px] font-semibold rounded transition-colors ${
                  riskMode === 'cash'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                Fixed USD ($)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {riskMode === 'percent' ? 'Risk %' : 'Risk $'}:
              </span>
              <input
                type="number"
                step={riskMode === 'percent' ? 0.25 : 25}
                min={0.1}
                value={riskValue}
                onChange={(e) => setRiskValue(parseFloat(e.target.value) || 1)}
                className="w-20 bg-card text-foreground border border-border rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                = ${calculatedRisk.riskAmount.toFixed(2)} risk
              </span>
            </div>

            <div className="p-2 rounded bg-card/80 border border-border/60 text-[10px] font-mono space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Calculated Size:</span>
                <span className="text-primary font-bold text-xs">{calculatedRisk.size} Lots</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">SL Risk ({slPips} pips):</span>
                <span className="text-short font-semibold">-${calculatedRisk.riskAmount.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleApplyCalculatedSize}
              className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              <Check size={12} /> Apply {calculatedRisk.size} Lots
            </button>
          </div>
        )}

        {/* Position Size Input */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Lot Size / Volume</span>
            <span className="font-mono text-primary">
              1 Lot = ${(pipDollarValuePerLot * size).toFixed(2)}/pip
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0.01}
              step={0.1}
              value={size}
              onChange={(e) => setSize(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
              className="flex-1 bg-secondary text-foreground border border-border rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {[0.1, 0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                  size === s
                    ? 'bg-primary text-primary-foreground font-bold'
                    : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* SL / TP Inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={useSL}
                  onChange={(e) => setUseSL(e.target.checked)}
                  className="rounded border-border accent-primary"
                />
                Stop Loss
              </span>
              <span className="text-short font-mono">
                {useSL ? `-$${projectedLoss.toFixed(1)}` : 'Off'}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={slPips}
                onChange={(e) => setSlPips(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={!useSL}
                className="w-full bg-secondary text-foreground border border-border rounded px-2 py-1 text-xs font-mono disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground font-mono">p</span>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={useTP}
                  onChange={(e) => setUseTP(e.target.checked)}
                  className="rounded border-border accent-primary"
                />
                Take Profit
              </span>
              <span className="text-long font-mono">
                {useTP ? `+$${projectedGain.toFixed(1)}` : 'Off'}
              </span>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={tpPips}
                onChange={(e) => setTpPips(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={!useTP}
                className="w-full bg-secondary text-foreground border border-border rounded px-2 py-1 text-xs font-mono disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[10px] text-muted-foreground font-mono">p</span>
            </div>
          </div>
        </div>

        {/* Risk / Reward ratio */}
        <div className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded bg-secondary/40 border border-border/50">
          <span className="text-muted-foreground">Risk:Reward Ratio</span>
          <span className="text-primary font-bold">1 : {riskReward}</span>
        </div>

        {/* Buy & Sell Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => handleOrder('buy')}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold bg-long/20 text-long border border-long/40 hover:bg-long/30 transition-all active:scale-95 cursor-pointer"
          >
            <TrendingUp size={14} />
            BUY {size}L
          </button>
          <button
            onClick={() => handleOrder('sell')}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold bg-short/20 text-short border border-short/40 hover:bg-short/30 transition-all active:scale-95 cursor-pointer"
          >
            <TrendingDown size={14} />
            SELL {size}L
          </button>
        </div>
      </div>

      {/* Open Orders / Position Manager */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border flex items-center justify-between bg-secondary/20">
          <span className="font-semibold">Open Positions ({openOrders.length})</span>
          {onCloseAll && openOrders.length > 1 && (
            <button
              onClick={onCloseAll}
              className="normal-case text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              Close all
            </button>
          )}
        </div>

        {openOrders.length === 0 ? (
          <div className="p-5 text-center text-xs text-muted-foreground space-y-1">
            <div>No open positions</div>
            <div className="text-[10px] opacity-70">Execute BUY or SELL orders above during replay</div>
          </div>
        ) : (
          openOrders.map((order) => {
            const isEditing = editingOrderId === order.id;

            return (
              <div key={order.id} className="p-3 border-b border-border hover:bg-muted/20 group space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold ${
                        order.side === 'buy' ? 'text-long' : 'text-short'
                      }`}
                    >
                      {order.side === 'buy' ? '▲ BUY' : '▼ SELL'} {order.size} Lots
                    </span>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditingOrderId(null);
                        } else {
                          setEditingOrderId(order.id);
                          setEditSL(order.stopLoss != null ? String(order.stopLoss) : '');
                          setEditTP(order.takeProfit != null ? String(order.takeProfit) : '');
                        }
                      }}
                      className="p-0.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      title="Adjust SL/TP levels"
                    >
                      <Edit2 size={11} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold ${
                        order.unrealizedPnl >= 0 ? 'text-long' : 'text-short'
                      }`}
                    >
                      {order.unrealizedPnl >= 0 ? '+' : ''}${order.unrealizedPnl.toFixed(2)}
                    </span>
                    <button
                      onClick={() => onCloseOrder(order.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded cursor-pointer"
                      title="Close position"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
                  <span>
                    @{' '}
                    {order.fillPrice != null
                      ? order.fillPrice > 10
                        ? order.fillPrice.toFixed(2)
                        : order.fillPrice.toFixed(5)
                      : '—'}
                  </span>
                  <span className="text-short truncate">
                    SL:{' '}
                    {order.stopLoss != null
                      ? order.stopLoss > 10
                        ? order.stopLoss.toFixed(2)
                        : order.stopLoss.toFixed(5)
                      : 'None'}
                  </span>
                  <span className="text-long truncate">
                    TP:{' '}
                    {order.takeProfit != null
                      ? order.takeProfit > 10
                        ? order.takeProfit.toFixed(2)
                        : order.takeProfit.toFixed(5)
                      : 'None'}
                  </span>
                </div>

                {/* Inline Level Adjuster */}
                {isEditing && (
                  <div className="p-2 rounded bg-card border border-primary/30 space-y-1.5 mt-1 animate-in fade-in duration-100">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center justify-between">
                      <span>Adjust Order Levels</span>
                      <button
                        onClick={() => handleSaveOrderLevels(order.id)}
                        className="text-primary hover:underline text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                      >
                        <Check size={11} /> Save
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-[9px] text-short font-mono block">Stop Loss Price:</span>
                        <input
                          type="number"
                          step={pipSize}
                          value={editSL}
                          onChange={(e) => setEditSL(e.target.value)}
                          placeholder="SL price"
                          className="w-full bg-secondary text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-long font-mono block">Take Profit Price:</span>
                        <input
                          type="number"
                          step={pipSize}
                          value={editTP}
                          onChange={(e) => setEditTP(e.target.value)}
                          placeholder="TP price"
                          className="w-full bg-secondary text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Pending Orders */}
        {pendingOrders.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider border-y border-border bg-secondary/20 font-semibold">
              Pending Orders ({pendingOrders.length})
            </div>
            {pendingOrders.map((order) => (
              <div key={order.id} className="p-3 border-b border-border hover:bg-muted/20 group space-y-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      order.side === 'buy' ? 'text-long' : 'text-short'
                    }`}
                  >
                    {order.side.toUpperCase()} LIMIT {order.size} Lots
                  </span>
                  {onCancelOrder && (
                    <button
                      onClick={() => onCancelOrder(order.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-0.5 cursor-pointer"
                      title="Cancel order"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
                  <span>
                    @{' '}
                    {order.limitPrice != null
                      ? order.limitPrice > 10
                        ? order.limitPrice.toFixed(2)
                        : order.limitPrice.toFixed(5)
                      : '—'}
                  </span>
                  {order.stopLoss != null && (
                    <span className="text-short">SL: {order.stopLoss.toFixed(order.stopLoss > 10 ? 2 : 5)}</span>
                  )}
                  {order.takeProfit != null && (
                    <span className="text-long">TP: {order.takeProfit.toFixed(order.takeProfit > 10 ? 2 : 5)}</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
