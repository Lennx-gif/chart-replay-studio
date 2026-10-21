import { useState, useMemo, useEffect } from 'react';
import {
  saveSession,
  generateUUID,
  type BacktestSession,
  type DateFilterConfig,
  type StoredDataset,
} from '@/lib/db/localDatabase';
import type { OHLCVBar } from '@/lib/csvParser';
import { timeframeToLabel } from '@/lib/timeframeEngine';
import {
  X,
  Sparkles,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  Layers,
  Shuffle,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import { toast } from 'sonner';

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  dataset: StoredDataset | null;
  currentBars: OHLCVBar[];
  onSessionCreated: (session: BacktestSession) => void;
  defaultBalance?: number;
}

const BALANCE_PRESETS = [1000, 5000, 10000, 25000, 50000, 100000];

const LEVERAGE_OPTIONS = [
  { value: 1, label: '1:1 (Cash / Spot)' },
  { value: 10, label: '1:10 (Low)' },
  { value: 20, label: '1:20' },
  { value: 30, label: '1:30 (EU/UK Retail standard)' },
  { value: 50, label: '1:50 (US Retail standard)' },
  { value: 100, label: '1:100 (Standard Pro)' },
  { value: 200, label: '1:200' },
  { value: 500, label: '1:500 (High Leverage)' },
];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function CreateSessionModal({
  open,
  onClose,
  dataset,
  currentBars,
  onSessionCreated,
  defaultBalance = 10000,
}: CreateSessionModalProps) {
  const symbol = dataset?.symbol || 'DATA';
  const baseTf = dataset?.baseTimeframe || 60;

  // Form states
  const [name, setName] = useState('');
  const [balance, setBalance] = useState<number>(defaultBalance);
  const [leverage, setLeverage] = useState<number>(30);
  const [timeframe, setTimeframe] = useState<number>(baseTf);
  const [filterMode, setFilterMode] = useState<'all' | 'years' | 'months' | 'custom' | 'blind'>('all');
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [blindDays, setBlindDays] = useState(60);
  const [notes, setNotes] = useState('');

  // Extract detected years
  const availableYears = useMemo(() => {
    if (currentBars.length === 0) return [];
    const set = new Set<number>();
    for (let i = 0; i < currentBars.length; i += Math.max(1, Math.floor(currentBars.length / 500))) {
      set.add(new Date(currentBars[i].time * 1000).getUTCFullYear());
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [currentBars]);

  // Overall dates
  const datasetSpan = useMemo(() => {
    if (currentBars.length === 0) return null;
    const start = new Date(currentBars[0].time * 1000);
    const end = new Date(currentBars[currentBars.length - 1].time * 1000);
    return {
      startStr: start.toISOString().split('T')[0],
      endStr: end.toISOString().split('T')[0],
      startTime: currentBars[0].time,
      endTime: currentBars[currentBars.length - 1].time,
    };
  }, [currentBars]);

  // Initialize defaults on open
  useEffect(() => {
    if (open) {
      const now = new Date();
      setName(`${symbol} Session - ${now.toLocaleDateString()}`);
      setBalance(defaultBalance);
      setLeverage(30);
      setTimeframe(baseTf);
      setFilterMode('all');
      setSelectedYears(availableYears.length > 0 ? [availableYears[availableYears.length - 1]] : []);
      setSelectedMonths([]);
      if (datasetSpan) {
        setCustomStart(datasetSpan.startStr);
        setCustomEnd(datasetSpan.endStr);
      }
      setBlindDays(60);
      setNotes('');
    }
  }, [open, symbol, baseTf, defaultBalance, availableYears, datasetSpan]);

  if (!open) return null;

  const handleToggleYear = (y: number) => {
    setSelectedYears((prev) => (prev.includes(y) ? prev.filter((item) => item !== y) : [...prev, y]));
  };

  const handleToggleMonth = (m: number) => {
    setSelectedMonths((prev) => (prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m]));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a session name');
      return;
    }

    if (balance <= 0) {
      toast.error('Starting balance must be greater than 0');
      return;
    }

    let dateFilter: DateFilterConfig = { mode: filterMode };
    let initialTimestamp = currentBars[0]?.time || Math.floor(Date.now() / 1000);

    if (filterMode === 'years') {
      if (selectedYears.length === 0) {
        toast.error('Please select at least one year');
        return;
      }
      const minYear = Math.min(...selectedYears);
      const maxYear = Math.max(...selectedYears);
      dateFilter = {
        mode: 'years',
        startYear: minYear,
        endYear: maxYear,
      };
      // Find first bar in selected years
      const match = currentBars.find((b) => selectedYears.includes(new Date(b.time * 1000).getUTCFullYear()));
      if (match) initialTimestamp = match.time;
    } else if (filterMode === 'months') {
      if (selectedMonths.length === 0) {
        toast.error('Please select at least one month');
        return;
      }
      dateFilter = {
        mode: 'months',
        months: selectedMonths,
      };
      const match = currentBars.find((b) => selectedMonths.includes(new Date(b.time * 1000).getUTCMonth()));
      if (match) initialTimestamp = match.time;
    } else if (filterMode === 'custom') {
      const startSec = customStart ? Math.floor(new Date(customStart + 'T00:00:00Z').getTime() / 1000) : undefined;
      const endSec = customEnd ? Math.floor(new Date(customEnd + 'T23:59:59Z').getTime() / 1000) : undefined;
      dateFilter = {
        mode: 'custom',
        customStart: startSec,
        customEnd: endSec,
      };
      if (startSec) {
        const match = currentBars.find((b) => b.time >= startSec);
        if (match) initialTimestamp = match.time;
      }
    } else if (filterMode === 'blind') {
      const totalSec = blindDays * 86400;
      const minTime = datasetSpan?.startTime || 0;
      const maxTime = datasetSpan?.endTime || 0;
      const span = maxTime - minTime;
      let startSec = minTime;
      if (span > totalSec) {
        startSec = minTime + Math.floor(Math.random() * (span - totalSec));
      }
      const endSec = startSec + totalSec;
      dateFilter = {
        mode: 'custom',
        customStart: startSec,
        customEnd: endSec,
        blindWindowDays: blindDays,
      };
      const match = currentBars.find((b) => b.time >= startSec);
      if (match) initialTimestamp = match.time;
    } else {
      // mode: 'all'
      const defaultIdx = Math.min(50, currentBars.length - 1);
      initialTimestamp = currentBars[defaultIdx]?.time || currentBars[0]?.time || 0;
    }

    const session: BacktestSession = {
      id: generateUUID(),
      name: name.trim(),
      datasetId: dataset?.id || 'default',
      symbol,
      timeframe,
      currentTimestamp: initialTimestamp,
      speed: 1,
      stepMode: 'bar',
      stepMinutes: timeframe,
      dateFilter,
      drawings: [],
      orders: [],
      startingBalance: balance,
      leverage,
      notes: notes.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveSession(session);
    toast.success(`Session "${session.name}" created and loaded!`);
    onSessionCreated(session);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-foreground animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Create Backtest Session</h2>
              <p className="text-xs text-muted-foreground">
                Configure account balance, leverage, and designated Data Times for {symbol}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Session Name */}
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-1.5">
              Session Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2023 Trend Following Test"
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Account Balance & Leverage Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Account Starting Balance */}
            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <DollarSign size={13} className="text-primary" />
                Starting Balance ($)
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {BALANCE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBalance(p)}
                    className={`py-1 text-xs font-mono rounded border transition-all ${
                      balance === p
                        ? 'bg-primary/20 text-primary border-primary font-bold'
                        : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
                    }`}
                  >
                    ${p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={100}
                step={500}
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Account Leverage */}
            <div>
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <TrendingUp size={13} className="text-primary" />
                Leverage (Optional)
              </label>
              <select
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary h-[38px] mb-2"
              >
                {LEVERAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span>Margin required per 1.0 lot:</span>
                <span className="font-mono text-primary font-semibold">
                  ${(100000 / leverage).toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          {/* Timeframe Selection */}
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <Clock size={13} className="text-primary" />
              Starting Chart Timeframe
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { m: 1, label: '1m' },
                { m: 5, label: '5m' },
                { m: 15, label: '15m' },
                { m: 60, label: '1H' },
                { m: 240, label: '4H' },
                { m: 1440, label: '1D' },
              ].map(({ m, label }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTimeframe(m)}
                  className={`px-3 py-1 text-xs font-mono rounded-md border transition-all ${
                    timeframe === m
                      ? 'bg-primary/20 text-primary border-primary font-bold'
                      : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Data Times / Date Range Filtering */}
          <div className="border border-border/80 rounded-lg p-4 bg-secondary/20">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-primary" />
                Data Times (Date Range for Backtest)
              </label>
              {datasetSpan && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  Dataset: {datasetSpan.startStr} &rarr; {datasetSpan.endStr}
                </span>
              )}
            </div>

            {/* Filter Mode Tabs */}
            <div className="grid grid-cols-5 gap-1 bg-secondary/60 p-1 rounded-lg border border-border mb-4">
              {[
                { id: 'all' as const, label: 'All Data' },
                { id: 'years' as const, label: 'Years' },
                { id: 'months' as const, label: 'Months' },
                { id: 'custom' as const, label: 'Custom' },
                { id: 'blind' as const, label: 'Blind 🎲' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`py-1 text-xs font-medium rounded transition-colors ${
                    filterMode === tab.id
                      ? 'bg-primary text-primary-foreground font-semibold shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mode Specific Inputs */}
            {filterMode === 'all' && (
              <p className="text-xs text-muted-foreground">
                Replay will use the entire dataset ({currentBars.length.toLocaleString()} bars) with no date exclusions.
              </p>
            )}

            {filterMode === 'years' && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Select which years to include in this backtest:</p>
                <div className="flex flex-wrap gap-2">
                  {availableYears.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => handleToggleYear(yr)}
                      className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all ${
                        selectedYears.includes(yr)
                          ? 'bg-primary/20 text-primary border-primary font-bold shadow-sm'
                          : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterMode === 'months' && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Filter by calendar months (e.g. test seasonal performance):</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {MONTH_NAMES.map((name, idx) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleToggleMonth(idx)}
                      className={`py-1 rounded text-xs font-mono border transition-all ${
                        selectedMonths.includes(idx)
                          ? 'bg-primary/20 text-primary border-primary font-bold'
                          : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterMode === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    min={datasetSpan?.startStr}
                    max={datasetSpan?.endStr}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full bg-secondary text-foreground border border-border rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    min={datasetSpan?.startStr}
                    max={datasetSpan?.endStr}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full bg-secondary text-foreground border border-border rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {filterMode === 'blind' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Picks a random continuous time slice within the dataset for unbiased blind backtesting.
                </p>
                <div className="flex items-center gap-2">
                  {[30, 60, 90, 180].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBlindDays(d)}
                      className={`px-3 py-1 rounded text-xs font-mono border transition-all ${
                        blindDays === d
                          ? 'bg-primary/20 text-primary border-primary font-bold'
                          : 'bg-secondary text-secondary-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {d} Days
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes / Strategy Focus */}
          <div>
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-1.5">
              Session Goal / Strategy Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Testing 15m Fair Value Gap entries with 1:2 R:R targets and $200 risk per trade"
              rows={2}
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 glow-primary flex items-center gap-2 transition-all"
          >
            <Sparkles size={14} />
            Launch Backtest Session
          </button>
        </div>
      </div>
    </div>
  );
}
