import { useState } from 'react';
import {
  X,
  BarChart3,
  TrendingUp,
  Percent,
  Layers,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import type { SessionRecord } from '@/lib/db';
import type { Order, TradeStats } from '@/lib/tradeEngine';
import { getContractMultiplier } from '@/lib/tradeEngine';
import { formatTimeframe } from '@/lib/replay';

interface SessionDashboardModalProps {
  open: boolean;
  onClose: () => void;
  session: SessionRecord;
  stats: TradeStats;
  currentPrice: number;
  orders: Order[];
  notes: string;
  onNotesChange: (notes: string) => void;
  startingBalance: number;
  position: number;
  total: number;
}

export function SessionDashboardModal({
  open,
  onClose,
  session,
  stats,
  currentPrice,
  orders,
  notes,
  onNotesChange,
  startingBalance,
  position,
  total,
}: SessionDashboardModalProps) {
  if (!open) return null;

  const closedOrders = orders.filter((o) => o.status === 'closed');
  const openOrders = orders.filter((o) => o.status === 'filled');

  const openPnl = openOrders.reduce((sum, o) => {
    const mult = o.contractMultiplier ?? getContractMultiplier(o.fillPrice || currentPrice);
    const diff = o.side === 'buy' ? currentPrice - (o.fillPrice || 0) : (o.fillPrice || 0) - currentPrice;
    return sum + diff * o.size * mult;
  }, 0);

  const totalEquity = startingBalance + stats.totalPnl + openPnl;
  const returnPct = startingBalance > 0 ? ((totalEquity - startingBalance) / startingBalance) * 100 : 0;
  const progressPct = total > 1 ? ((position - 1) / (total - 1)) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
              <BarChart3 size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">{session.name}</h2>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-primary font-semibold">
                  {session.symbol}
                </span>
                {session.leverage && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                    1:{session.leverage}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>Base TF: {formatTimeframe(session.timeframe)}</span>
                {session.startDate && session.endDate && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} className="text-primary" />
                      {session.startDate} → {session.endDate}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="panel p-3.5 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Account Equity
              </span>
              <div
                className={`text-lg font-bold font-mono ${
                  totalEquity >= startingBalance ? 'text-long' : 'text-short'
                }`}
              >
                ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Start: ${startingBalance.toLocaleString()} ({returnPct >= 0 ? '+' : ''}
                {returnPct.toFixed(1)}%)
              </div>
            </div>

            <div className="panel p-3.5 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Win Rate
              </span>
              <div
                className={`text-lg font-bold font-mono ${
                  stats.winRate >= 50 ? 'text-long' : 'text-short'
                }`}
              >
                {stats.totalTrades > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {stats.wins}W · {stats.losses}L · {stats.breakeven}BE
              </div>
            </div>

            <div className="panel p-3.5 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Profit Factor
              </span>
              <div className="text-lg font-bold font-mono text-primary">
                {stats.profitFactor === Infinity
                  ? '∞'
                  : stats.profitFactor > 0
                  ? stats.profitFactor.toFixed(2)
                  : '—'}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Avg R:R {stats.avgRR > 0 ? `1:${stats.avgRR.toFixed(1)}` : '—'}
              </div>
            </div>

            <div className="panel p-3.5 space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Replay Progress
              </span>
              <div className="text-lg font-bold font-mono text-foreground">{progressPct.toFixed(0)}%</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Bar {position.toLocaleString()} of {total.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Strategy Journal & Rules */}
          <div className="panel p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <FileText size={14} className="text-primary" />
              <span>Strategy Notes & Session Journal</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Record your strategy hypothesis, rules, entry triggers, mistakes, and market observations for this session..."
              rows={3}
              className="w-full bg-secondary/60 text-foreground border border-border rounded-lg p-2.5 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </div>

          {/* Trade History Log */}
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Layers size={14} className="text-primary" />
                <span>Session Closed Trades ({closedOrders.length})</span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Net P&L: {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
              </div>
            </div>

            {closedOrders.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No closed trades yet in this session. Execute trades from the right-hand panel during replay.
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-x-auto max-h-56">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/40 text-[10px] font-mono uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2 px-3">Side</th>
                      <th className="py-2 px-3">Size</th>
                      <th className="py-2 px-3">Entry</th>
                      <th className="py-2 px-3">Exit</th>
                      <th className="py-2 px-3">Reason</th>
                      <th className="py-2 px-3 text-right">P&L ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                    {closedOrders.map((t) => (
                      <tr key={t.id} className="hover:bg-secondary/20">
                        <td className="py-2 px-3">
                          <span
                            className={`font-bold ${
                              t.side === 'buy' ? 'text-long' : 'text-short'
                            }`}
                          >
                            {t.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-foreground">{t.size}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {t.fillPrice ? t.fillPrice.toFixed(t.fillPrice > 10 ? 2 : 5) : '—'}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {t.closePrice ? t.closePrice.toFixed(t.closePrice > 10 ? 2 : 5) : '—'}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground uppercase text-[10px]">
                          {t.closeReason || 'manual'}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            (t.pnl || 0) >= 0 ? 'text-long' : 'text-short'
                          }`}
                        >
                          {(t.pnl || 0) >= 0 ? '+' : ''}
                          {(t.pnl || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-end bg-secondary/20">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
