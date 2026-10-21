import { useState } from 'react';
import { Settings, DollarSign, Check, Loader2, User } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { toast } from 'sonner';

export function BalanceSettings() {
  const { profile, updateStartingBalance, updateUserProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(String(profile?.startingBalance || 10000));
  const [displayName, setDisplayName] = useState(profile?.displayName || 'Local Trader');
  const [riskPct, setRiskPct] = useState(String(profile?.riskPercentage || 1));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = parseFloat(balance);
    const risk = parseFloat(riskPct);

    if (isNaN(val) || val <= 0 || val > 100_000_000) {
      toast.error('Enter a valid balance (1 – 100,000,000)');
      return;
    }
    if (isNaN(risk) || risk <= 0 || risk > 50) {
      toast.error('Enter a valid risk % (0.1 – 50)');
      return;
    }

    setSaving(true);
    try {
      await updateStartingBalance(val);
      await updateUserProfile({
        displayName: displayName.trim() || 'Local Trader',
        riskPercentage: risk,
      });
      toast.success(`Account settings updated: $${val.toLocaleString()}`);
      setOpen(false);
    } catch {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        className="toolbar-btn text-xs flex items-center gap-1"
        onClick={() => {
          setBalance(String(profile?.startingBalance || 10000));
          setDisplayName(profile?.displayName || 'Local Trader');
          setRiskPct(String(profile?.riskPercentage || 1));
          setOpen(!open);
        }}
        title="Trading Account Settings"
      >
        <Settings size={13} />
        <span className="font-mono">${(profile?.startingBalance || 10000).toLocaleString()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-150">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Account & Risk Settings</span>
            <span className="text-[10px] text-primary font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10">Offline Local</span>
          </div>

          <div className="p-3 space-y-3">
            {/* Display Name */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Trader Profile
              </label>
              <div className="relative">
                <User size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  maxLength={30}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-background border border-border rounded pl-6 pr-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                  placeholder="Trader name"
                />
              </div>
            </div>

            {/* Starting balance */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Starting Capital
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

            {/* Risk per trade */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Default Risk Per Trade (%)
              </label>
              <input
                type="number"
                min={0.1}
                max={50}
                step={0.5}
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-1.5 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save Account Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
