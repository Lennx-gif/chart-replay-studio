import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Layers,
  ShieldCheck,
  BarChart3,
  Globe2,
  Clock,
  Download,
  RotateCcw,
  SlidersHorizontal,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Layers2,
  DollarSign,
  Activity,
  Award,
  Zap,
} from 'lucide-react';
import type { SessionRecord } from '@/lib/db';
import { calculateSessionAnalytics, type Order } from '@/lib/tradeEngine';
import { exportCsvFile } from '@/services/nativeDialogs';

interface EnrichedTrade extends Order {
  sessionId: string;
  sessionName: string;
  sessionSymbol: string;
}

interface DashboardAnalyticsProps {
  sessions: SessionRecord[];
  defaultStartingBalance?: number;
  onOpenSession?: (sessionId: string) => void;
}

type TimeRangeFilter = 'all' | '7d' | '30d' | '90d' | 'year' | 'custom';
type SideFilter = 'all' | 'buy' | 'sell';
type OutcomeFilter = 'all' | 'win' | 'loss' | 'breakeven';

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '< 1m';
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatTradeTime(unix?: number): string {
  if (!unix || unix <= 0) return '—';
  const d = new Date(unix * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

export function DashboardAnalytics({
  sessions,
  defaultStartingBalance = 10000,
  onOpenSession,
}: DashboardAnalyticsProps) {
  // Filters State
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('all');
  const [selectedSide, setSelectedSide] = useState<SideFilter>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeFilter>('all');

  // Interactive UI State
  const [hoveredTradeIdx, setHoveredTradeIdx] = useState<number | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  // 1. Gather all closed trades across all sessions
  const allClosedTrades: EnrichedTrade[] = useMemo(() => {
    const list: EnrichedTrade[] = [];
    sessions.forEach((s) => {
      (s.orders || []).forEach((o) => {
        if (o.status === 'closed' && o.pnl != null) {
          list.push({
            ...o,
            sessionId: s.id,
            sessionName: s.name || s.symbol,
            sessionSymbol: s.symbol,
          });
        }
      });
    });
    return list;
  }, [sessions]);

  // Extract unique symbols for filtering
  const availableSymbols = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.symbol) set.add(s.symbol.toUpperCase());
    });
    allClosedTrades.forEach((t) => {
      if (t.sessionSymbol) set.add(t.sessionSymbol.toUpperCase());
    });
    return Array.from(set).sort();
  }, [sessions, allClosedTrades]);

  // 2. Filter trades
  const filteredTrades = useMemo(() => {
    let list = allClosedTrades;

    // Filter by Session
    if (selectedSessionId !== 'all') {
      list = list.filter((t) => t.sessionId === selectedSessionId);
    }

    // Filter by Symbol
    if (selectedSymbol !== 'all') {
      list = list.filter((t) => t.sessionSymbol.toUpperCase() === selectedSymbol.toUpperCase());
    }

    // Filter by Side
    if (selectedSide !== 'all') {
      list = list.filter((t) => t.side === selectedSide);
    }

    // Filter by Outcome
    if (selectedOutcome === 'win') {
      list = list.filter((t) => (t.pnl ?? 0) > 0.0001);
    } else if (selectedOutcome === 'loss') {
      list = list.filter((t) => (t.pnl ?? 0) < -0.0001);
    } else if (selectedOutcome === 'breakeven') {
      list = list.filter((t) => Math.abs(t.pnl ?? 0) <= 0.0001);
    }

    // Filter by Time Range
    if (timeRange !== 'all') {
      if (timeRange === 'custom') {
        const fromUnix = customStartDate ? new Date(customStartDate).getTime() / 1000 : 0;
        const toUnix = customEndDate ? new Date(customEndDate).getTime() / 1000 + 86400 : Infinity;
        list = list.filter((t) => {
          const tTime = t.closeTime ?? t.fillTime ?? t.createdTime ?? 0;
          return tTime >= fromUnix && tTime <= toUnix;
        });
      } else {
        const latestTime = Math.max(...allClosedTrades.map((t) => t.closeTime ?? t.fillTime ?? 0), 0);
        const refTime = latestTime > 0 ? latestTime : Date.now() / 1000;
        let windowSec = 7 * 86400;
        if (timeRange === '30d') windowSec = 30 * 86400;
        else if (timeRange === '90d') windowSec = 90 * 86400;
        else if (timeRange === 'year') windowSec = 365 * 86400;

        const cutoff = refTime - windowSec;
        list = list.filter((t) => (t.closeTime ?? t.fillTime ?? t.createdTime ?? 0) >= cutoff);
      }
    }

    return list;
  }, [
    allClosedTrades,
    selectedSessionId,
    selectedSymbol,
    selectedSide,
    selectedOutcome,
    timeRange,
    customStartDate,
    customEndDate,
  ]);

  // Determine starting balance for calculation
  const activeStartingBalance = useMemo(() => {
    if (selectedSessionId !== 'all') {
      const s = sessions.find((x) => x.id === selectedSessionId);
      if (s && s.startingBalance) return s.startingBalance;
    }
    return defaultStartingBalance;
  }, [selectedSessionId, sessions, defaultStartingBalance]);

  // Compute primary session analytics
  const analytics = useMemo(() => {
    return calculateSessionAnalytics(filteredTrades, activeStartingBalance, 0);
  }, [filteredTrades, activeStartingBalance]);

  // Secondary metrics (streaks, volume, holding times, long/short ratios)
  const tacticalStats = useMemo(() => {
    let maxConsecWins = 0;
    let currConsecWins = 0;
    let maxConsecLosses = 0;
    let currConsecLosses = 0;
    let totalLots = 0;
    let totalDurationSec = 0;
    let durationCount = 0;

    let longsCount = 0;
    let longsWins = 0;
    let shortsCount = 0;
    let shortsWins = 0;

    let bestTrade: EnrichedTrade | null = null;
    let worstTrade: EnrichedTrade | null = null;

    const sorted = [...filteredTrades].sort(
      (a, b) => (a.closeTime ?? a.fillTime ?? 0) - (b.closeTime ?? b.fillTime ?? 0)
    );

    sorted.forEach((t) => {
      const pnl = t.pnl ?? 0;
      totalLots += t.size ?? 0;

      if (t.fillTime && t.closeTime && t.closeTime > t.fillTime) {
        totalDurationSec += t.closeTime - t.fillTime;
        durationCount++;
      }

      if (t.side === 'buy') {
        longsCount++;
        if (pnl > 0.0001) longsWins++;
      } else if (t.side === 'sell') {
        shortsCount++;
        if (pnl > 0.0001) shortsWins++;
      }

      if (pnl > 0.0001) {
        currConsecWins++;
        currConsecLosses = 0;
        if (currConsecWins > maxConsecWins) maxConsecWins = currConsecWins;
      } else if (pnl < -0.0001) {
        currConsecLosses++;
        currConsecWins = 0;
        if (currConsecLosses > maxConsecLosses) maxConsecLosses = currConsecLosses;
      } else {
        currConsecWins = 0;
        currConsecLosses = 0;
      }

      if (!bestTrade || pnl > (bestTrade.pnl ?? 0)) bestTrade = t;
      if (!worstTrade || pnl < (worstTrade.pnl ?? 0)) worstTrade = t;
    });

    return {
      maxConsecWins,
      maxConsecLosses,
      totalLots,
      avgDurationSec: durationCount > 0 ? totalDurationSec / durationCount : 0,
      longsCount,
      longsWinRate: longsCount > 0 ? (longsWins / longsCount) * 100 : 0,
      shortsCount,
      shortsWinRate: shortsCount > 0 ? (shortsWins / shortsCount) * 100 : 0,
      bestTrade,
      worstTrade,
    };
  }, [filteredTrades]);

  // Reset all filters to defaults
  const handleResetFilters = () => {
    setSelectedSessionId('all');
    setTimeRange('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedSymbol('all');
    setSelectedSide('all');
    setSelectedOutcome('all');
  };

  const isFiltersDirty =
    selectedSessionId !== 'all' ||
    timeRange !== 'all' ||
    selectedSymbol !== 'all' ||
    selectedSide !== 'all' ||
    selectedOutcome !== 'all' ||
    customStartDate !== '' ||
    customEndDate !== '';

  // Export filtered trades to CSV
  const handleExportCSV = async () => {
    if (filteredTrades.length === 0) return;
    const headers = [
      'Trade Index',
      'Session',
      'Symbol',
      'Side',
      'Lots',
      'Fill Price',
      'Close Price',
      'Fill Time',
      'Close Time',
      'Duration (sec)',
      'P&L ($)',
      'P&L (Pips)',
      'Outcome',
    ];

    const rows = filteredTrades.map((t, i) => [
      i + 1,
      `"${t.sessionName.replace(/"/g, '""')}"`,
      t.sessionSymbol,
      t.side.toUpperCase(),
      t.size,
      t.fillPrice ?? '',
      t.closePrice ?? '',
      t.fillTime ? new Date(t.fillTime * 1000).toISOString() : '',
      t.closeTime ? new Date(t.closeTime * 1000).toISOString() : '',
      t.fillTime && t.closeTime ? Math.max(0, t.closeTime - t.fillTime) : 0,
      (t.pnl ?? 0).toFixed(2),
      (t.pnlPips ?? 0).toFixed(1),
      (t.pnl ?? 0) > 0.0001 ? 'WIN' : (t.pnl ?? 0) < -0.0001 ? 'LOSS' : 'BREAKEVEN',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const filename = `chart-replay-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    await exportCsvFile(filename, csvContent);
  };

  // Sorted trades for execution log
  const displayedTrades = useMemo(() => {
    const list = [...filteredTrades];
    list.sort((a, b) => {
      const timeA = a.closeTime ?? a.fillTime ?? a.createdTime ?? 0;
      const timeB = b.closeTime ?? b.fillTime ?? b.createdTime ?? 0;
      return sortNewestFirst ? timeB - timeA : timeA - timeB;
    });
    return list;
  }, [filteredTrades, sortNewestFirst]);

  // Equity Curve geometry
  const equityPoints = analytics.equityCurve;
  const equities = equityPoints.map((p) => p.equity);
  const minEquity = Math.min(...equities, activeStartingBalance * 0.98);
  const maxEquity = Math.max(...equities, activeStartingBalance * 1.02);
  const equityRange = Math.max(1, maxEquity - minEquity);

  const svgW = 760;
  const svgH = 180;
  const padX = 20;
  const padY = 20;

  const pointsString = equityPoints
    .map((pt, i) => {
      const x = padX + (i / Math.max(1, equityPoints.length - 1)) * (svgW - padX * 2);
      const y = svgH - padY - ((pt.equity - minEquity) / equityRange) * (svgH - padY * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const isNetPositive = analytics.netPnl >= 0;
  const strokeColor = isNetPositive ? '#10b981' : '#f43f5e';
  const fillColor = isNetPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
  const areaPolygon = `${padX},${svgH - padY} ${pointsString} ${svgW - padX},${svgH - padY}`;

  // Max trade count across 24h
  const maxHourCount = Math.max(1, ...analytics.hourlyStats.map((h) => h.count));

  // If there are no closed trades in the system at all:
  if (allClosedTrades.length === 0) {
    return (
      <div className="panel p-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
          <BarChart3 size={32} />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-foreground">No Closed Trades Recorded Yet</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Analytics metrics are sourced in real time from your replay sessions. Open any session, place orders, and
            close them during playback to unlock institutional edge telemetry, Forex killzones, 24-hour distribution, and
            equity curves.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={() => {
              if (sessions.length > 0 && onOpenSession) {
                onOpenSession(sessions[0].id);
              }
            }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-md shadow-primary/20"
          >
            <Activity size={14} />
            <span>{sessions.length > 0 ? 'Resume Backtest Session' : 'Create Session in Sessions Tab'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Filter Bar & Scope Controls */}
      <div className="panel p-4 space-y-3.5 bg-gradient-to-r from-card via-card to-secondary/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Analytics Filtering & Scope</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {filteredTrades.length} of {allClosedTrades.length} Trades Active
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isFiltersDirty && (
              <button
                onClick={handleResetFilters}
                className="toolbar-btn text-xs gap-1 text-primary hover:text-primary-foreground hover:bg-primary"
                title="Reset all filters to default"
              >
                <RotateCcw size={12} /> Reset Filters
              </button>
            )}
            <button
              onClick={handleExportCSV}
              disabled={filteredTrades.length === 0}
              className="toolbar-btn text-xs gap-1.5 disabled:opacity-40"
              title="Download active filtered trade log as CSV"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Filter: Session */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Layers2 size={11} className="text-primary" />
              <span>Session Scope</span>
            </label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Sessions (General Analytics)</option>
              {sessions.map((s) => {
                const count = (s.orders || []).filter((o) => o.status === 'closed' && o.pnl != null).length;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name || s.symbol} ({s.symbol}) — {count} trades
                  </option>
                );
              })}
            </select>
          </div>

          {/* Filter: Timeframe */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar size={11} className="text-primary" />
              <span>Timeframe</span>
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeFilter)}
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Time (Default)</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="year">This Year / 365 Days</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Filter: Symbol */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Activity size={11} className="text-primary" />
              <span>Instrument / Symbol</span>
            </label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Symbols ({availableSymbols.length})</option>
              {availableSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

          {/* Filter: Direction & Outcome */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Side</label>
              <select
                value={selectedSide}
                onChange={(e) => setSelectedSide(e.target.value as SideFilter)}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="all">All Sides</option>
                <option value="buy">Longs</option>
                <option value="sell">Shorts</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outcome</label>
              <select
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(e.target.value as OutcomeFilter)}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="all">All</option>
                <option value="win">Wins</option>
                <option value="loss">Losses</option>
                <option value="breakeven">Break-even</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom Date Pickers when 'custom' selected */}
        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/50 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-secondary text-foreground border border-border rounded px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-secondary text-foreground border border-border rounded px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* No matching trades after filter */}
      {filteredTrades.length === 0 ? (
        <div className="panel p-8 text-center space-y-3">
          <Filter size={24} className="text-muted-foreground mx-auto opacity-50" />
          <div className="text-sm font-semibold text-foreground">No Trades Match Filter Criteria</div>
          <div className="text-xs text-muted-foreground">
            Try adjusting your timeframe, session, symbol, or trade outcome filters to view performance metrics.
          </div>
          <div>
            <button onClick={handleResetFilters} className="toolbar-btn text-xs gap-1.5 mt-2">
              <RotateCcw size={12} /> Reset All Filters
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 2. General Analytics KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* KPI 1: Net Realized P&L */}
            <div className="panel p-3.5 space-y-1 bg-card">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Net Realized P&L</span>
                {isNetPositive ? (
                  <TrendingUp size={13} className="text-emerald-500" />
                ) : (
                  <TrendingDown size={13} className="text-rose-500" />
                )}
              </div>
              <div className={`text-xl font-bold font-mono ${isNetPositive ? 'text-long' : 'text-short'}`}>
                {analytics.netPnl >= 0 ? '+' : ''}${analytics.netPnl.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                <span className={analytics.netReturnPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                  {analytics.netReturnPct >= 0 ? '+' : ''}{analytics.netReturnPct.toFixed(1)}%
                </span>{' '}
                return
              </div>
            </div>

            {/* KPI 2: Win Rate */}
            <div className="panel p-3.5 space-y-1 bg-card">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Win Rate</span>
                <Target size={13} className="text-primary" />
              </div>
              <div className={`text-xl font-bold font-mono ${analytics.winRate >= 50 ? 'text-long' : 'text-short'}`}>
                {analytics.winRate.toFixed(1)}%
              </div>
              <div className="text-[10px] font-mono text-muted-foreground truncate">
                {analytics.wins}W · {analytics.losses}L · {analytics.breakEvens}BE
              </div>
            </div>

            {/* KPI 3: Profit Factor */}
            <div className="panel p-3.5 space-y-1 bg-card">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Profit Factor</span>
                <Layers size={13} className="text-amber-500" />
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : '∞'}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Avg W/L {analytics.winLossRatio.toFixed(2)}
              </div>
            </div>

            {/* KPI 4: Max Drawdown */}
            <div className="panel p-3.5 space-y-1 bg-card">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Max Drawdown</span>
                <ShieldCheck size={13} className="text-rose-400" />
              </div>
              <div className="text-xl font-bold font-mono text-rose-400">
                -${analytics.maxDrawdown.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                -{analytics.maxDrawdownPct.toFixed(1)}% peak drop
              </div>
            </div>

            {/* KPI 5: Expectancy */}
            <div className="panel p-3.5 space-y-1 bg-card">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Expectancy</span>
                <Zap size={13} className="text-primary" />
              </div>
              <div
                className={`text-xl font-bold font-mono ${
                  analytics.expectancy >= 0 ? 'text-primary' : 'text-rose-400'
                }`}
              >
                {analytics.expectancy >= 0 ? '+' : ''}${analytics.expectancy.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {analytics.expectancyR >= 0 ? '+' : ''}{analytics.expectancyR.toFixed(2)}R per trade
              </div>
            </div>

            {/* KPI 6: Average Win / Loss */}
            <div className="panel p-3.5 space-y-1 bg-card">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Avg Win / Loss</span>
                <DollarSign size={13} className="text-muted-foreground" />
              </div>
              <div className="text-sm font-bold font-mono mt-1 space-y-0.5">
                <div className="text-emerald-400">+${analytics.avgWin.toFixed(2)}</div>
                <div className="text-rose-400">-${analytics.avgLoss.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* 3. Secondary Tactical Edge Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 p-3 rounded-xl bg-secondary/30 border border-border text-[11px] font-mono">
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Total Volume</span>
              <span className="text-foreground font-semibold">{tacticalStats.totalLots.toFixed(2)} Lots</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Avg Duration</span>
              <span className="text-foreground font-semibold">{formatDuration(tacticalStats.avgDurationSec)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Longs Win Rate</span>
              <span className="text-emerald-400 font-semibold">
                {tacticalStats.longsWinRate.toFixed(0)}% ({tacticalStats.longsCount})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Shorts Win Rate</span>
              <span className="text-rose-400 font-semibold">
                {tacticalStats.shortsWinRate.toFixed(0)}% ({tacticalStats.shortsCount})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Max Win Streak</span>
              <span className="text-emerald-400 font-semibold">{tacticalStats.maxConsecWins} in a row</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Max Loss Streak</span>
              <span className="text-rose-400 font-semibold">{tacticalStats.maxConsecLosses} in a row</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Best Trade</span>
              <span className="text-emerald-400 font-semibold">
                {tacticalStats.bestTrade ? `+$${(tacticalStats.bestTrade.pnl ?? 0).toFixed(2)}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Worst Trade</span>
              <span className="text-rose-400 font-semibold">
                {tacticalStats.worstTrade ? `-$${Math.abs(tacticalStats.worstTrade.pnl ?? 0).toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          {/* 4. Portfolio Cumulative Equity Curve */}
          <div className="panel p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">Cumulative Portfolio Equity Curve</h3>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                <span>Start: ${activeStartingBalance.toFixed(2)}</span>
                <span>·</span>
                <span className={analytics.netPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  Current: ${(activeStartingBalance + analytics.netPnl).toFixed(2)}
                </span>
                <span>·</span>
                <span>{equityPoints.length - 1} Closed Executions</span>
              </div>
            </div>

            <div className="relative w-full h-[180px] bg-secondary/20 rounded-xl overflow-hidden border border-border/60">
              <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full" preserveAspectRatio="none">
                {/* Horizontal Baseline Starting Balance */}
                <line
                  x1={padX}
                  y1={svgH - padY - ((activeStartingBalance - minEquity) / equityRange) * (svgH - padY * 2)}
                  x2={svgW - padX}
                  y2={svgH - padY - ((activeStartingBalance - minEquity) / equityRange) * (svgH - padY * 2)}
                  stroke="#52525b"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />

                {/* Shaded Area Polygon */}
                <polygon points={areaPolygon} fill={fillColor} />

                {/* Equity Curve Polyline */}
                <polyline
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pointsString}
                />

                {/* Trade Markers */}
                {equityPoints.map((pt, i) => {
                  const cx = padX + (i / Math.max(1, equityPoints.length - 1)) * (svgW - padX * 2);
                  const cy = svgH - padY - ((pt.equity - minEquity) / equityRange) * (svgH - padY * 2);
                  const isHovered = hoveredTradeIdx === i;
                  return (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5.5 : 2.5}
                      fill={isHovered ? '#ffffff' : strokeColor}
                      className="cursor-pointer transition-all duration-100"
                      onMouseEnter={() => setHoveredTradeIdx(i)}
                      onMouseLeave={() => setHoveredTradeIdx(null)}
                    />
                  );
                })}
              </svg>

              {/* Floating Tooltip readout on point hover */}
              {hoveredTradeIdx !== null && equityPoints[hoveredTradeIdx] && (
                <div className="absolute top-3 right-3 bg-black/95 border border-primary/40 rounded-lg p-2.5 text-xs font-mono shadow-xl text-right z-10 pointer-events-none space-y-1">
                  <div className="text-white font-bold">
                    Execution #{hoveredTradeIdx}: ${equityPoints[hoveredTradeIdx].equity.toFixed(2)}
                  </div>
                  {hoveredTradeIdx > 0 && (
                    <div
                      className={equityPoints[hoveredTradeIdx].pnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}
                    >
                      P&L: {equityPoints[hoveredTradeIdx].pnl >= 0 ? '+' : ''}${equityPoints[hoveredTradeIdx].pnl.toFixed(2)}
                    </div>
                  )}
                  {equityPoints[hoveredTradeIdx].time > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatTradeTime(equityPoints[hoveredTradeIdx].time)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 5. Timing, Session Killzones & Intraday Edge (3 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Column 1: Forex Session Killzones */}
            <div className="panel p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                  <Globe2 size={14} className="text-primary" />
                  <span>Forex Killzone Breakdown</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">UTC Hours</span>
              </div>

              <div className="space-y-2">
                {analytics.sessionStats.map((sess) => (
                  <div
                    key={sess.session}
                    className="p-2.5 rounded-lg bg-secondary/30 border border-border/70 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground">{sess.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{sess.timeRange}</div>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className={sess.pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {sess.count > 0 ? `${sess.pnl >= 0 ? '+' : ''}$${sess.pnl.toFixed(2)}` : '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {sess.count} trades · {sess.count > 0 ? `${sess.winRate.toFixed(0)}% WR` : 'No trades'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: 24-Hour Entry Distribution */}
            <div className="panel p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                  <Clock size={14} className="text-primary" />
                  <span>24-Hour Entry Distribution</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">UTC Intraday</span>
              </div>

              <div className="space-y-1">
                <div className="h-28 flex items-end gap-1 pt-3 pb-1">
                  {analytics.hourlyStats.map((h) => {
                    const heightPct = (h.count / maxHourCount) * 100;
                    const isProfitable = h.pnl > 0.0001;
                    const isLosing = h.pnl < -0.0001;
                    const barColor =
                      h.count === 0
                        ? 'bg-secondary/40'
                        : isProfitable
                        ? 'bg-emerald-500 hover:bg-emerald-400'
                        : isLosing
                        ? 'bg-rose-500 hover:bg-rose-400'
                        : 'bg-amber-500 hover:bg-amber-400';

                    return (
                      <div
                        key={h.hour}
                        className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                        onMouseEnter={() => setHoveredHour(h.hour)}
                        onMouseLeave={() => setHoveredHour(null)}
                      >
                        <div
                          className={`w-full rounded-t transition-all ${barColor}`}
                          style={{ height: `${Math.max(4, heightPct)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5">
                  <span>00h</span>
                  <span>06h</span>
                  <span>12h</span>
                  <span>18h</span>
                  <span>23h</span>
                </div>

                {hoveredHour !== null && analytics.hourlyStats[hoveredHour] && (
                  <div className="mt-2 p-2 rounded bg-secondary/50 border border-border text-[10px] font-mono flex items-center justify-between">
                    <span className="font-bold text-foreground">Hour {analytics.hourlyStats[hoveredHour].label}</span>
                    <span>{analytics.hourlyStats[hoveredHour].count} trades</span>
                    <span
                      className={
                        analytics.hourlyStats[hoveredHour].pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                      }
                    >
                      {analytics.hourlyStats[hoveredHour].pnl >= 0 ? '+' : ''}${analytics.hourlyStats[hoveredHour].pnl.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Day-of-Week Edge */}
            <div className="panel p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                  <Calendar size={14} className="text-primary" />
                  <span>Weekday Performance Edge</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">Mon - Fri</span>
              </div>

              <div className="space-y-1.5">
                {analytics.weekdayStats.map((d) => (
                  <div
                    key={d.day}
                    className="p-2 rounded-lg bg-secondary/30 border border-border/70 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground w-8">{d.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {d.count} trade{d.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={d.pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {d.count > 0 ? `${d.pnl >= 0 ? '+' : ''}$${d.pnl.toFixed(2)}` : '—'}
                      </span>
                      {d.count > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-2">
                          ({d.winRate.toFixed(0)}% WR)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Filtered Trades Execution Log Table */}
          <div className="panel p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <BarChart3 size={15} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Filtered Execution Log ({displayedTrades.length} Trades)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortNewestFirst((p) => !p)}
                  className="toolbar-btn text-[11px] gap-1 font-mono"
                >
                  Sort: {sortNewestFirst ? 'Newest First' : 'Oldest First'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase text-muted-foreground tracking-wider">
                    <th className="py-2 px-2.5">#</th>
                    <th className="py-2 px-2.5">Session / Symbol</th>
                    <th className="py-2 px-2.5">Side</th>
                    <th className="py-2 px-2.5">Lots</th>
                    <th className="py-2 px-2.5">Fill Price</th>
                    <th className="py-2 px-2.5">Exit Price</th>
                    <th className="py-2 px-2.5">Execution Time</th>
                    <th className="py-2 px-2.5">Duration</th>
                    <th className="py-2 px-2.5 text-right">P&L ($)</th>
                    <th className="py-2 px-2.5 text-right">Pips</th>
                    <th className="py-2 px-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayedTrades.map((t, i) => {
                    const isWin = (t.pnl ?? 0) > 0.0001;
                    const isLoss = (t.pnl ?? 0) < -0.0001;
                    const durationSec = t.fillTime && t.closeTime ? Math.max(0, t.closeTime - t.fillTime) : 0;

                    return (
                      <tr key={`${t.id}-${i}`} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-2.5 px-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 px-2.5">
                          <div className="font-bold text-foreground truncate max-w-[140px]">{t.sessionName}</div>
                          <div className="text-[10px] text-primary">{t.sessionSymbol}</div>
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              t.side === 'buy'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {t.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 text-foreground">{t.size}</td>
                        <td className="py-2.5 px-2.5 text-muted-foreground">{t.fillPrice?.toFixed(5) ?? '—'}</td>
                        <td className="py-2.5 px-2.5 text-muted-foreground">{t.closePrice?.toFixed(5) ?? '—'}</td>
                        <td className="py-2.5 px-2.5 text-muted-foreground text-[10px]">
                          {formatTradeTime(t.closeTime ?? t.fillTime)}
                        </td>
                        <td className="py-2.5 px-2.5 text-muted-foreground text-[10px]">
                          {formatDuration(durationSec)}
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-right font-bold ${
                            isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-muted-foreground'
                          }`}
                        >
                          {(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-right ${
                            isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-muted-foreground'
                          }`}
                        >
                          {(t.pnlPips ?? 0) >= 0 ? '+' : ''}{(t.pnlPips ?? 0).toFixed(1)}p
                        </td>
                        <td className="py-2.5 px-2.5 text-center">
                          {onOpenSession && (
                            <button
                              onClick={() => onOpenSession(t.sessionId)}
                              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title={`Open session "${t.sessionName}"`}
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
