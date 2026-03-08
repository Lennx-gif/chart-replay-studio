import { useState } from 'react';
import { Settings, DollarSign, LogOut, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function BalanceSettings() {
  const { profile, updateStartingBalance, signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(String(profile?.starting_balance || 10000));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = parseFloat(balance);
    if (isNaN(val) || val <= 0 || val > 100_000_000) {
      toast.error('Enter a valid balance (1 – 100,000,000)');
      return;
    }
    setSaving(true);
    try {
      await updateStartingBalance(val);
      toast.success(`Starting balance set to $${val.toLocaleString()}`);
      setOpen(false);
    } catch {
      toast.error('Failed to update balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        className="toolbar-btn text-xs flex items-center gap-1"
        onClick={() => { setBalance(String(profile?.starting_balance || 10000)); setOpen(!open); }}
        title="Account settings"
      >
        <Settings size={13} />
        <span className="font-mono">${(profile?.starting_balance || 10000).toLocaleString()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Account Settings</span>
          </div>

          <div className="p-3 space-y-3">
            {/* User info */}
            <div className="text-[10px] text-muted-foreground truncate">
              {user?.email}
            </div>

            {/* Starting balance */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Starting Balance
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    min={1}
                    max={100000000}
                    step={100}
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full bg-background border border-border rounded pl-6 pr-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <button
                  className="toolbar-btn text-xs px-2"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
              </div>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-1">
              {[1000, 5000, 10000, 25000, 50000, 100000].map((v) => (
                <button
                  key={v}
                  onClick={() => setBalance(String(v))}
                  className="px-2 py-0.5 text-[10px] font-mono rounded bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  ${v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>

            {/* Sign out */}
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 rounded py-1.5 transition-colors"
            >
              <LogOut size={12} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
