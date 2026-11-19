import { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  X,
  Play,
  Check,
  CalendarRange,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { DatasetRecord, SessionRecord, DateRangeMode } from '@/lib/db';
import { createSession } from '@/lib/store';
import { formatTimeframe } from '@/lib/replay';

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  dataset: DatasetRecord | null;
  datasets?: DatasetRecord[];
  onCreated: (session: SessionRecord) => void;
  defaultStartingBalance?: number;
}

const BALANCE_PRESETS = [1000, 5000, 10000, 25000, 50000, 100000];
const LEVERAGE_OPTIONS = [
  { value: 1, label: '1:1 (Cash / Spot)' },
  { value: 10, label: '1:10' },
  { value: 20, label: '1:20' },
  { value: 30, label: '1:30 (Retail FX)' },
  { value: 50, label: '1:50' },
  { value: 100, label: '1:100 (Pro)' },
  { value: 200, label: '1:200' },
  { value: 500, label: '1:500 (Max)' },
];

const TIMEFRAME_OPTIONS = [
  { minutes: 1, label: '1m' },
  { minutes: 5, label: '5m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1H' },
  { minutes: 240, label: '4H' },
  { minutes: 1440, label: '1D' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const toISODate = (unixSec: number) => new Date(unixSec * 1000).toISOString().slice(0, 10);

export function CreateSessionModal({
  open,
  onClose,
  dataset,
  datasets,
  onCreated,
  defaultStartingBalance = 10000,
}: CreateSessionModalProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(dataset?.id || datasets?.[0]?.id || '');

  useEffect(() => {
    if (dataset) setSelectedDatasetId(dataset.id);
    else if (datasets && datasets.length > 0 && !selectedDatasetId) setSelectedDatasetId(datasets[0].id);
  }, [dataset, datasets, selectedDatasetId]);

  const currentDataset = useMemo(() => {
    return (datasets?.find((d) => d.id === selectedDatasetId) || dataset || datasets?.[0]) ?? null;
  }, [datasets, selectedDatasetId, dataset]);

  if (!open || !currentDataset) return null;

  return (
    <CreateSessionModalInner
      open={open}
      onClose={onClose}
      dataset={currentDataset}
      datasets={datasets}
      onSelectDatasetId={setSelectedDatasetId}
      onCreated={onCreated}
      defaultStartingBalance={defaultStartingBalance}
    />
  );
}

function CreateSessionModalInner({
  open,
  onClose,
  dataset,
  datasets,
  onSelectDatasetId,
  onCreated,
  defaultStartingBalance = 10000,
}: CreateSessionModalProps & { onSelectDatasetId: (id: string) => void }) {
  const minDate = toISODate(dataset.firstTime);
  const maxDate = toISODate(dataset.lastTime);

  const availableYears = useMemo(() => {
    const startY = new Date(dataset.firstTime * 1000).getUTCFullYear();
    const endY = new Date(dataset.lastTime * 1000).getUTCFullYear();
    const yrs: number[] = [];
    for (let y = startY; y <= endY; y++) yrs.push(y);
    return yrs;
  }, [dataset]);

  // Session form state
  const [sessionName, setSessionName] = useState('');
  const [balance, setBalance] = useState(defaultStartingBalance);
  const [leverage, setLeverage] = useState(30);
  const [timeframe, setTimeframe] = useState(dataset.baseTimeframe);

  // Date range mode: DEFAULT is 'daily' (choose exact start and end day/month/year)
  const [rangeMode, setRangeMode] = useState<DateRangeMode>('daily');
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);

  // Year mode selection
  const [selectedYear, setSelectedYear] = useState<number>(availableYears[availableYears.length - 1] || 2024);

  // Month mode selection
  const [selectedMonthYear, setSelectedMonthYear] = useState<number>(availableYears[availableYears.length - 1] || 2024);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date(dataset.lastTime * 1000).getUTCMonth());

  const [loading, setLoading] = useState(false);

  // Synchronize start & end date when mode changes
  useEffect(() => {
    if (rangeMode === 'all') {
      setStartDate(minDate);
      setEndDate(maxDate);
    } else if (rangeMode === 'yearly') {
      const s = `${selectedYear}-01-01`;
      const e = `${selectedYear}-12-31`;
      setStartDate(s < minDate ? minDate : s);
      setEndDate(e > maxDate ? maxDate : e);
    } else if (rangeMode === 'monthly') {
      const lastDay = new Date(Date.UTC(selectedMonthYear, selectedMonth + 1, 0)).getUTCDate();
      const pad = (n: number) => String(n).padStart(2, '0');
      const s = `${selectedMonthYear}-${pad(selectedMonth + 1)}-01`;
      const e = `${selectedMonthYear}-${pad(selectedMonth + 1)}-${pad(lastDay)}`;
      setStartDate(s < minDate ? minDate : s);
      setEndDate(e > maxDate ? maxDate : e);
    }
  }, [rangeMode, selectedYear, selectedMonthYear, selectedMonth, minDate, maxDate]);

  // Calculate days in selected window
  const daysDiff = useMemo(() => {
    try {
      const t1 = new Date(startDate).getTime();
      const t2 = new Date(endDate).getTime();
      const diff = Math.max(1, Math.round((t2 - t1) / (1000 * 3600 * 24)) + 1);
      return isNaN(diff) ? 1 : diff;
    } catch {
      return 1;
    }
  }, [startDate, endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const finalName = sessionName.trim() || `${dataset.name} · ${startDate} → ${endDate}`;
      const session = await createSession({
        name: finalName,
        dataset,
        startingBalance: balance,
        leverage,
        timeframe,
        dateRangeMode: rangeMode,
        startDate: rangeMode === 'all' ? undefined : startDate,
        endDate: rangeMode === 'all' ? undefined : endDate,
      });
      onCreated(session);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPreset = (days: number) => {
    const endMs = new Date(maxDate).getTime();
    const startMs = Math.max(new Date(minDate).getTime(), endMs - days * 86400 * 1000);
    setStartDate(new Date(startMs).toISOString().slice(0, 10));
    setEndDate(maxDate);
    setRangeMode('daily');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">Create Backtesting Session</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Dataset Info Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-secondary/40 border border-border text-xs">
            <div className="min-w-0 flex-1">
              {datasets && datasets.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-xs shrink-0">Dataset:</span>
                  <select
                    value={dataset.id}
                    onChange={(e) => onSelectDatasetId(e.target.value)}
                    className="bg-card text-foreground font-semibold text-xs border border-border rounded px-2 py-1 max-w-[220px] truncate focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({formatTimeframe(d.baseTimeframe)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="font-semibold text-foreground text-sm">{dataset.name}</span>
              )}
              <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                Base TF: {formatTimeframe(dataset.baseTimeframe)} · {dataset.barCount.toLocaleString()} bars
              </div>
            </div>
            <div className="font-mono text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shrink-0 self-start sm:self-center">
              {minDate} → {maxDate}
            </div>
          </div>

          {/* Session Name */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Session Name
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder={`${dataset.name} · ${startDate} Backtest`}
              className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Starting Balance & Leverage Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Balance */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Account Balance
              </label>
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                {BALANCE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBalance(p)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                      balance === p
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ${(p / 1000).toFixed(0)}k
                  </button>
                ))}
              </div>
              <div className="relative">
                <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={balance}
                  onChange={(e) => setBalance(Math.max(100, Number(e.target.value)))}
                  className="w-full bg-secondary text-foreground border border-border rounded-md pl-7 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Leverage */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Account Leverage
              </label>
              <select
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer mt-5"
              >
                {LEVERAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Initial Timeframe */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Initial Replay Timeframe
            </label>
            <div className="flex items-center gap-1 flex-wrap">
              {TIMEFRAME_OPTIONS.map((tf) => (
                <button
                  key={tf.minutes}
                  type="button"
                  onClick={() => setTimeframe(tf.minutes)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                    timeframe === tf.minutes
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Selection ("Data Times") */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <CalendarRange size={13} className="text-primary" />
                Data Times (Date Range)
              </label>
              <span className="text-[10px] font-mono text-primary font-medium">
                {daysDiff} days selected
              </span>
            </div>

            {/* Range Mode Switcher */}
            <div className="flex items-center gap-1 p-0.5 bg-secondary rounded-lg border border-border mb-3 text-xs">
              <button
                type="button"
                onClick={() => setRangeMode('daily')}
                className={`flex-1 py-1 rounded-md text-center font-medium transition-all ${
                  rangeMode === 'daily'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Daily / Custom
              </button>
              <button
                type="button"
                onClick={() => setRangeMode('yearly')}
                className={`flex-1 py-1 rounded-md text-center font-medium transition-all ${
                  rangeMode === 'yearly'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Year-Based
              </button>
              <button
                type="button"
                onClick={() => setRangeMode('monthly')}
                className={`flex-1 py-1 rounded-md text-center font-medium transition-all ${
                  rangeMode === 'monthly'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setRangeMode('all')}
                className={`flex-1 py-1 rounded-md text-center font-medium transition-all ${
                  rangeMode === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Data
              </button>
            </div>

            {/* Daily / Custom Date Mode (DEFAULT) */}
            {rangeMode === 'daily' && (
              <div className="space-y-2.5 bg-secondary/30 p-3 rounded-lg border border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                      Start Day / Month / Year
                    </label>
                    <input
                      type="date"
                      min={minDate}
                      max={maxDate}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-secondary text-foreground border border-border rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                      End Day / Month / Year
                    </label>
                    <input
                      type="date"
                      min={startDate || minDate}
                      max={maxDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-secondary text-foreground border border-border rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-muted-foreground font-mono">Quick:</span>
                  {[
                    { days: 30, label: 'Last 30d' },
                    { days: 90, label: 'Last 90d' },
                    { days: 180, label: 'Last 180d' },
                    { days: 365, label: 'Last 1 Year' },
                  ].map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => handleQuickPreset(p.days)}
                      className="px-2 py-0.5 text-[10px] bg-secondary text-muted-foreground hover:text-foreground rounded border border-border"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Year-Based Mode */}
            {rangeMode === 'yearly' && (
              <div className="space-y-2 bg-secondary/30 p-3 rounded-lg border border-border">
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Select Target Year
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {availableYears.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setSelectedYear(y)}
                      className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-all ${
                        selectedYear === y
                          ? 'bg-primary text-primary-foreground font-bold border-primary shadow-sm'
                          : 'bg-secondary text-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground pt-1">
                  Range: Jan 1, {selectedYear} → Dec 31, {selectedYear}
                </div>
              </div>
            )}

            {/* Monthly Mode */}
            {rangeMode === 'monthly' && (
              <div className="space-y-2.5 bg-secondary/30 p-3 rounded-lg border border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                      Year
                    </label>
                    <select
                      value={selectedMonthYear}
                      onChange={(e) => setSelectedMonthYear(Number(e.target.value))}
                      className="w-full bg-secondary text-foreground border border-border rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      {availableYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                      Month
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="w-full bg-secondary text-foreground border border-border rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={m} value={idx}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground pt-1">
                  Range: {MONTH_NAMES[selectedMonth]} 1, {selectedMonthYear} → End of month
                </div>
              </div>
            )}

            {/* All Data Mode */}
            {rangeMode === 'all' && (
              <div className="bg-secondary/30 p-3 rounded-lg border border-border text-xs text-muted-foreground font-mono">
                Replaying all {dataset.barCount.toLocaleString()} bars from {minDate} to {maxDate}.
              </div>
            )}
          </div>

          {/* Telemetry Preview Summary */}
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <span className="text-foreground font-medium">Replay Window</span>
            </div>
            <div className="font-mono text-primary font-semibold">
              {startDate} → {endDate} ({daysDiff} days)
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Play size={13} />
              {loading ? 'Creating...' : 'Create & Launch Replay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
