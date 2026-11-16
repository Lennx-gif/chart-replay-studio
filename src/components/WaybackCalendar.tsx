import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Calendar as CalendarIcon,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export type WaybackCalendarMode = 'compact' | 'expanded';

export interface WaybackDayIndicator {
  newsImpacts?: { high: number; medium: number; low: number };
  pnl?: number;
  tradesCount?: number;
  wins?: number;
  losses?: number;
  breakevens?: number;
}

export interface WaybackCalendarProps {
  mode?: WaybackCalendarMode;
  currentReplayTime?: number; // unix seconds (UTC)
  selectedDate?: string; // YYYY-MM-DD
  onSelectDate?: (dateStr: string, unixSeconds: number) => void;
  dayIndicators?: Record<string, WaybackDayIndicator>;
  minYear?: number;
  maxYear?: number;
  tzOffset?: number; // hours
  className?: string;
  showWeeklyRollup?: boolean;
  initialYear?: number;
  initialMonth?: number; // 0-11
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatYmd(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function parseYmd(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr || !dateStr.includes('-')) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return null;
  return { year: parts[0], month: parts[1] - 1, day: parts[2] };
}

export function WaybackCalendar({
  mode = 'compact',
  currentReplayTime,
  selectedDate,
  onSelectDate,
  dayIndicators = {},
  minYear = 2015,
  maxYear = 2026,
  tzOffset = 0,
  className = '',
  showWeeklyRollup = mode === 'expanded',
  initialYear,
  initialMonth,
}: WaybackCalendarProps) {
  // Determine current replay date string if timestamp provided
  const currentReplayYmd = useMemo(() => {
    if (!currentReplayTime || currentReplayTime <= 0) return null;
    const date = new Date((currentReplayTime + tzOffset * 3600) * 1000);
    return date.toISOString().slice(0, 10);
  }, [currentReplayTime, tzOffset]);

  // Determine initial view year & month
  const defaultYearMonth = useMemo(() => {
    if (initialYear !== undefined && initialMonth !== undefined) {
      return { year: initialYear, month: initialMonth };
    }
    if (selectedDate) {
      const parsed = parseYmd(selectedDate);
      if (parsed) return { year: parsed.year, month: parsed.month };
    }
    if (currentReplayYmd) {
      const parsed = parseYmd(currentReplayYmd);
      if (parsed) return { year: parsed.year, month: parsed.month };
    }
    // Fallback: 2024 January (common replay dataset)
    return { year: 2024, month: 0 };
  }, [initialYear, initialMonth, selectedDate, currentReplayYmd]);

  const [viewYear, setViewYear] = useState<number>(defaultYearMonth.year);
  const [viewMonth, setViewMonth] = useState<number>(defaultYearMonth.month);

  // Sync view when initialYear/Month or selectedDate changes meaningfully
  useEffect(() => {
    if (initialYear !== undefined && initialMonth !== undefined) {
      setViewYear(initialYear);
      setViewMonth(initialMonth);
    }
  }, [initialYear, initialMonth]);

  // Generate Year options
  const yearOptions = useMemo(() => {
    const start = Math.min(minYear, viewYear);
    const end = Math.max(maxYear, viewYear);
    const list: number[] = [];
    for (let y = start; y <= end; y++) {
      list.push(y);
    }
    return list;
  }, [minYear, maxYear, viewYear]);

  // Steppers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToReplay = () => {
    if (currentReplayYmd) {
      const parsed = parseYmd(currentReplayYmd);
      if (parsed) {
        setViewYear(parsed.year);
        setViewMonth(parsed.month);
        if (onSelectDate) {
          const unix = Date.UTC(parsed.year, parsed.month, parsed.day) / 1000 - tzOffset * 3600;
          onSelectDate(currentReplayYmd, unix);
        }
      }
    }
  };

