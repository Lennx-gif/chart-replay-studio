import { useMemo, useState } from 'react';
import { Flame, Calendar, BarChart2, CheckCircle2 } from 'lucide-react';
import type { SessionRecord } from '@/lib/db';

interface ActivityMatrixProps {
  sessions: SessionRecord[];
}

interface DayData {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sun, 6 = Sat
  tradesCount: number;
  sessionsCount: number;
  barsCount: number;
  netPnl: number;
  intensity: number; // 0 - 4
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function ActivityMatrix({ sessions }: ActivityMatrixProps) {
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  // Compute activity per day across all sessions
  const { weeks, monthLabels, currentStreak, totalActiveDays, totalTrades, totalBars } = useMemo(() => {
    const activityMap = new Map<string, { trades: number; sessions: Set<string>; bars: number; pnl: number }>();

    let totalTr = 0;
    let totalBr = 0;

    for (const s of sessions) {
      totalBr += s.position || 0;
      // 1. Session practice date
      if (s.updatedAt) {
        const dStr = new Date(s.updatedAt).toISOString().slice(0, 10);
        if (!activityMap.has(dStr)) {
          activityMap.set(dStr, { trades: 0, sessions: new Set(), bars: 0, pnl: 0 });
        }
        activityMap.get(dStr)!.sessions.add(s.id);
        activityMap.get(dStr)!.bars += Math.min(100, s.position || 0);
      }

      // 2. Orders executed
      for (const o of s.orders || []) {
        const time = o.closeTime || o.fillTime || o.createdTime;
        if (!time) continue;
        totalTr++;
        const dStr = new Date(time * 1000).toISOString().slice(0, 10);
        if (!activityMap.has(dStr)) {
          activityMap.set(dStr, { trades: 0, sessions: new Set(), bars: 0, pnl: 0 });
        }
        const record = activityMap.get(dStr)!;
        record.trades++;
        record.sessions.add(s.id);
        record.pnl += o.pnl || 0;
      }
    }

    // Build 52 weeks ending today
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const days: DayData[] = [];

    // 52 weeks = 364 days + today's day of week to align to Saturday
    const totalDaysToDisplay = 52 * 7;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - totalDaysToDisplay + 1);

    for (let i = 0; i < totalDaysToDisplay; i++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + i);
      const dStr = cur.toISOString().slice(0, 10);
      const dayOfWeek = cur.getDay();

      const act = activityMap.get(dStr);
      const tradesCount = act ? act.trades : 0;
      const sessionsCount = act ? act.sessions.size : 0;
      const barsCount = act ? act.bars : 0;
      const netPnl = act ? act.pnl : 0;

      // Intensity score (0 - 4)
      const score = tradesCount * 2 + sessionsCount;
      let intensity = 0;
      if (score >= 8) intensity = 4;
      else if (score >= 5) intensity = 3;
      else if (score >= 3) intensity = 2;
      else if (score >= 1) intensity = 1;

      days.push({
        date: dStr,
        dayOfWeek,
        tradesCount,
        sessionsCount,
        barsCount,
        netPnl,
        intensity,
      });
    }

    // Organize into columns (weeks of 7 days)
    const computedWeeks: DayData[][] = [];
    let currentWeek: DayData[] = [];
    for (const d of days) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        computedWeeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      computedWeeks.push(currentWeek);
    }

    // Extract month label positions
    const computedMonthLabels: { month: string; colIndex: number }[] = [];
    let lastMonth = -1;
    computedWeeks.forEach((week, colIdx) => {
      const firstDay = week[0];
      if (firstDay) {
        const m = new Date(firstDay.date).getMonth();
        if (m !== lastMonth) {
          computedMonthLabels.push({ month: MONTH_NAMES[m], colIndex: colIdx });
          lastMonth = m;
        }
      }
    });

