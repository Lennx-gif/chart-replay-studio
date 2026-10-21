import { useState, useMemo, useEffect } from 'react';
import type { Order } from '@/lib/tradeEngine';
import { calculateStats, type TradeStats } from '@/lib/tradeEngine';
import {
  listSessions,
  deleteSession,
  saveSession,
  type BacktestSession,
  type StoredDataset,
} from '@/lib/db/localDatabase';
import type { OHLCVBar } from '@/lib/csvParser';
import { timeframeToLabel } from '@/lib/timeframeEngine';
import {
  X,
  TrendingUp,
  TrendingDown,
  Layers,
  BookOpen,
  Plus,
  Play,
  Trash2,
  Calendar,
  DollarSign,
  Award,
  Activity,
  FileSpreadsheet,
  Download,
  Tag,
  CheckCircle2,
  Clock,
  Percent,
  Sliders,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

interface DashboardModalProps {
  open: boolean;
  onClose: () => void;
  dataset: StoredDataset | null;
  currentBars: OHLCVBar[];
  activeSession: BacktestSession | null;
  orders: Order[];
  currentPrice: number;
  startingBalance: number;
  onSelectSession: (session: BacktestSession) => void;
  onOpenCreateSession: () => void;
  onCloseOrder: (orderId: string) => void;
}

type TabType = 'telemetry' | 'sessions' | 'trades' | 'journal';

export function DashboardModal({
  open,
  onClose,
  dataset,
  currentBars,
  activeSession,
  orders,
  currentPrice,
  startingBalance,
  onSelectSession,
  onOpenCreateSession,
  onCloseOrder,
}: DashboardModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('telemetry');
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Journal entry form
  const [newNote, setNewNote] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('#Breakout');
  const [journalEntries, setJournalEntries] = useState<
    { id: string; timestamp: number; text: string; tag: string; pnl?: number }[]
  >([]);

  // Calculate live stats
  const stats: TradeStats = useMemo(() => {
    return calculateStats(orders, activeSession?.startingBalance || startingBalance);
  }, [orders, activeSession?.startingBalance, startingBalance]);

  const closedOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'closed')
      .sort((a, b) => (b.closeTime || 0) - (a.closeTime || 0));
  }, [orders]);

  const openOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'filled');
  }, [orders]);

  // Load sessions on open
  const loadSavedSessions = async () => {
    setLoadingSessions(true);
    try {
      const list = await listSessions(dataset?.id);
      setSessions(list);
    } catch {
      // Ignored
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadSavedSessions();
      // Load saved journal from session notes if present
      if (activeSession?.notes) {
        try {
          const parsed = JSON.parse(activeSession.notes);
          if (Array.isArray(parsed)) setJournalEntries(parsed);
          else if (typeof activeSession.notes === 'string') {
            setJournalEntries([{ id: '1', timestamp: activeSession.createdAt, text: activeSession.notes, tag: '#General' }]);
          }
        } catch {
          if (activeSession.notes.trim()) {
            setJournalEntries([{ id: '1', timestamp: activeSession.createdAt, text: activeSession.notes, tag: '#General' }]);
          }
        }
      }
    }
  }, [open, activeSession?.id, dataset?.id]);

  if (!open) return null;

  const handleDeleteSession = async (sessId: string, sessName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeSession?.id === sessId) {
      toast.error('Cannot delete the currently active session');
      return;
    }
    try {
      await deleteSession(sessId);
      toast.success(`Deleted session "${sessName}"`);
      loadSavedSessions();
    } catch {
      toast.error('Failed to delete session');
    }
  };

  const handleExportSession = (sess: BacktestSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const json = JSON.stringify(sess, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${sess.symbol}_${sess.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Session exported to JSON');
  };

  const handleAddJournalEntry = async () => {
    if (!newNote.trim()) return;
    const entry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      text: newNote.trim(),
      tag: selectedTag,
    };
    const updated = [entry, ...journalEntries];
    setJournalEntries(updated);
    setNewNote('');

    if (activeSession) {
      const updatedSess = {
        ...activeSession,
        notes: JSON.stringify(updated),
        updatedAt: Date.now(),
      };
      await saveSession(updatedSess);
      toast.success('Journal entry recorded!');
    }
  };

  // Equity Curve SVG calculation
  const renderEquityCurve = () => {
    const curve = stats.equityCurve;
    if (curve.length < 2) {
      return (
        <div className="h-44 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg p-4">
          <Activity size={24} className="mb-1 text-primary/40" />
          <p className="text-xs">No closed trades yet in this session.</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Place trades using the right panel or hotkeys to generate your live equity curve.
          </p>
        </div>
      );
    }

    const minEq = Math.min(...curve.map((c) => c.equity)) * 0.99;
    const maxEq = Math.max(...curve.map((c) => c.equity)) * 1.01;
    const range = maxEq - minEq || 1;

    const width = 600;
    const height = 160;

    const points = curve.map((c, i) => {
      const x = (i / (curve.length - 1)) * (width - 20) + 10;
      const y = height - 15 - ((c.equity - minEq) / range) * (height - 30);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    const areaD = `${pathD} L ${width - 10},${height - 15} L 10,${height - 15} Z`;

    const startEq = activeSession?.startingBalance || startingBalance;
    const isProfitable = stats.totalPnl >= 0;

    return (
      <div className="border border-border/80 rounded-lg p-3 bg-secondary/15">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp size={13} className={isProfitable ? 'text-long' : 'text-short'} />
            Realized Equity Curve
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Start: ${startEq.toLocaleString()} &rarr; Current: ${(startEq + stats.totalPnl).toLocaleString()}
          </div>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={isProfitable ? 'hsl(142, 60%, 45%)' : 'hsl(0, 70%, 55%)'}
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor={isProfitable ? 'hsl(142, 60%, 45%)' : 'hsl(0, 70%, 55%)'}
                stopOpacity="0.0"
              />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill="url(#eqGrad)" />

          {/* Main stroke line */}
          <path
            d={pathD}
            fill="none"
            stroke={isProfitable ? 'hsl(142, 60%, 45%)' : 'hsl(0, 70%, 55%)'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {curve.map((c, i) => {
            const x = (i / (curve.length - 1)) * (width - 20) + 10;
            const y = height - 15 - ((c.equity - minEq) / range) * (height - 30);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                className="fill-foreground stroke-card"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-4xl w-full h-[88vh] flex flex-col overflow-hidden text-foreground animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-card/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
              <Activity size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Studio Dashboard</h2>
                {activeSession && (
                  <span className="text-[11px] font-mono bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold">
                    {activeSession.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Telemetry, session management, trade execution telemetry, and backtest journal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenCreateSession();
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 glow-primary flex items-center gap-1.5 transition-all"
            >
              <Plus size={13} />
              + Create Session
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-border bg-secondary/30">
          {[
            { id: 'telemetry' as const, label: 'Telemetry & Stats', icon: <Activity size={14} /> },
            { id: 'sessions' as const, label: `Sessions (${sessions.length})`, icon: <Layers size={14} /> },
            {
              id: 'trades' as const,
              label: `Trades (${openOrders.length} Open / ${closedOrders.length} Closed)`,
              icon: <TrendingUp size={14} />,
            },
            { id: 'journal' as const, label: `Trade Journal (${journalEntries.length})`, icon: <BookOpen size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-primary text-primary font-bold bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: TELEMETRY & STATS */}
          {activeTab === 'telemetry' && (
            <div className="space-y-6">
              {/* Primary KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Net P&L */}
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="text-[11px] text-muted-foreground uppercase font-semibold">Net P&L</div>
                  <div
                    className={`text-xl font-bold font-mono mt-1 ${
                      stats.totalPnl >= 0 ? 'text-long' : 'text-short'
                    }`}
                  >
                    {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {stats.totalTrades > 0
                      ? `${((stats.totalPnl / (activeSession?.startingBalance || startingBalance)) * 100).toFixed(1)}% Return`
                      : 'No trades closed'}
                  </div>
                </div>

                {/* Win Rate */}
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="text-[11px] text-muted-foreground uppercase font-semibold">Win Rate</div>
                  <div className="text-xl font-bold font-mono mt-1 text-primary">
                    {stats.winRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {stats.wins} Wins / {stats.losses} Losses
                  </div>
                </div>

                {/* Profit Factor */}
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="text-[11px] text-muted-foreground uppercase font-semibold">Profit Factor</div>
                  <div className="text-xl font-bold font-mono mt-1 text-foreground">
                    {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Gross Win: +${stats.grossWin.toFixed(0)} | Loss: -${stats.grossLoss.toFixed(0)}
                  </div>
                </div>

                {/* Max Drawdown */}
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="text-[11px] text-muted-foreground uppercase font-semibold">Max Drawdown</div>
                  <div className="text-xl font-bold font-mono mt-1 text-short">
                    {stats.maxDrawdownPercent.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Peak Drop: -${stats.maxDrawdown.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded border border-border bg-card/60">
                  <span className="text-muted-foreground block text-[10px]">AVG WIN</span>
                  <span className="font-bold text-long">+${stats.avgWin.toFixed(2)}</span>
                </div>
                <div className="p-2.5 rounded border border-border bg-card/60">
                  <span className="text-muted-foreground block text-[10px]">AVG LOSS</span>
                  <span className="font-bold text-short">-${stats.avgLoss.toFixed(2)}</span>
                </div>
                <div className="p-2.5 rounded border border-border bg-card/60">
                  <span className="text-muted-foreground block text-[10px]">BEST TRADE</span>
                  <span className="font-bold text-long">+${stats.bestTrade.toFixed(2)}</span>
                </div>
                <div className="p-2.5 rounded border border-border bg-card/60">
                  <span className="text-muted-foreground block text-[10px]">WORST TRADE</span>
                  <span className="font-bold text-short">${stats.worstTrade.toFixed(2)}</span>
                </div>
              </div>

              {/* Visual Equity Curve */}
              {renderEquityCurve()}
            </div>
          )}

          {/* TAB 2: SESSIONS & DATA TIMES */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Saved Backtest Sessions</h3>
                  <p className="text-xs text-muted-foreground">
                    Switch between active sessions or launch a new custom Data Times window
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenCreateSession();
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 glow-primary flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  New Backtesting Session
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-lg">
                  <Layers size={32} className="mx-auto mb-2 text-primary/40" />
                  <p className="text-sm font-semibold">No saved sessions yet</p>
                  <p className="text-xs mt-1">
                    Click &ldquo;New Backtesting Session&rdquo; above to isolate specific years, months, or blind test windows!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sessions.map((sess) => {
                    const isActive = activeSession?.id === sess.id;
                    const orderCount = sess.orders?.length || 0;
                    const dateFilter = sess.dateFilter;

                    return (
                      <div
                        key={sess.id}
                        className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
                          isActive
                            ? 'bg-primary/10 border-primary/50 shadow-md ring-1 ring-primary/40'
                            : 'bg-card border-border hover:border-primary/30 hover:bg-secondary/30'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-foreground">{sess.name}</h4>
                                {isActive && (
                                  <span className="text-[10px] font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded">
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-muted-foreground">
                                <span>{sess.symbol}</span>
                                <span>•</span>
                                <span>{timeframeToLabel(sess.timeframe || 60)}</span>
                                <span>•</span>
                                <span>Lev: 1:{sess.leverage || 30}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => handleExportSession(sess, e)}
                                title="Export session JSON"
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                              >
                                <Download size={13} />
                              </button>
                              {!isActive && (
                                <button
                                  onClick={(e) => handleDeleteSession(sess.id, sess.name, e)}
                                  title="Delete session"
                                  className="p-1 rounded text-muted-foreground hover:text-short hover:bg-secondary"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Data Times Badge */}
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground mb-3 bg-secondary/50 px-2 py-1 rounded">
                            <Calendar size={12} className="text-primary" />
                            <span>Data Times:</span>
                            <span className="text-foreground font-semibold">
                              {dateFilter.mode === 'all' && 'All Historical Data'}
                              {dateFilter.mode === 'years' && `Years: ${dateFilter.startYear || ''} - ${dateFilter.endYear || ''}`}
                              {dateFilter.mode === 'months' && 'Specific Months'}
                              {dateFilter.mode === 'custom' && 'Custom Date Range'}
                              {dateFilter.mode === 'blind' && `Blind Window (${dateFilter.blindWindowDays || 60}d)`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                            <span>Balance: ${sess.startingBalance?.toLocaleString()}</span>
                            <span>Trades: {orderCount}</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-border/60 flex justify-end">
                          {isActive ? (
                            <span className="text-xs text-primary font-semibold flex items-center gap-1">
                              <CheckCircle2 size={13} /> Current Active Session
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                onSelectSession(sess);
                                onClose();
                                toast.success(`Switched to session "${sess.name}"`);
                              }}
                              className="px-3 py-1 text-xs font-semibold rounded bg-secondary hover:bg-primary hover:text-primary-foreground border border-border transition-all flex items-center gap-1.5"
                            >
                              <Play size={12} />
                              Switch to Session
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TRADES & LIVE POSITIONS */}
          {activeTab === 'trades' && (
            <div className="space-y-6">
              {/* Open Positions */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-long animate-pulse" />
                  Active Open Positions ({openOrders.length})
                </h3>
                {openOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-secondary/20 p-3 rounded-lg border border-border">
                    No positions currently open. Place a market or limit order via the Trade Panel.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-secondary/60 text-muted-foreground border-b border-border text-[11px]">
                        <tr>
                          <th className="px-3 py-2 text-left">Side</th>
                          <th className="px-3 py-2 text-left">Size</th>
                          <th className="px-3 py-2 text-left">Entry Price</th>
                          <th className="px-3 py-2 text-left">Current Price</th>
                          <th className="px-3 py-2 text-left">Stop Loss</th>
                          <th className="px-3 py-2 text-left">Take Profit</th>
                          <th className="px-3 py-2 text-right">Unrealized P&L</th>
                          <th className="px-3 py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openOrders.map((o) => {
                          const currentPnl =
                            o.side === 'buy'
                              ? (currentPrice - (o.fillPrice || o.entryPrice)) * o.size
                              : ((o.fillPrice || o.entryPrice) - currentPrice) * o.size;

                          return (
                            <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/30">
                              <td className="px-3 py-2 font-bold">
                                <span className={o.side === 'buy' ? 'text-long' : 'text-short'}>
                                  {o.side.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-3 py-2">{o.size} lots</td>
                              <td className="px-3 py-2">{(o.fillPrice || o.entryPrice).toFixed(4)}</td>
                              <td className="px-3 py-2">{currentPrice.toFixed(4)}</td>
                              <td className="px-3 py-2 text-short">{o.stopLoss?.toFixed(4) || '—'}</td>
                              <td className="px-3 py-2 text-long">{o.takeProfit?.toFixed(4) || '—'}</td>
                              <td className="px-3 py-2 text-right font-bold">
                                <span className={currentPnl >= 0 ? 'text-long' : 'text-short'}>
                                  {currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => onCloseOrder(o.id)}
                                  className="px-2 py-0.5 text-[10px] rounded bg-secondary hover:bg-short/20 hover:text-short border border-border"
                                >
                                  Close
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Closed Trades History */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-2">
                  Closed Trade History ({closedOrders.length})
                </h3>
                {closedOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground bg-secondary/20 p-3 rounded-lg border border-border">
                    No closed trades recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-border rounded-lg max-h-72">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-secondary/60 text-muted-foreground border-b border-border text-[11px] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Side</th>
                          <th className="px-3 py-2 text-left">Entry Price</th>
                          <th className="px-3 py-2 text-left">Exit Price</th>
                          <th className="px-3 py-2 text-left">Exit Reason</th>
                          <th className="px-3 py-2 text-right">P&L ($)</th>
                          <th className="px-3 py-2 text-right">Pips</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closedOrders.map((o) => (
                          <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="px-3 py-2 font-bold">
                              <span className={o.side === 'buy' ? 'text-long' : 'text-short'}>
                                {o.side.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2">{(o.fillPrice || o.entryPrice).toFixed(4)}</td>
                            <td className="px-3 py-2">{o.closePrice?.toFixed(4) || '—'}</td>
                            <td className="px-3 py-2 uppercase text-[10px]">
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  o.closeReason === 'tp'
                                    ? 'bg-long/20 text-long'
                                    : o.closeReason === 'sl'
                                    ? 'bg-short/20 text-short'
                                    : 'bg-secondary text-muted-foreground'
                                }`}
                              >
                                {o.closeReason || 'MANUAL'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold">
                              <span className={(o.pnl || 0) >= 0 ? 'text-long' : 'text-short'}>
                                {(o.pnl || 0) >= 0 ? '+' : ''}${(o.pnl || 0).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {(o.pnlPips || 0) >= 0 ? '+' : ''}{(o.pnlPips || 0).toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TRADING JOURNAL */}
          {activeTab === 'journal' && (
            <div className="space-y-6">
              {/* Add Note Section */}
              <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <BookOpen size={13} className="text-primary" />
                    New Journal Entry / Trade Reflection
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[
                      '#Breakout',
                      '#Retest',
                      '#TrendFollowing',
                      '#SupportResistance',
                      '#Disciplined',
                      '#FOMO',
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTag(tag)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                          selectedTag === tag
                            ? 'bg-primary/20 text-primary border-primary font-bold'
                            : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Record your market observations, entry reasons, emotions, and lessons learned on this replay bar..."
                  rows={3}
                  className="w-full bg-secondary text-foreground border border-border rounded-lg p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <div className="flex justify-end">
                  <button
                    onClick={handleAddJournalEntry}
                    disabled={!newNote.trim()}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 glow-primary disabled:opacity-40 transition-all"
                  >
                    Save Reflection
                  </button>
                </div>
              </div>

              {/* Journal Entries List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Session Log & Notes ({journalEntries.length})
                </h4>

                {journalEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
                    No journal reflections yet for this backtesting session.
                  </p>
                ) : (
                  journalEntries.map((j) => (
                    <div key={j.id} className="p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5 font-mono">
                        <span className="text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                          {j.tag}
                        </span>
                        <span>{new Date(j.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{j.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