  // Build calendar matrix (Monday to Sunday)
  const calendarRows = useMemo(() => {
    // Number of days in month
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    // First day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const firstDayOfWeekRaw = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    // Shift so Mon = 0, Sun = 6
    const firstDayOfWeek = (firstDayOfWeekRaw + 6) % 7;

    // Previous month info
    const prevMonthYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const prevMonthIdx = viewMonth === 0 ? 11 : viewMonth - 1;
    const daysInPrevMonth = new Date(Date.UTC(prevMonthYear, prevMonthIdx + 1, 0)).getUTCDate();

    // Next month info
    const nextMonthYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nextMonthIdx = viewMonth === 11 ? 0 : viewMonth + 1;

    interface CellInfo {
      year: number;
      month: number;
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isWeekend: boolean;
      unixSeconds: number;
    }

    const cells: CellInfo[] = [];

    // Preceding padding from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const dateStr = formatYmd(prevMonthYear, prevMonthIdx, d);
      const unix = Date.UTC(prevMonthYear, prevMonthIdx, d) / 1000 - tzOffset * 3600;
      const dayIdx = cells.length % 7;
      cells.push({
        year: prevMonthYear,
        month: prevMonthIdx,
        day: d,
        dateStr,
        isCurrentMonth: false,
        isWeekend: dayIdx === 5 || dayIdx === 6,
        unixSeconds: unix,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatYmd(viewYear, viewMonth, d);
      const unix = Date.UTC(viewYear, viewMonth, d) / 1000 - tzOffset * 3600;
      const dayIdx = cells.length % 7;
      cells.push({
        year: viewYear,
        month: viewMonth,
        day: d,
        dateStr,
        isCurrentMonth: true,
        isWeekend: dayIdx === 5 || dayIdx === 6,
        unixSeconds: unix,
      });
    }

    // Trailing padding from next month
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      const dateStr = formatYmd(nextMonthYear, nextMonthIdx, nextDay);
      const unix = Date.UTC(nextMonthYear, nextMonthIdx, nextDay) / 1000 - tzOffset * 3600;
      const dayIdx = cells.length % 7;
      cells.push({
        year: nextMonthYear,
        month: nextMonthIdx,
        day: nextDay,
        dateStr,
        isCurrentMonth: false,
        isWeekend: dayIdx === 5 || dayIdx === 6,
        unixSeconds: unix,
      });
      nextDay++;
    }

    // Chunk into 7-day rows
    const rows: CellInfo[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [viewYear, viewMonth, tzOffset]);

  // Compute Weekly rollups (for expanded mode)
  const weeklyRollups = useMemo(() => {
    if (!showWeeklyRollup) return [];

    return calendarRows.map((row) => {
      let weekPnl = 0;
      let weekTrades = 0;
      let weekWins = 0;
      let weekLosses = 0;

      for (const cell of row) {
        if (!cell.isCurrentMonth) continue;
        const ind = dayIndicators[cell.dateStr];
        if (ind) {
          if (ind.pnl !== undefined) weekPnl += ind.pnl;
          if (ind.tradesCount !== undefined) weekTrades += ind.tradesCount;
          if (ind.wins !== undefined) weekWins += ind.wins;
          if (ind.losses !== undefined) weekLosses += ind.losses;
        }
      }

      return {
        pnl: weekPnl,
        trades: weekTrades,
        wins: weekWins,
        losses: weekLosses,
      };
    });
  }, [calendarRows, dayIndicators, showWeeklyRollup]);

  const isCompact = mode === 'compact';

  return (
    <div
      className={`bg-card/90 border border-border rounded-xl select-none text-foreground font-sans ${
        isCompact ? 'p-2' : 'p-4'
      } ${className}`}
    >
      {/* 1. Calendar Header Controls */}
      <div className="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-border/70">
        <div className="flex items-center gap-1">
          {/* Month Selector */}
          <select
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
            className="bg-secondary text-foreground border border-border rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/80 transition-colors"
          >
            {MONTHS.map((name, i) => (
              <option key={name} value={i}>
                {isCompact ? MONTHS_SHORT[i] : name}
              </option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
            className="bg-secondary text-foreground border border-border rounded px-1.5 py-0.5 text-xs font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/80 transition-colors"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Right side steppers + Jump to Replay */}
        <div className="flex items-center gap-0.5">
          {currentReplayYmd && (
            <button
              onClick={handleJumpToReplay}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-[10px] font-mono font-medium transition-all mr-1 cursor-pointer"
              title={`Jump view to active replay date (${currentReplayYmd})`}
            >
              <RotateCcw size={10} />
              <span className="hidden sm:inline">Sync Replay</span>
            </button>
          )}

          <button
            onClick={handlePrevMonth}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft size={isCompact ? 13 : 15} />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Next Month"
          >
            <ChevronRight size={isCompact ? 13 : 15} />
          </button>
        </div>
      </div>

      {/* 2. Grid Table */}
      <div className="w-full">
        {/* Day-of-Week Headers */}
        <div
          className={`grid gap-1 mb-1 text-center font-mono font-semibold uppercase text-muted-foreground ${
            isCompact ? 'text-[9px]' : 'text-xs'
          } ${showWeeklyRollup ? 'grid-cols-8' : 'grid-cols-7'}`}
        >
          {WEEKDAYS.map((wd, i) => (
            <div key={wd} className={i >= 5 ? 'text-muted-foreground/60' : ''}>
              {isCompact ? wd[0] : wd}
            </div>
          ))}
          {showWeeklyRollup && <div className="text-primary/80">Rollup</div>}
        </div>

        {/* Calendar Rows */}
        <div className="space-y-1">
          {calendarRows.map((row, rIdx) => {
            const rollup = weeklyRollups[rIdx];

            return (
              <div
                key={rIdx}
                className={`grid gap-1 items-stretch ${
                  showWeeklyRollup ? 'grid-cols-8' : 'grid-cols-7'
                }`}
              >
                {row.map((cell) => {
                  const isSelected = selectedDate === cell.dateStr;
                  const isReplayDate = currentReplayYmd === cell.dateStr;
                  const ind = dayIndicators[cell.dateStr];
                  const hasNews =
                    ind?.newsImpacts &&
                    (ind.newsImpacts.high > 0 ||
                      ind.newsImpacts.medium > 0 ||
                      ind.newsImpacts.low > 0);
                  const hasPnl = ind?.pnl !== undefined && ind.tradesCount !== undefined && ind.tradesCount > 0;
                  const isProfit = (ind?.pnl ?? 0) > 0.0001;
                  const isLoss = (ind?.pnl ?? 0) < -0.0001;

                  // Dynamic cell styling
                  let cellBg = 'bg-secondary/20 hover:bg-secondary/40';
                  if (!cell.isCurrentMonth) {
                    cellBg = 'opacity-30 hover:opacity-50 bg-transparent';
                  } else if (hasPnl && !isCompact) {
                    if (isProfit) cellBg = 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20';
                    else if (isLoss) cellBg = 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20';
                  }

                  let borderCls = 'border-border/40';
                  if (isSelected) {
                    borderCls = 'border-primary ring-1 ring-primary';
                  } else if (isReplayDate) {
                    borderCls = 'border-amber-500 ring-1 ring-amber-500/60';
                  }

                  return (
                    <button
                      key={cell.dateStr}
                      onClick={() => onSelectDate?.(cell.dateStr, cell.unixSeconds)}
                      className={`relative flex flex-col justify-between rounded-lg border p-1 transition-all text-left cursor-pointer ${cellBg} ${borderCls} ${
                        isCompact ? 'min-h-[36px]' : 'min-h-[58px]'
                      }`}
                      title={`${cell.dateStr}${
                        hasPnl
                          ? ` · P&L: ${(ind?.pnl ?? 0) >= 0 ? '+' : ''}$${ind?.pnl?.toFixed(2)} (${
                              ind?.tradesCount
                            } trades)`
                          : ''
                      }`}
                    >
                      {/* Top Bar: Day number + Replay badge */}
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`font-mono font-medium ${
                            isCompact ? 'text-[10px]' : 'text-xs'
                          } ${
                            !cell.isCurrentMonth
                              ? 'text-muted-foreground'
                              : isSelected
                              ? 'text-primary font-bold'
                              : cell.isWeekend
                              ? 'text-muted-foreground/80'
                              : 'text-foreground'
                          }`}
                        >
                          {cell.day}
                        </span>

                        {isReplayDate && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                            title="Active Replay Bar Date"
                          />
                        )}
                      </div>

                      {/* Compact Mode: News Impact Dots or Mini P&L dot */}
                      {isCompact && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5 min-h-[5px]">
                          {hasNews && (
                            <>
                              {ind.newsImpacts!.high > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              )}
                              {ind.newsImpacts!.medium > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              )}
                              {ind.newsImpacts!.low > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                              )}
                            </>
                          )}
                          {hasPnl && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isProfit ? 'bg-emerald-400' : isLoss ? 'bg-rose-400' : 'bg-muted-foreground'
                              }`}
                            />
                          )}
                        </div>
                      )}

                      {/* Expanded Mode: P&L amount & Trade count breakdown */}
                      {!isCompact && cell.isCurrentMonth && (
                        <div className="mt-1 flex flex-col justify-end">
                          {hasPnl ? (
                            <>
                              <div
                                className={`text-[11px] font-mono font-bold leading-tight ${
                                  isProfit ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-muted-foreground'
                                }`}
                              >
                                {(ind?.pnl ?? 0) >= 0 ? '+' : ''}${ind?.pnl?.toFixed(0)}
                              </div>
                              <div className="text-[9px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                                <span>{ind?.tradesCount}T</span>
                                {ind?.wins !== undefined && ind?.losses !== undefined && (
                                  <span>
                                    ({ind.wins}W/{ind.losses}L)
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="h-4" />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Weekly Rollup Cell (Expanded Mode) */}
                {showWeeklyRollup && rollup && (
                  <div
                    className={`rounded-lg border border-border/50 p-1 flex flex-col justify-between text-right font-mono transition-all ${
                      rollup.trades > 0
                        ? rollup.pnl >= 0
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-secondary/10 opacity-40'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">
                      W{rIdx + 1}
                    </span>
                    {rollup.trades > 0 ? (
                      <div className="mt-0.5">
                        <div
                          className={`text-xs font-bold leading-tight ${
                            rollup.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {rollup.pnl >= 0 ? '+' : ''}${rollup.pnl.toFixed(0)}
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {rollup.trades}T · {rollup.wins}W {rollup.losses}L
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
