import { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Percent,
  Layers,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  BarChart3,
  Globe2,
  Target,
  DollarSign,
} from 'lucide-react';
import { calculateSessionAnalytics, type Order } from '@/lib/tradeEngine';

interface SessionAnalyticsProps {
  orders: Order[];
  startingBalance?: number;
  symbol?: string;
  tzOffset?: number;
}

export function SessionAnalytics({
  orders,
  startingBalance = 10000,
  symbol = 'EURUSD',
  tzOffset = 0,
}: SessionAnalyticsProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [hoveredTradeIdx, setHoveredTradeIdx] = useState<number | null>(null);

  const data = useMemo(
    () => calculateSessionAnalytics(orders, startingBalance, tzOffset),
    [orders, startingBalance, tzOffset]
  );

  if (data.closedTrades === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[360px] text-muted-foreground select-none">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 border border-primary/20">
          <BarChart3 size={24} />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">No Closed Trades Yet</h3>
        <p className="text-xs max-w-xs text-muted-foreground leading-relaxed">
          Open market or pending orders and close them during replay to view session-scoped entry hour, Forex killzone, and equity curve performance.
        </p>
        <div className="mt-4 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border text-[11px] font-mono text-muted-foreground">
          Simulated Timeline: {tzOffset >= 0 ? `UTC+${tzOffset}` : `UTC${tzOffset}`}
        </div>
      </div>
    );
  }

  // Equity Curve geometry
  const equityPoints = data.equityCurve;
  const equities = equityPoints.map((p) => p.equity);
  const minEquity = Math.min(...equities, startingBalance * 0.98);
  const maxEquity = Math.max(...equities, startingBalance * 1.02);
  const equityRange = Math.max(1, maxEquity - minEquity);

  const svgW = 340;
  const svgH = 110;
  const padX = 14;
  const padY = 12;

  const pointsString = equityPoints
    .map((pt, i) => {
      const x = padX + (i / Math.max(1, equityPoints.length - 1)) * (svgW - padX * 2);
      const y = svgH - padY - ((pt.equity - minEquity) / equityRange) * (svgH - padY * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const isNetPositive = data.netPnl >= 0;
  const strokeColor = isNetPositive ? '#10b981' : '#f43f5e';
  const fillColor = isNetPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

  // Closed area polygon
  const areaPolygon = `${padX},${svgH - padY} ${pointsString} ${svgW - padX},${svgH - padY}`;

  // Max trade count across 24h
  const maxHourCount = Math.max(1, ...data.hourlyStats.map((h) => h.count));

  return (
    <div className="flex flex-col gap-4 p-3 select-none text-foreground overflow-y-auto max-h-full no-scrollbar pb-8">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span>Net Realized P&L</span>
            {isNetPositive ? <TrendingUp size={12} className="text-emerald-500" /> : <TrendingDown size={12} className="text-rose-500" />}
          </div>
          <div className="mt-1">
            <span className={`text-base font-bold font-mono ${isNetPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.netPnl >= 0 ? '+' : ''}${data.netPnl.toFixed(2)}
            </span>
            <span className={`ml-1.5 text-[10px] font-mono ${data.netReturnPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              ({data.netReturnPct >= 0 ? '+' : ''}{data.netReturnPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span>Win Rate</span>
            <Target size={12} className="text-primary" />
          </div>
          <div className="mt-1">
            <span className="text-base font-bold font-mono text-primary">
              {data.winRate.toFixed(1)}%
            </span>
            <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">
              {data.wins}W / {data.losses}L
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span>Profit Factor</span>
            <Layers size={12} className="text-amber-500" />
          </div>
          <div className="mt-1 font-mono">
            <span className="text-sm font-bold text-foreground">
              {Number.isFinite(data.profitFactor) ? data.profitFactor.toFixed(2) : '∞'}
            </span>
            <span className="ml-1 text-[10px] text-muted-foreground">
              (Avg W/L {data.winLossRatio.toFixed(2)})
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span>Max Drawdown</span>
            <ShieldCheck size={12} className="text-rose-400" />
          </div>
          <div className="mt-1 font-mono">
            <span className="text-sm font-bold text-rose-400">
              -${data.maxDrawdown.toFixed(2)}
            </span>
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({data.maxDrawdownPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Bar */}
      <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-secondary/40 border border-border text-[10px] font-mono">
        <div>
          <span className="text-muted-foreground block text-[9px]">Avg Win</span>
          <span className="text-emerald-400 font-semibold">+${data.avgWin.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[9px]">Avg Loss</span>
          <span className="text-rose-400 font-semibold">-${data.avgLoss.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[9px]">Expectancy</span>
          <span className={data.expectancy >= 0 ? 'text-primary font-semibold' : 'text-rose-400 font-semibold'}>
            {data.expectancy >= 0 ? '+' : ''}${data.expectancy.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Session Equity Curve */}
      <div className="p-3 rounded-xl bg-card border border-border flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <TrendingUp size={13} className="text-primary" />
            <span>Session Equity Curve</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {data.closedTrades} Closed Trade{data.closedTrades === 1 ? '' : 's'}
          </span>
        </div>

        <div className="relative w-full h-[110px] bg-secondary/30 rounded-lg overflow-hidden border border-border/50">
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full preserve-3d" preserveAspectRatio="none">
            {/* Zero/Baseline */}
            <line
              x1={padX}
              y1={svgH - padY - ((startingBalance - minEquity) / equityRange) * (svgH - padY * 2)}
              x2={svgW - padX}
              y2={svgH - padY - ((startingBalance - minEquity) / equityRange) * (svgH - padY * 2)}
              stroke="#52525b"
              strokeDasharray="3 3"
              strokeWidth="0.8"
            />
            {/* Shaded Area */}
            <polygon points={areaPolygon} fill={fillColor} />
            {/* Curve Line */}
            <polyline fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pointsString} />
            {/* Data points */}
            {equityPoints.map((pt, i) => {
              const cx = padX + (i / Math.max(1, equityPoints.length - 1)) * (svgW - padX * 2);
              const cy = svgH - padY - ((pt.equity - minEquity) / equityRange) * (svgH - padY * 2);
              const isHovered = hoveredTradeIdx === i;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 4.5 : 2}
                  fill={isHovered ? '#ffffff' : strokeColor}
                  className="cursor-pointer transition-all duration-100"
                  onMouseEnter={() => setHoveredTradeIdx(i)}
                  onMouseLeave={() => setHoveredTradeIdx(null)}
                />
              );
            })}
          </svg>

          {/* Floating Hover Readout */}
          {hoveredTradeIdx !== null && equityPoints[hoveredTradeIdx] && (
            <div className="absolute top-2 right-2 bg-black/90 border border-primary/30 rounded px-2 py-1 text-[10px] font-mono shadow-lg text-right z-10 pointer-events-none">
              <div>Trade #{hoveredTradeIdx}: <span className="text-white font-bold">${equityPoints[hoveredTradeIdx].equity.toFixed(2)}</span></div>
              {hoveredTradeIdx > 0 && (
                <div className={equityPoints[hoveredTradeIdx].pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {equityPoints[hoveredTradeIdx].pnl >= 0 ? '+' : ''}${equityPoints[hoveredTradeIdx].pnl.toFixed(2)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forex Killzones & Sessions Breakdown */}
      <div className="p-3 rounded-xl bg-card border border-border flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Globe2 size={13} className="text-primary" />
            <span>Forex Session Killzones</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">Simulated Entry Hours</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {data.sessionStats.map((sess) => {
            const hasTrades = sess.count > 0;
            return (
              <div
                key={sess.session}
                className="p-2 rounded-lg bg-secondary/40 border border-border/80 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground">{sess.label}</span>
                  <span className="text-[9px] font-mono text-muted-foreground">{sess.count}T</span>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground mb-1">{sess.timeRange}</div>
                <div className="flex items-center justify-between font-mono text-[10px] pt-1 border-t border-border/50">
                  <span className={sess.winRate >= 50 ? 'text-emerald-400 font-semibold' : hasTrades ? 'text-rose-400 font-semibold' : 'text-muted-foreground'}>
                    {hasTrades ? `${sess.winRate.toFixed(0)}% WR` : '—'}
                  </span>
                  <span className={sess.pnl > 0 ? 'text-emerald-400' : sess.pnl < 0 ? 'text-rose-400' : 'text-muted-foreground'}>
                    {hasTrades ? `${sess.pnl >= 0 ? '+' : ''}$${sess.pnl.toFixed(0)}` : '$0'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Entry Hour Distribution (00:00 - 23:00) */}
      <div className="p-3 rounded-xl bg-card border border-border flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Clock size={13} className="text-primary" />
            <span>Entry Hour Breakdown (24h)</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {hoveredHour !== null
              ? `${data.hourlyStats[hoveredHour].label}: ${data.hourlyStats[hoveredHour].count}T (${data.hourlyStats[hoveredHour].winRate.toFixed(0)}% WR)`
              : 'Hover to inspect'}
          </span>
        </div>

        <div className="flex items-end gap-1 h-20 pt-2 px-1 bg-secondary/30 rounded-lg border border-border/50">
          {data.hourlyStats.map((h) => {
            const heightPct = h.count > 0 ? Math.max(14, (h.count / maxHourCount) * 100) : 4;
            const barColor =
              h.count === 0
                ? '#27272a'
                : h.winRate >= 50
                ? '#10b981'
                : '#f43f5e';
            const isHovered = hoveredHour === h.hour;
            return (
              <div
                key={h.hour}
                className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group"
                onMouseEnter={() => setHoveredHour(h.hour)}
                onMouseLeave={() => setHoveredHour(null)}
              >
                <div
                  className="w-full rounded-t transition-all duration-150"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: isHovered ? '#fbbf24' : barColor,
                    boxShadow: isHovered ? '0 0 8px rgba(251, 191, 36, 0.4)' : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* Day of Week Breakdown */}
      <div className="p-3 rounded-xl bg-card border border-border flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Calendar size={13} className="text-primary" />
            <span>Day-of-Week Performance</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">Mon – Fri</span>
        </div>

        <div className="flex flex-col gap-1.5">
          {data.weekdayStats.map((w) => {
            const hasTrades = w.count > 0;
            return (
              <div
                key={w.day}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-secondary/30 border border-border/60 text-xs font-mono"
              >
                <div className="w-12 font-semibold text-foreground">{w.label}</div>
                <div className="text-[10px] text-muted-foreground w-12 text-center">{w.count} trade{w.count === 1 ? '' : 's'}</div>
                <div className="w-16 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${hasTrades && w.winRate >= 50 ? 'bg-emerald-500/15 text-emerald-400' : hasTrades ? 'bg-rose-500/15 text-rose-400' : 'text-muted-foreground'}`}>
                    {hasTrades ? `${w.winRate.toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="w-20 text-right font-semibold">
                  <span className={w.pnl > 0 ? 'text-emerald-400' : w.pnl < 0 ? 'text-rose-400' : 'text-muted-foreground'}>
                    {hasTrades ? `${w.pnl >= 0 ? '+' : ''}$${w.pnl.toFixed(2)}` : '$0.00'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
