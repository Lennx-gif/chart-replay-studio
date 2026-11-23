import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  X,
  ChevronRight,
  ChevronLeft,
  Calculator,
  Shield,
  Check,
  Edit2,
  Calendar,
  Layers,
  ArrowRightLeft,
  Clock,
  Percent,
} from 'lucide-react';
import type { Order, OrderSide, SessionLedger } from '@/lib/tradeEngine';
import { getInstrumentSpec, LOT_PRESETS, PIP_PRESETS } from '@/lib/currency';
import { calculateRiskPositionSize } from '@/lib/tradeEngine';
import { NewsFeed } from './NewsFeed';
import { SessionAnalytics } from './SessionAnalytics';
import { TimezoneSelector } from './TimezoneSelector';

interface TradePanelProps {
  currentPrice: number;
  symbol?: string;
  tzOffset?: number;
  onOffsetChange?: (offset: number) => void;
  onPlaceOrder: (side: OrderSide, size: number, sl?: number, tp?: number) => void;
  onPlacePending?: (side: OrderSide, price: number, sl?: number, tp?: number, size?: number) => void;
  onCloseOrder: (orderId: string) => void;
  onPartialClose?: (orderId: string, ratio: number) => void;
  onSetBreakEven?: (orderId: string) => void;
  onUpdateOrder?: (orderId: string, updates: { stopLoss?: number; takeProfit?: number; limitPrice?: number }) => void;
  onCancelOrder?: (orderId: string) => void;
  onCloseAll?: () => void;
  orders?: Order[];
  ledger?: SessionLedger;
  startingBalance?: number;
  currentReplayTime?: number;
  onSeekTime?: (time: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  activeTab?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;

  // Legacy fallback support
  openOrders?: {
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
}

type PanelTab = 'trade' | 'positions' | 'news' | 'analytics';
type OrderExecutionType = 'market' | 'limit' | 'stop';

export function TradePanel({
  currentPrice,
  symbol = 'EURUSD',
  tzOffset = 0,
  onOffsetChange,
  onPlaceOrder,
  onPlacePending,
  onCloseOrder,
  onPartialClose,
  onSetBreakEven,
  onUpdateOrder,
  onCancelOrder,
  onCloseAll,
  orders = [],
  ledger,
  startingBalance = 10000,
  currentReplayTime = 0,
  onSeekTime,
  collapsed: externalCollapsed,
  onToggleCollapse,
  activeTab: externalActiveTab,
  onTabChange,
  openOrders: fallbackOpenOrders,
  pendingOrders: fallbackPendingOrders,
}: TradePanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const handleSetCollapsed = (val: boolean) => {
    setInternalCollapsed(val);
    onToggleCollapse?.(val);
  };

  const [internalActiveTab, setInternalActiveTab] = useState<PanelTab>('trade');
  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab;
  const handleTabChange = (t: PanelTab) => {
    setInternalActiveTab(t);
    onTabChange?.(t);
  };
  const [orderType, setOrderType] = useState<OrderExecutionType>('market');
  const [pendingPrice, setPendingPrice] = useState<string>('');

  const [size, setSize] = useState(1.0);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [useSL, setUseSL] = useState(true);
  const [useTP, setUseTP] = useState(true);

  // Risk Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [riskMode, setRiskMode] = useState<'percent' | 'cash'>('percent');
  const [riskValue, setRiskValue] = useState(1.0); // 1% default

  // Inline editing state for active order
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editSL, setEditSL] = useState<string>('');
  const [editTP, setEditTP] = useState<string>('');

  const spec = useMemo(() => getInstrumentSpec(symbol, currentPrice), [symbol, currentPrice]);
  const pipValuePerLot = spec.getPipValuePerLot(currentPrice);

  // Derived orders lists
  const openPositions = useMemo(() => {
    if (orders.length > 0) {
      return orders.filter((o) => o.status === 'filled');
    }
    return (fallbackOpenOrders || []) as any[];
  }, [orders, fallbackOpenOrders]);

  const pendingList = useMemo(() => {
    if (orders.length > 0) {
      return orders.filter((o) => o.status === 'pending');
    }
    return (fallbackPendingOrders || []) as any[];
  }, [orders, fallbackPendingOrders]);

  const closedHistory = useMemo(() => {
    return orders
      .filter((o) => o.status === 'closed' && o.closeTime != null)
      .sort((a, b) => (b.closeTime || 0) - (a.closeTime || 0))
      .slice(0, 15);
  }, [orders]);

  // Equity calculation
  const totalBalance = ledger ? ledger.currentBalance : startingBalance;
  const totalEquity = ledger ? ledger.currentEquity : startingBalance;
  const isProfitable = totalEquity >= (ledger?.initialBalance ?? startingBalance);

  // Risk Calculator Sync
  const calculatedRisk = useMemo(() => {
    return calculateRiskPositionSize(
      totalEquity,
      { mode: riskMode, value: riskValue },
      slPips,
      currentPrice,
      symbol
    );
  }, [totalEquity, riskMode, riskValue, slPips, currentPrice, symbol]);

  const handleApplyCalculatedSize = () => {
    setSize(calculatedRisk.size);
    setShowCalculator(false);
  };

  const handleExecute = (side: OrderSide) => {
    const basePrice = orderType !== 'market' && parseFloat(pendingPrice) > 0 ? parseFloat(pendingPrice) : currentPrice;
    const sl = useSL
      ? side === 'buy'
        ? basePrice - slPips * spec.pipSize
        : basePrice + slPips * spec.pipSize
      : undefined;
    const tp = useTP
      ? side === 'buy'
        ? basePrice + tpPips * spec.pipSize
        : basePrice - tpPips * spec.pipSize
      : undefined;

    if (orderType === 'market') {
      onPlaceOrder(side, size, sl, tp);
    } else if (onPlacePending) {
      onPlacePending(side, basePrice, sl, tp, size);
    }
  };

  const riskReward = useSL && useTP && slPips > 0 ? (tpPips / slPips).toFixed(1) : '—';
  const projectedLoss = useSL ? slPips * pipValuePerLot * size : 0;
  const projectedGain = useTP ? tpPips * pipValuePerLot * size : 0;

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

  // Sleek collapsed vertical strip
  if (collapsed) {
    return (
      <div className="w-9 bg-card border-l border-border flex flex-col items-center justify-between py-3 h-full select-none shrink-0 transition-all">
        <button
          onClick={() => handleSetCollapsed(false)}
          className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary cursor-pointer"
          title="Expand Right Panel"
        >
          <ChevronLeft size={16} />
        </button>

        {openPositions.length > 0 && (
          <div
            className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-mono font-bold flex items-center justify-center cursor-pointer"
            onClick={() => handleSetCollapsed(false)}
            title={`${openPositions.length} active positions`}
          >
            {openPositions.length}
          </div>
        )}

        <div className="writing-mode-vertical text-[10px] font-mono text-muted-foreground uppercase tracking-widest rotate-180">
          Trading & News
        </div>
      </div>
    );
  }

  return (
    <div className="w-[305px] bg-card border-l border-border flex flex-col h-full overflow-hidden select-none shrink-0 transition-all">
      {/* Top Header with live Equity and Collapse */}
      <div className="px-3 py-2 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Account Equity
            </span>
            <span className={`text-xs font-mono font-bold ${isProfitable ? 'text-long' : 'text-short'}`}>
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          {ledger && ledger.unrealizedPnl !== 0 && (
            <div className="text-[10px] font-mono text-right mt-0.5">
              <span className={ledger.unrealizedPnl >= 0 ? 'text-long' : 'text-short'}>
                {ledger.unrealizedPnl >= 0 ? '+' : ''}${ledger.unrealizedPnl.toFixed(2)} floating
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => handleSetCollapsed(true)}
          className="ml-2 p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          title="Collapse Panel"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Segmented 4-Tab Bar */}
      <div className="grid grid-cols-4 border-b border-border bg-secondary/20 p-1 gap-1 text-[10px] font-semibold">
        <button
          onClick={() => handleTabChange('trade')}
          className={`py-1 rounded text-center transition-all cursor-pointer ${
            activeTab === 'trade'
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          Trade
        </button>
        <button
          onClick={() => handleTabChange('positions')}
          className={`py-1 rounded text-center transition-all relative cursor-pointer ${
            activeTab === 'positions'
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <span>Positions</span>
          {openPositions.length > 0 && (
            <span className="ml-1 text-[8px] px-1 py-0.2 rounded-full bg-black/30 font-mono">
              {openPositions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTabChange('news')}
          className={`py-1 rounded text-center transition-all cursor-pointer ${
            activeTab === 'news'
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          News
        </button>
        <button
          onClick={() => handleTabChange('analytics')}
          className={`py-1 rounded text-center transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Tab 1: Order Entry & Risk */}
      {activeTab === 'trade' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {/* Market vs Pending toggles */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-secondary/80 p-0.5 rounded-lg border border-border">
              {(['market', 'limit'] as OrderExecutionType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold transition-all cursor-pointer ${
                    orderType === t ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCalculator((p) => !p)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                showCalculator
                  ? 'bg-primary text-primary-foreground font-bold'
                  : 'bg-secondary text-primary hover:bg-secondary/80 border border-primary/20'
              }`}
              title="Toggle Risk Size Calculator"
            >
              <Calculator size={11} />
              <span>Risk Calc</span>
            </button>
          </div>

          {/* Pending Price Input */}
          {orderType !== 'market' && (
            <div className="p-2 rounded-lg bg-secondary/50 border border-border space-y-1">
              <label className="text-[10px] text-muted-foreground block font-semibold">
                Pending Limit / Stop Price:
              </label>
              <input
                type="number"
                step={spec.pipSize}
                value={pendingPrice}
                onChange={(e) => setPendingPrice(e.target.value)}
                placeholder={currentPrice.toFixed(spec.digits)}
                className="w-full bg-card text-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {/* Risk Calculator Section */}
          {showCalculator && (
            <div className="p-2.5 rounded-lg bg-secondary/70 border border-primary/40 space-y-2 animate-in fade-in duration-100">
              <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                <span className="flex items-center gap-1">
                  <Shield size={12} className="text-primary" />
                  <span>Risk Position Calculator</span>
                </span>
                <span className="font-mono text-[10px] text-primary">
                  ${pipValuePerLot.toFixed(2)}/pip
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setRiskMode('percent')}
                  className={`py-1 text-[10px] font-semibold rounded transition-colors ${
                    riskMode === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  % of Equity
                </button>
                <button
                  type="button"
                  onClick={() => setRiskMode('cash')}
                  className={`py-1 text-[10px] font-semibold rounded transition-colors ${
                    riskMode === 'cash' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
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

          {/* Lot Size & Quick Presets */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Lot Size / Volume</span>
              <span className="font-mono text-primary">
                ${(pipValuePerLot * size).toFixed(2)}/pip
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
              {LOT_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                    size === s ? 'bg-primary text-primary-foreground font-bold' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* SL / TP Controls */}
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

          {/* Quick Pip Presets */}
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] text-muted-foreground uppercase">SL Presets:</span>
            <div className="flex items-center gap-1">
              {PIP_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSlPips(p)}
                  className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${
                    slPips === p ? 'bg-primary/20 text-primary font-bold' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}p
                </button>
              ))}
            </div>
          </div>

          {/* Risk:Reward Readout */}
          <div className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded bg-secondary/40 border border-border/50">
            <span className="text-muted-foreground">Risk:Reward Ratio</span>
            <span className="text-primary font-bold">1 : {riskReward}</span>
          </div>

          {/* BUY / SELL Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => handleExecute('buy')}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold bg-long/20 text-long border border-long/40 hover:bg-long/30 transition-all active:scale-95 cursor-pointer"
            >
              <TrendingUp size={14} />
              BUY {size}L
            </button>
            <button
              onClick={() => handleExecute('sell')}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold bg-short/20 text-short border border-short/40 hover:bg-short/30 transition-all active:scale-95 cursor-pointer"
            >
              <TrendingDown size={14} />
              SELL {size}L
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Positions & Order Book */}
      {activeTab === 'positions' && (
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {/* Active Positions Header */}
          <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-between bg-secondary/20">
            <span className="font-semibold">Open Positions ({openPositions.length})</span>
            {onCloseAll && openPositions.length > 1 && (
              <button
                onClick={onCloseAll}
                className="normal-case text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              >
                Close all
              </button>
            )}
          </div>

          {openPositions.length === 0 ? (
            <div className="p-5 text-center text-xs text-muted-foreground space-y-1">
              <div>No open positions</div>
              <div className="text-[10px] opacity-70">Execute BUY or SELL orders in the Trade tab</div>
            </div>
          ) : (
            openPositions.map((order) => {
              const isEditing = editingOrderId === order.id;
              const entry = order.fillPrice ?? currentPrice;
              const diff = order.side === 'buy' ? currentPrice - entry : entry - currentPrice;
              const pips = diff / spec.pipSize;
              const uPnl = order.unrealizedPnl ?? (pips * pipValuePerLot * order.size);

              return (
                <div key={order.id} className="p-3 hover:bg-muted/20 group space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${order.side === 'buy' ? 'text-long' : 'text-short'}`}>
                        {order.side === 'buy' ? '▲ BUY' : '▼ SELL'} {order.size}L
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
                      <div className="text-right">
                        <span className={`text-xs font-mono font-bold block ${uPnl >= 0 ? 'text-long' : 'text-short'}`}>
                          {uPnl >= 0 ? '+' : ''}${uPnl.toFixed(2)}
                        </span>
                        <span className={`text-[9px] font-mono ${pips >= 0 ? 'text-long' : 'text-short'}`}>
                          {pips >= 0 ? '+' : ''}{pips.toFixed(1)}p
                        </span>
                      </div>
                      <button
                        onClick={() => onCloseOrder(order.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded cursor-pointer"
                        title="Close full position"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Level numbers */}
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
                    <span>@{entry.toFixed(spec.digits)}</span>
                    <span className="text-short truncate">
                      SL: {order.stopLoss != null ? order.stopLoss.toFixed(spec.digits) : 'None'}
                    </span>
                    <span className="text-long truncate">
                      TP: {order.takeProfit != null ? order.takeProfit.toFixed(spec.digits) : 'None'}
                    </span>
                  </div>

                  {/* Quick Position Action Buttons: BE & 50% Close */}
                  <div className="flex items-center gap-1 pt-1">
                    {onSetBreakEven && (
                      <button
                        onClick={() => onSetBreakEven(order.id)}
                        className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 border border-border text-[9px] font-mono font-semibold text-foreground transition-all cursor-pointer"
                        title="Move Stop Loss to Break-Even (Entry price)"
                      >
                        BE (Break-Even)
                      </button>
                    )}
                    {onPartialClose && order.size > 0.01 && (
                      <button
                        onClick={() => onPartialClose(order.id, 0.5)}
                        className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 border border-border text-[9px] font-mono font-semibold text-foreground transition-all cursor-pointer"
                        title="Close 50% of this position"
                      >
                        50% Close
                      </button>
                    )}
                  </div>

                  {/* Inline Level Adjuster */}
                  {isEditing && (
                    <div className="p-2 rounded bg-card border border-primary/40 space-y-1.5 mt-1 animate-in fade-in duration-100">
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
                            step={spec.pipSize}
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
                            step={spec.pipSize}
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

          {/* Pending Orders Section */}
          {pendingList.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider bg-secondary/20 font-semibold">
                Pending Orders ({pendingList.length})
              </div>
              {pendingList.map((order) => (
                <div key={order.id} className="p-3 hover:bg-muted/20 group space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${order.side === 'buy' ? 'text-long' : 'text-short'}`}>
                      {order.side.toUpperCase()} LIMIT {order.size}L
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
                    <span>@{order.limitPrice != null ? order.limitPrice.toFixed(spec.digits) : '—'}</span>
                    <span className="text-short truncate">
                      SL: {order.stopLoss != null ? order.stopLoss.toFixed(spec.digits) : '—'}
                    </span>
                    <span className="text-long truncate">
                      TP: {order.takeProfit != null ? order.takeProfit.toFixed(spec.digits) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Closed Trade History Section */}
          {closedHistory.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider bg-secondary/20 font-semibold">
                Recent Closed Trades ({closedHistory.length})
              </div>
              {closedHistory.map((trade) => (
                <div key={trade.id} className="p-2.5 hover:bg-muted/10 text-[10px] font-mono flex items-center justify-between">
                  <div>
                    <span className={trade.side === 'buy' ? 'text-long font-bold' : 'text-short font-bold'}>
                      {trade.side.toUpperCase()} {trade.size}L
                    </span>
                    <span className="text-muted-foreground ml-1.5">
                      via {trade.closeReason?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={trade.pnl! >= 0 ? 'text-long font-bold' : 'text-short font-bold'}>
                      {trade.pnl! >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}
                    </span>
                    {trade.pnlPips != null && (
                      <span className="text-muted-foreground ml-1">
                        ({trade.pnlPips >= 0 ? '+' : ''}{trade.pnlPips.toFixed(0)}p)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Historical Economic News Feed */}
      {activeTab === 'news' && (
        <NewsFeed
          tzOffset={tzOffset}
          currentReplayTime={currentReplayTime}
          symbol={symbol}
          onJumpToTime={onSeekTime}
        />
      )}

      {/* Tab 4: Dedicated Per-Session Analytics */}
      {activeTab === 'analytics' && (
        <div className="flex-1 overflow-y-auto">
          {onOffsetChange && (
            <div className="flex justify-end border-b border-border px-3 py-2">
              <TimezoneSelector offset={tzOffset} onOffsetChange={onOffsetChange} />
            </div>
          )}
          <SessionAnalytics
            orders={orders}
            startingBalance={startingBalance}
            symbol={symbol}
            tzOffset={tzOffset}
          />
        </div>
      )}
    </div>
  );
}