    // Compute streak backwards from today
    let streak = 0;
    let checkDate = new Date(now);
    while (true) {
      const dStr = checkDate.toISOString().slice(0, 10);
      const act = activityMap.get(dStr);
      if (act && (act.trades > 0 || act.sessions.size > 0)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If today has no activity yet, check yesterday before breaking streak
        if (dStr === todayStr && streak === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yestStr = checkDate.toISOString().slice(0, 10);
          const yestAct = activityMap.get(yestStr);
          if (yestAct && (yestAct.trades > 0 || yestAct.sessions.size > 0)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }

    let activeDaysCount = 0;
    for (const [, v] of activityMap) {
      if (v.trades > 0 || v.sessions.size > 0) activeDaysCount++;
    }

    return {
      weeks: computedWeeks,
      monthLabels: computedMonthLabels,
      currentStreak: streak,
      totalActiveDays: activeDaysCount,
      totalTrades: totalTr,
      totalBars: totalBr,
    };
  }, [sessions]);

  const INTENSITY_COLORS = [
    'bg-[#161b22] border-border/20', // 0: empty
    'bg-[#1e3a2f] border-emerald-800/30', // 1: light emerald
    'bg-[#2d5e46] border-emerald-700/40', // 2: medium emerald
    'bg-[#3d8c63] border-emerald-500/50', // 3: high emerald
    'bg-[#4caf50] border-emerald-400 shadow-sm shadow-emerald-500/20', // 4: radiant
  ];

  return (
    <div className="panel p-4 sm:p-5 space-y-3.5 bg-card/60 backdrop-blur-sm border-border/70 select-none">
      {/* Header and Summary Counters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Session Backtest & Practice Matrix
          </h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            52 Weeks
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5" title="Consecutive practice days">
            <Flame size={14} className="text-amber-500" />
            <span className="text-muted-foreground">Streak:</span>
            <span className="font-bold text-foreground">{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Total active backtesting days">
            <CheckCircle2 size={13} className="text-primary" />
            <span className="text-muted-foreground">Active Days:</span>
            <span className="font-bold text-foreground">{totalActiveDays}</span>
          </div>
          <div className="flex items-center gap-1.5 hidden md:flex" title="Total bars replayed across sessions">
            <BarChart2 size={13} className="text-muted-foreground" />
            <span className="text-muted-foreground">Replay Bars:</span>
            <span className="font-bold text-primary">{totalBars.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto no-scrollbar pb-1">
        <div className="inline-block min-w-full">
          {/* Month Labels */}
          <div className="flex text-[10px] font-mono text-muted-foreground mb-1 pl-6">
            {monthLabels.map((m, idx) => (
              <span
                key={`${m.month}-${idx}`}
                style={{ marginLeft: idx === 0 ? `${m.colIndex * 13}px` : `${Math.max(8, (m.colIndex - (monthLabels[idx - 1]?.colIndex || 0)) * 13 - 18)}px` }}
              >
                {m.month}
              </span>
            ))}
          </div>

          {/* 7 rows x 52 columns Grid */}
          <div className="flex gap-1.5 items-start">
            {/* Day of Week Labels */}
            <div className="flex flex-col gap-1 text-[9px] font-mono text-muted-foreground w-5 pt-0.5 select-none">
              {DAY_LABELS.map((lbl, idx) => (
                <div key={idx} className="h-2.5 flex items-center leading-none">
                  {lbl}
                </div>
              ))}
            </div>

            {/* Weeks columns */}
            <div className="flex gap-1">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1">
                  {week.map((day) => {
                    const isHovered = hoveredDay?.date === day.date;
                    return (
                      <div
                        key={day.date}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`w-2.5 h-2.5 rounded-[2px] border transition-all cursor-pointer ${
                          INTENSITY_COLORS[day.intensity]
                        } ${isHovered ? 'scale-125 z-10 border-primary ring-1 ring-primary' : ''}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Legend and Hover Tooltip */}
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1">
        <div className="min-h-[16px] text-foreground font-semibold">
          {hoveredDay ? (
            <span>
              {new Date(hoveredDay.date + 'T00:00:00Z').toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              : {hoveredDay.tradesCount} trade(s), {hoveredDay.sessionsCount} session(s)
              {hoveredDay.netPnl !== 0 && (
                <span className={hoveredDay.netPnl >= 0 ? ' text-long ml-1.5' : ' text-short ml-1.5'}>
                  ({hoveredDay.netPnl >= 0 ? '+' : ''}${hoveredDay.netPnl.toFixed(2)})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Hover over any day to inspect backtest practice volume</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span>Less</span>
          {INTENSITY_COLORS.map((c, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-[2px] border ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
