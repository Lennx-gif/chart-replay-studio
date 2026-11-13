import { useState } from 'react';
import { DollarSign, ChevronDown, Check, TrendingUp, TrendingDown, Shield } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionLedger } from '@/lib/tradeEngine';

interface AccountEquityPopoverProps {
  ledger: SessionLedger;
  onBalanceChange: (newBalance: number) => void;
}

export function AccountEquityPopover({ ledger, onBalanceChange }: AccountEquityPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftBalance, setDraftBalance] = useState(String(ledger.initialBalance));

  const handleSaveBalance = () => {
    const val = parseFloat(draftBalance);
    if (isNaN(val) || val <= 0 || val > 100_000_000) {
      toast.error('Enter a valid starting balance (1 – 100,000,000)');
      return;
    }
    onBalanceChange(val);
    toast.success(`Starting balance updated to $${val.toLocaleString()}`);
  };

  const isProfitable = ledger.currentEquity >= ledger.initialBalance;
  const netReturnPct = ledger.initialBalance > 0
    ? ((ledger.currentEquity - ledger.initialBalance) / ledger.initialBalance) * 100
    : 0;

  return (
    <div className="relative">
      <button
        onClick={() => {
          setDraftBalance(String(ledger.initialBalance));
          setOpen(!open);
        }}
        className={`flex items-center gap-1.5 px-2.5 h-7 rounded border text-xs font-mono transition-all cursor-pointer select-none ${
          isProfitable
            ? 'bg-long/10 border-long/40 text-long hover:bg-long/20'
            : 'bg-short/10 border-short/40 text-short hover:bg-short/20'
        }`}
        title="View Real-Time Account Equity & Margin Ledger"
      >
        <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
          Equity:
        </span>
        <span className="font-bold">
          ${ledger.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-[9px] opacity-75">
          ({netReturnPct >= 0 ? '+' : ''}{netReturnPct.toFixed(1)}%)
        </span>
        <ChevronDown size={11} className={`transition-transform opacity-70 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield size={13} className="text-primary" />
              <span className="text-xs font-bold text-foreground">Session Account Ledger</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {ledger.closedTradesCount} closed · {ledger.winRate.toFixed(0)}% WR
            </span>
          </div>

          {/* Breakdown Rows */}
          <div className="p-3.5 space-y-2.5 text-xs font-mono">
            {/* Current Equity Hero */}
            <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                  Current Equity
                </span>
                <span className={`text-base font-bold ${isProfitable ? 'text-long' : 'text-short'}`}>
                  ${ledger.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                  Net Return
                </span>
                <span className={`text-xs font-bold ${isProfitable ? 'text-long' : 'text-short'}`}>
                  {netReturnPct >= 0 ? '+' : ''}{netReturnPct.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Balances list */}
            <div className="space-y-1.5 pt-1 border-t border-border/50 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Starting Balance:</span>
                <span className="text-foreground">${ledger.initialBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp size={11} className="text-long" /> Realized P&L:
                </span>
                <span className={ledger.realizedPnl >= 0 ? 'text-long font-semibold' : 'text-short font-semibold'}>
                  {ledger.realizedPnl >= 0 ? '+' : ''}${ledger.realizedPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span className="text-foreground">Current Balance:</span>
                <span className="text-foreground">${ledger.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingDown size={11} className="text-primary" /> Floating / Unrealized:
                </span>
                <span className={ledger.unrealizedPnl >= 0 ? 'text-long' : 'text-short'}>
                  {ledger.unrealizedPnl >= 0 ? '+' : ''}${ledger.unrealizedPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <span className="text-muted-foreground">Used Margin:</span>
                <span className="text-foreground">${ledger.usedMargin.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Free Margin:</span>
                <span className="text-primary font-semibold">${ledger.freeMargin.toFixed(2)}</span>
              </div>
            </div>

            {/* Adjust starting balance input */}
            <div className="pt-2 border-t border-border/60">
              <span className="text-[10px] text-muted-foreground block mb-1">
                Edit Starting Balance ($):
              </span>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <DollarSign size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    min={1}
                    max={100000000}
                    step={500}
                    value={draftBalance}
                    onChange={(e) => setDraftBalance(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveBalance()}
                    className="w-full bg-secondary text-foreground text-xs font-mono pl-6 pr-2 py-1 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={handleSaveBalance}
                  className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-0.5"
                  title="Update initial starting balance"
                >
                  <Check size={12} /> Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
