import { useState } from 'react';
import { X, BarChart3, List } from 'lucide-react';
import type { Order, TradeStats } from '@/lib/tradeEngine';
import { calculateStats } from '@/lib/tradeEngine';

interface TradeJournalProps {
  orders: Order[];
  onClose: () => void;
  startingBalance?: number;
}

export function TradeJournal({ orders, onClose, startingBalance = 10000 }: TradeJournalProps) {
  const [tab, setTab] = useState<'stats' | 'log'>('stats');
  const closed = orders.filter(o => o.status === 'closed');
  const stats = calculateStats(orders, startingBalance);

  return (
    <div className="absolute inset-0 z-40 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">Trade Journal</span>
          <div className="flex gap-1">
            <button
              className={`toolbar-btn !px-3 gap-1.5 ${tab === 'stats' ? 'toolbar-btn-active' : ''}`}
              onClick={() => setTab('stats')}
            >
              <BarChart3 size={13} />
              Stats
            </button>
            <button
              className={`toolbar-btn !px-3 gap-1.5 ${tab === 'log' ? 'toolbar-btn-active' : ''}`}
              onClick={() => setTab('log')}
            >
              <List size={13} />
              Trade Log
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      {tab === 'stats' ? (
        <StatsView stats={stats} />
      ) : (
        <TradeLog trades={closed} />
      )}
    </div>
  );
}

function StatsView({ stats }: { stats: TradeStats }) {
  const statCards = [
    { label: 'Total Trades', value: stats.totalTrades.toString() },
    { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? 'text-long' : 'text-short' },
    { label: 'Profit Factor', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), color: stats.profitFactor >= 1 ? 'text-long' : 'text-short' },
    { label: 'Total P&L', value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? 'text-long' : 'text-short' },
    { label: 'Avg Win', value: `+${stats.avgWin.toFixed(2)}`, color: 'text-long' },
    { label: 'Avg Loss', value: `-${stats.avgLoss.toFixed(2)}`, color: 'text-short' },
    { label: 'Best Trade', value: `+${stats.bestTrade.toFixed(2)}`, color: 'text-long' },
    { label: 'Worst Trade', value: stats.worstTrade.toFixed(2), color: 'text-short' },
    { label: 'Avg R:R', value: `1:${stats.avgRR.toFixed(1)}` },
    { label: 'Wins', value: stats.wins.toString(), color: 'text-long' },
    { label: 'Losses', value: stats.losses.toString(), color: 'text-short' },
    { label: 'Breakeven', value: stats.breakeven.toString() },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="panel p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-lg font-mono font-bold ${color || 'text-foreground'}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      {stats.equityCurve.length > 1 && (
        <div className="panel p-4">
          <div className="text-xs font-semibold text-foreground mb-3">Equity Curve</div>
          <EquityCurveChart data={stats.equityCurve} />
        </div>
      )}

      {/* Win/Loss bar */}
      {stats.totalTrades > 0 && (
        <div className="panel p-4 mt-3">
          <div className="text-xs font-semibold text-foreground mb-2">Win / Loss Distribution</div>
          <div className="flex h-6 rounded overflow-hidden">
            {stats.wins > 0 && (
              <div
                className="bg-long/60 flex items-center justify-center text-[10px] font-mono text-long-foreground font-bold"
                style={{ width: `${(stats.wins / stats.totalTrades) * 100}%` }}
              >
                {stats.wins}W
              </div>
            )}
            {stats.breakeven > 0 && (
              <div
                className="bg-muted flex items-center justify-center text-[10px] font-mono text-muted-foreground font-bold"
                style={{ width: `${(stats.breakeven / stats.totalTrades) * 100}%` }}
              >
                {stats.breakeven}BE
              </div>
            )}
            {stats.losses > 0 && (
              <div
                className="bg-short/60 flex items-center justify-center text-[10px] font-mono font-bold"
                style={{ width: `${(stats.losses / stats.totalTrades) * 100}%` }}
              >
                {stats.losses}L
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EquityCurveChart({ data }: { data: { time: number; equity: number }[] }) {
  if (data.length < 2) return null;

  const width = 800;
  const height = 200;
  const padding = 30;

  const minEq = Math.min(0, ...data.map(d => d.equity));
  const maxEq = Math.max(0, ...data.map(d => d.equity));
  const range = maxEq - minEq || 1;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((d.equity - minEq) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const zeroY = height - padding - ((0 - minEq) / range) * (height - padding * 2);
  const lastEquity = data[data.length - 1].equity;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      {/* Zero line */}
      <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="4" />
      {/* Curve */}
      <polyline
        fill="none"
        stroke={lastEquity >= 0 ? 'hsl(var(--long))' : 'hsl(var(--short))'}
        strokeWidth="2"
        points={points}
      />
      {/* Fill */}
      <polygon
        fill={lastEquity >= 0 ? 'hsl(var(--long) / 0.1)' : 'hsl(var(--short) / 0.1)'}
        points={`${padding},${zeroY} ${points} ${width - padding},${zeroY}`}
      />
      {/* Labels */}
      <text x={padding} y={14} fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="JetBrains Mono">
        {maxEq.toFixed(2)}
      </text>
      <text x={padding} y={height - 5} fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="JetBrains Mono">
        {minEq.toFixed(2)}
      </text>
    </svg>
  );
}

function TradeLog({ trades }: { trades: Order[] }) {
  const sorted = [...trades].sort((a, b) => (b.closeTime || 0) - (a.closeTime || 0));

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Side</th>
            <th className="px-3 py-2 text-right">Entry</th>
            <th className="px-3 py-2 text-right">Exit</th>
            <th className="px-3 py-2 text-right">Size</th>
            <th className="px-3 py-2 text-center">Reason</th>
            <th className="px-3 py-2 text-right">Pips</th>
            <th className="px-3 py-2 text-right">P&L</th>
            <th className="px-3 py-2 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((trade, i) => (
            <tr key={trade.id} className="border-b border-border hover:bg-muted/20 font-mono">
              <td className="px-3 py-2 text-muted-foreground">{sorted.length - i}</td>
              <td className={`px-3 py-2 font-semibold ${trade.side === 'buy' ? 'text-long' : 'text-short'}`}>
                {trade.side.toUpperCase()}
              </td>
              <td className="px-3 py-2 text-right">{trade.fillPrice?.toFixed(5)}</td>
              <td className="px-3 py-2 text-right">{trade.closePrice?.toFixed(5)}</td>
              <td className="px-3 py-2 text-right">{trade.size}</td>
              <td className="px-3 py-2 text-center">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                  trade.closeReason === 'tp' ? 'bg-long/20 text-long' :
                  trade.closeReason === 'sl' ? 'bg-short/20 text-short' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {trade.closeReason?.toUpperCase() || 'MANUAL'}
                </span>
              </td>
              <td className={`px-3 py-2 text-right ${(trade.pnlPips || 0) >= 0 ? 'text-long' : 'text-short'}`}>
                {(trade.pnlPips || 0) >= 0 ? '+' : ''}{(trade.pnlPips || 0).toFixed(1)}
              </td>
              <td className={`px-3 py-2 text-right font-semibold ${(trade.pnl || 0) >= 0 ? 'text-long' : 'text-short'}`}>
                {(trade.pnl || 0) >= 0 ? '+' : ''}{(trade.pnl || 0).toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {trade.closeTime ? new Date(trade.closeTime * 1000).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">No closed trades yet</div>
      )}
    </div>
  );
}
