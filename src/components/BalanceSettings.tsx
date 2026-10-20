import { useState } from 'react';
import { Settings, DollarSign, Check } from 'lucide-react';
import { toast } from 'sonner';

interface BalanceSettingsProps {
  balance: number;
  onBalanceChange: (balance: number) => void;
}

/** Starting balance for this session. Only affects equity and stats, not past trades. */
export function BalanceSettings({ balance, onBalanceChange }: BalanceSettingsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(balance));

  const handleSave = () => {
    const val = parseFloat(draft);
    if (isNaN(val) || val <= 0 || val > 100_000_000) {
      toast.error('Enter a valid balance (1 – 100,000,000)');
      return;
    }
    onBalanceChange(val);
    toast.success(`Starting balance set to $${val.toLocaleString()}`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        className="toolbar-btn text-xs flex items-center gap-1"
        onClick={() => { setDraft(String(balance)); setOpen(!open); }}
        title="Starting balance"
      >
        <Settings size={13} />
        <span className="font-mono">${balance.toLocaleString()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Starting balance</span>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="number"
                  min={1}
                  max={100000000}
                  step={100}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  className="w-full bg-background border border-border rounded pl-6 pr-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <button className="toolbar-btn text-xs px-2" onClick={handleSave} title="Apply">
                <Check size={12} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {[1000, 5000, 10000, 25000, 50000, 100000].map((v) => (
                <button
                  key={v}
                  onClick={() => setDraft(String(v))}
                  className="px-2 py-0.5 text-[10px] font-mono rounded bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  ${v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
