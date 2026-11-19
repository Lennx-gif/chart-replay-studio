import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Layers2,
  TrendingUp,
  TrendingDown,
  Target,
  Layers,
  Clock,
  ExternalLink,
  AlertCircle,
  Play,
  Flame,
  Award,
  DollarSign,
  Zap,
} from 'lucide-react';
import type { SessionRecord, NewsEventRecord } from '@/lib/db';
import { listNewsEvents } from '@/lib/store';
import { WaybackCalendar, type WaybackDayIndicator, parseYmd } from './WaybackCalendar';

interface EnrichedJournalTrade {
  id: string;
  sessionId: string;
  sessionName: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  entryPrice?: number;
  fillPrice?: number;
  closePrice?: number;
  fillTime?: number;
  closeTime?: number;
  pnl?: number;
  pnlPips?: number;
  dateStr: string;
}

interface JournalCalendarProps {
  sessions: SessionRecord[];
  onOpenSession?: (sessionId: string) => void;
}

function formatTradeTime(unix?: number): string {
  if (!unix || unix <= 0) return '—';
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(11, 16);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '< 1m';
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export function JournalCalendar({ sessions, onOpenSession }: JournalCalendarProps) {
  const navigate = useNavigate();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [allNewsEvents, setAllNewsEvents] = useState<NewsEventRecord[]>([]);
  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null);

  // Load news events from IndexedDB for co-location
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const events = await listNewsEvents();
        if (!cancelled) setAllNewsEvents(events);
      } catch {
        // News not loaded
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Gather all closed trades across active scope
  const scopedTrades = useMemo(() => {
    const list: EnrichedJournalTrade[] = [];
    sessions.forEach((s) => {
      if (selectedSessionId !== 'all' && s.id !== selectedSessionId) {
        return;
      }

      (s.orders || []).forEach((o) => {
        if (o.status === 'closed' && o.pnl != null) {
          const tTime = o.closeTime ?? o.fillTime ?? o.createdTime ?? 0;
          const dateStr = tTime > 0 ? new Date(tTime * 1000).toISOString().slice(0, 10) : '';

          list.push({
            id: o.id,
            sessionId: s.id,
            sessionName: s.name || s.symbol,
            symbol: s.symbol,
            side: o.side,
            size: o.size,
            entryPrice: o.entryPrice,
            fillPrice: o.fillPrice,
            closePrice: o.closePrice,
            fillTime: o.fillTime,
            closeTime: o.closeTime,
            pnl: o.pnl,
            pnlPips: o.pnlPips,
            dateStr,
          });
        }
      });
    });
    return list;
  }, [sessions, selectedSessionId]);

  // 2. Determine initial year and month based on the most recent active historical trading month
  const initialYearMonth = useMemo(() => {
    let latestTime = 0;
    for (const t of scopedTrades) {
      const time = t.closeTime ?? t.fillTime ?? 0;
      if (time > latestTime) latestTime = time;
    }

    if (latestTime > 0) {
      const d = new Date(latestTime * 1000);
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    }

    // Default to 2024 January (common replay dataset)
    return { year: 2024, month: 0 };
  }, [scopedTrades]);

  // Active viewing year & month state
  const [activeYear, setActiveYear] = useState<number>(initialYearMonth.year);
  const [activeMonth, setActiveMonth] = useState<number>(initialYearMonth.month);

  useEffect(() => {
    setActiveYear(initialYearMonth.year);
    setActiveMonth(initialYearMonth.month);
  }, [initialYearMonth]);

  // 3. Compute day indicators for WaybackCalendar
  const dayIndicators = useMemo(() => {
    const map: Record<string, WaybackDayIndicator> = {};

    scopedTrades.forEach((t) => {
      if (!t.dateStr) return;
      if (!map[t.dateStr]) {
        map[t.dateStr] = {
          pnl: 0,
          tradesCount: 0,
          wins: 0,
          losses: 0,
          breakevens: 0,
        };
      }

      const ind = map[t.dateStr];
      const pnl = t.pnl ?? 0;
      ind.pnl = (ind.pnl ?? 0) + pnl;
      ind.tradesCount = (ind.tradesCount ?? 0) + 1;
      if (pnl > 0.0001) ind.wins = (ind.wins ?? 0) + 1;
      else if (pnl < -0.0001) ind.losses = (ind.losses ?? 0) + 1;
      else ind.breakevens = (ind.breakevens ?? 0) + 1;
    });

    return map;
  }, [scopedTrades]);

  // 4. Monthly Rollup Stats for the currently viewed Year + Month
  const monthlyStats = useMemo(() => {
    let totalPnl = 0;
    let tradesCount = 0;
    let wins = 0;
    let losses = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let bestDayPnl = -Infinity;
    let worstDayPnl = Infinity;
    let activeDays = 0;

    const prefix = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}`;

    Object.entries(dayIndicators).forEach(([dateStr, ind]) => {
      if (dateStr.startsWith(prefix) && (ind.tradesCount ?? 0) > 0) {
        activeDays++;
        const p = ind.pnl ?? 0;
        totalPnl += p;
        tradesCount += ind.tradesCount ?? 0;
        wins += ind.wins ?? 0;
        losses += ind.losses ?? 0;

        if (p > bestDayPnl) bestDayPnl = p;
        if (p < worstDayPnl) worstDayPnl = p;
      }
    });

    scopedTrades.forEach((t) => {
      if (t.dateStr.startsWith(prefix)) {
        const p = t.pnl ?? 0;
        if (p > 0) grossWin += p;
        else if (p < 0) grossLoss += Math.abs(p);
      }
    });

    const winRate = tradesCount > 0 ? (wins / tradesCount) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

    return {
      totalPnl,
      tradesCount,
      wins,
      losses,
      winRate,
      profitFactor,
      activeDays,
      bestDayPnl: bestDayPnl === -Infinity ? 0 : bestDayPnl,
      worstDayPnl: worstDayPnl === Infinity ? 0 : worstDayPnl,
    };
  }, [dayIndicators, scopedTrades, activeYear, activeMonth]);

  // 5. Drill-Down: Trades on selected day
  const selectedDayTrades = useMemo(() => {
    if (!selectedDayYmd) return [];
    return scopedTrades.filter((t) => t.dateStr === selectedDayYmd);
  }, [scopedTrades, selectedDayYmd]);

  // 6. Drill-Down: Co-located news events on selected day
  const selectedDayNews = useMemo(() => {
    if (!selectedDayYmd || allNewsEvents.length === 0) return [];
    return allNewsEvents.filter((e) => {
      const eYmd = new Date(e.time * 1000).toISOString().slice(0, 10);
      return eYmd === selectedDayYmd;
    });
  }, [selectedDayYmd, allNewsEvents]);

  const handleOpenSessionAtDate = (sessionId: string) => {
    if (onOpenSession) {
      onOpenSession(sessionId);
    } else {
      navigate(`/session/${sessionId}`);
    }
  };

  return (
    <div className="panel p-5 space-y-4 bg-gradient-to-r from-card via-card to-secondary/20">
      {/* 1. Header & Scope Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Historical Trading P&L &amp; Journal Calendar
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Simulated market performance heatmap with weekly rollups and co-located economic releases
            </p>
          </div>
        </div>

        {/* Scope Selector */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Layers2 size={11} className="text-primary" />
            <span>Scope:</span>
          </label>
          <select
            value={selectedSessionId}
            onChange={(e) => {
              setSelectedSessionId(e.target.value);
              setSelectedDayYmd(null);
            }}
            className="bg-secondary text-foreground border border-border rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="all">All Sessions ({sessions.length})</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.symbol} ({s.symbol})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Monthly Performance Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-3 rounded-xl bg-secondary/30 border border-border/80">
        <div>
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Month Net P&L</span>
          <span
            className={`text-base font-bold font-mono ${
              monthlyStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {monthlyStats.totalPnl >= 0 ? '+' : ''}${monthlyStats.totalPnl.toFixed(2)}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Win Rate</span>
          <span
            className={`text-base font-bold font-mono ${
              monthlyStats.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {monthlyStats.tradesCount > 0 ? `${monthlyStats.winRate.toFixed(0)}%` : '—'}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono ml-1">
            ({monthlyStats.wins}W/{monthlyStats.losses}L)
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Profit Factor</span>
          <span className="text-base font-bold font-mono text-primary">
            {monthlyStats.profitFactor === Infinity
              ? '∞'
              : monthlyStats.profitFactor > 0
              ? monthlyStats.profitFactor.toFixed(2)
              : '—'}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Trading Activity</span>
          <span className="text-sm font-bold font-mono text-foreground">
            {monthlyStats.activeDays} Days · {monthlyStats.tradesCount} Trades
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Best Day</span>
          <span className="text-sm font-bold font-mono text-emerald-400">
            {monthlyStats.bestDayPnl > 0 ? `+$${monthlyStats.bestDayPnl.toFixed(0)}` : '—'}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[9px] uppercase font-semibold">Worst Day</span>
          <span className="text-sm font-bold font-mono text-rose-400">
            {monthlyStats.worstDayPnl < 0 ? `-$${Math.abs(monthlyStats.worstDayPnl).toFixed(0)}` : '—'}
          </span>
        </div>
      </div>

      {/* 3. Expanded Wayback Calendar Heatmap with Weekly Rollups */}
      <WaybackCalendar
        mode="expanded"
        showWeeklyRollup={true}
        initialYear={activeYear}
        initialMonth={activeMonth}
        selectedDate={selectedDayYmd ?? undefined}
        onSelectDate={(ymd) => setSelectedDayYmd(ymd)}
        dayIndicators={dayIndicators}
      />

      {/* 4. Interactive Day Breakdown Drawer */}
      {selectedDayYmd && (
        <div className="p-4 rounded-xl bg-card border border-primary/30 space-y-4 shadow-lg animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-2.5">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-primary" />
              <h4 className="text-sm font-bold text-foreground">
                Historical Day Breakdown: <span className="font-mono text-primary">{selectedDayYmd}</span>
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                {selectedDayTrades.length} Trades Executed
              </span>
            </div>

            <button
              onClick={() => setSelectedDayYmd(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer self-start sm:self-auto"
            >
              Close Breakdown
            </button>
          </div>

          {/* Section A: Executed Trades on this day */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Trades Executed on {selectedDayYmd}</span>
              {selectedDayTrades.length > 0 && (
                <span className="text-[10px] font-mono text-primary">
                  Net Day P&L:{' '}
                  {(dayIndicators[selectedDayYmd]?.pnl ?? 0) >= 0 ? '+' : ''}$
                  {(dayIndicators[selectedDayYmd]?.pnl ?? 0).toFixed(2)}
                </span>
              )}
            </div>

            {selectedDayTrades.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground bg-secondary/20 rounded-lg">
                No trades were closed on this simulated calendar date.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-[9px] uppercase text-muted-foreground tracking-wider">
                      <th className="py-1.5 px-2">#</th>
                      <th className="py-1.5 px-2">Session / Pair</th>
                      <th className="py-1.5 px-2">Side</th>
                      <th className="py-1.5 px-2">Lots</th>
                      <th className="py-1.5 px-2">Fill Price</th>
                      <th className="py-1.5 px-2">Close Price</th>
                      <th className="py-1.5 px-2">Time</th>
                      <th className="py-1.5 px-2">Duration</th>
                      <th className="py-1.5 px-2 text-right">P&L ($)</th>
                      <th className="py-1.5 px-2 text-right">Pips</th>
                      <th className="py-1.5 px-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {selectedDayTrades.map((t, idx) => {
                      const isWin = (t.pnl ?? 0) > 0.0001;
                      const isLoss = (t.pnl ?? 0) < -0.0001;
                      const durSec = t.fillTime && t.closeTime ? Math.max(0, t.closeTime - t.fillTime) : 0;

                      return (
                        <tr key={t.id} className="hover:bg-secondary/40 transition-colors">
                          <td className="py-2 px-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <span className="font-bold text-foreground">{t.sessionName}</span>{' '}
                            <span className="text-[10px] text-primary">({t.symbol})</span>
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                                t.side === 'buy'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {t.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-2">{t.size}</td>
                          <td className="py-2 px-2 text-muted-foreground">{t.fillPrice?.toFixed(5) ?? '—'}</td>
                          <td className="py-2 px-2 text-muted-foreground">{t.closePrice?.toFixed(5) ?? '—'}</td>
                          <td className="py-2 px-2 text-[10px] text-muted-foreground">
                            {formatTradeTime(t.fillTime)} → {formatTradeTime(t.closeTime)}
                          </td>
                          <td className="py-2 px-2 text-[10px] text-muted-foreground">
                            {formatDuration(durSec)}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold ${
                              isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-muted-foreground'
                            }`}
                          >
                            {(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}
                          </td>
                          <td
                            className={`py-2 px-2 text-right ${
                              isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-muted-foreground'
                            }`}
                          >
                            {(t.pnlPips ?? 0) >= 0 ? '+' : ''}{(t.pnlPips ?? 0).toFixed(1)}p
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleOpenSessionAtDate(t.sessionId)}
                              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Open session in replay workspace"
                            >
                              <Play size={11} />
                              <span className="text-[10px]">Replay</span>
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

          {/* Section B: Co-Located Historical News Context */}
          <div className="space-y-2 pt-2 border-t border-border/80">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertCircle size={13} className="text-primary" />
                <span>Co-Located Economic News Releases on {selectedDayYmd}</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {selectedDayNews.length} Event{selectedDayNews.length === 1 ? '' : 's'} Logged
              </span>
            </div>

            {selectedDayNews.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground bg-secondary/20 rounded-lg">
                No high or medium impact economic releases recorded for {selectedDayYmd}.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {selectedDayNews.map((event) => {
                  const isHigh = event.impact === 'high';
                  const isMed = event.impact === 'medium';
                  const eventTimeStr = new Date(event.time * 1000).toISOString().slice(11, 16);

                  return (
                    <div
                      key={event.id}
                      className="p-2.5 rounded-lg bg-secondary/30 border border-border/70 text-xs space-y-1.5 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded ${
                              event.currency === 'USD'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : event.currency === 'EUR'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-secondary text-primary'
                            }`}
                          >
                            {event.currency}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {eventTimeStr} UTC
                          </span>
                        </div>

                        <span
                          className={`w-2 h-2 rounded-full ${
                            isHigh ? 'bg-red-500' : isMed ? 'bg-amber-500' : 'bg-yellow-400'
                          }`}
                          title={`${event.impact.toUpperCase()} Impact`}
                        />
                      </div>

                      <div className="font-semibold text-foreground text-xs leading-snug">
                        {event.title}
                      </div>

                      {(event.actual || event.forecast || event.previous) && (
                        <div className="grid grid-cols-3 gap-1 text-[9px] font-mono p-1 rounded bg-secondary/50 border border-border/40">
                          <div>
                            <span className="text-muted-foreground block text-[7px] uppercase">Act</span>
                            <span className="font-semibold text-foreground">{event.actual || '—'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[7px] uppercase">Fcst</span>
                            <span className="text-foreground/80">{event.forecast || '—'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[7px] uppercase">Prev</span>
                            <span className="text-muted-foreground">{event.previous || '—'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
