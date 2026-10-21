import { useState, useMemo, useEffect } from 'react';
import {
  saveSession,
  listSessions,
  deleteSession,
  generateUUID,
  type BacktestSession,
  type DateFilterConfig,
  type StoredDataset,
} from '@/lib/db/localDatabase';
import type { OHLCVBar } from '@/lib/csvParser';
import {
  X,
  Plus,
  Play,
  Trash2,
  Calendar,
  Sparkles,
  Copy,
  Clock,
  CheckCircle2,
  Filter,
  DollarSign,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

interface SessionManagerModalProps {
  open: boolean;
  onClose: () => void;
  dataset: StoredDataset | null;
  currentBars: OHLCVBar[];
  activeSession: BacktestSession | null;
  onSelectSession: (session: BacktestSession) => void;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function SessionManagerModal({
  open,
  onClose,
  dataset,
  currentBars,
  activeSession,
  onSelectSession,
}: SessionManagerModalProps) {
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [sessionName, setSessionName] = useState('');
  const [startingBalance, setStartingBalance] = useState(10000);
  const [notes, setNotes] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'years' | 'months' | 'custom'>('all');
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Extract available years from current bars
  const availableYears = useMemo(() => {
    if (currentBars.length === 0) return [];
    const yearsSet = new Set<number>();
    for (let i = 0; i < currentBars.length; i += Math.max(1, Math.floor(currentBars.length / 500))) {
      const y = new Date(currentBars[i].time * 1000).getUTCFullYear();
      yearsSet.add(y);
    }
    const arr = Array.from(yearsSet).sort((a, b) => a - b);
    return arr;
  }, [currentBars]);

  // Overall dataset date span
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

  // Fetch saved sessions
  const refreshSessions = async () => {
    setLoading(true);
    try {
      const list = await listSessions(dataset?.id);
      setSessions(list);
    } catch {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refreshSessions();
      setIsCreating(false);
    }
  }, [open, dataset?.id]);

  // Set default values when opening create mode
  const handleOpenCreate = () => {
    const symbol = dataset?.symbol || 'DATA';
    setSessionName(`${symbol} Replay - ${new Date().toLocaleDateString()}`);
    setStartingBalance(10000);
    setNotes('');
    setFilterMode('all');
    setSelectedYears(availableYears.length > 0 ? [availableYears[0]] : []);
    setSelectedMonths([]);
    if (datasetSpan) {
      setCustomStart(datasetSpan.startStr);
      setCustomEnd(datasetSpan.endStr);
    }
    setIsCreating(true);
  };

  // Toggle year selection
  const toggleYear = (y: number) => {
    setSelectedYears((prev) =>
      prev.includes(y) ? prev.filter((item) => item !== y) : [...prev, y].sort((a, b) => a - b)
    );
  };

  // Toggle month selection
  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m].sort((a, b) => a - b)
    );
  };

  // Pick a random blind test window (e.g. random 30-60 days)
  const handleRandomWindow = () => {
    if (!datasetSpan || currentBars.length < 50) return;
    const totalSec = datasetSpan.endTime - datasetSpan.startTime;
    const windowSec = Math.min(totalSec, 60 * 86400); // 60 days
    const maxStart = datasetSpan.endTime - windowSec;
    const randomStart = datasetSpan.startTime + Math.floor(Math.random() * (maxStart - datasetSpan.startTime));
    const randomEnd = randomStart + windowSec;

    setFilterMode('custom');
    setCustomStart(new Date(randomStart * 1000).toISOString().split('T')[0]);
    setCustomEnd(new Date(randomEnd * 1000).toISOString().split('T')[0]);
    setSessionName(`Blind Test - ${new Date(randomStart * 1000).toLocaleDateString()}`);
    toast.success('Randomized historical window selected!');
  };

  // Create new session
  const handleSaveNewSession = async () => {
    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }

    const dateFilter: DateFilterConfig = {
      mode: filterMode,
      startYear: selectedYears.length > 0 ? selectedYears[0] : undefined,
      endYear: selectedYears.length > 0 ? selectedYears[selectedYears.length - 1] : undefined,
      months: selectedMonths,
      customStart: customStart ? Math.floor(new Date(`${customStart}T00:00:00Z`).getTime() / 1000) : undefined,
      customEnd: customEnd ? Math.floor(new Date(`${customEnd}T23:59:59Z`).getTime() / 1000) : undefined,
    };

    const newSession: BacktestSession = {
      id: generateUUID(),
      name: sessionName.trim(),
      datasetId: dataset?.id || 'default',
      symbol: dataset?.symbol || 'DATA',
      timeframe: dataset?.baseTimeframe || 60,
      currentTimestamp: dateFilter.customStart || currentBars[0]?.time || Math.floor(Date.now() / 1000),
      speed: 1,
      stepMode: 'bar',
      stepMinutes: dataset?.baseTimeframe || 60,
      dateFilter,
      drawings: [],
      orders: [],
      startingBalance,
      notes: notes.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await saveSession(newSession);
      toast.success(`Session "${newSession.name}" created!`);
      onSelectSession(newSession);
      onClose();
    } catch {
      toast.error('Failed to save session');
    }
  };

  // Duplicate session
  const handleDuplicate = async (s: BacktestSession) => {
    const clone: BacktestSession = {
      ...s,
      id: generateUUID(),
      name: `${s.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSession(clone);
    toast.success(`Duplicated "${s.name}"`);
    refreshSessions();
  };

  // Delete session
  const handleDelete = async (id: string, name: string) => {
    await deleteSession(id);
    toast.success(`Deleted "${name}"`);
    refreshSessions();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Calendar className="text-primary" size={18} />
            <h2 className="text-sm font-semibold text-foreground">
              {isCreating ? 'Create Backtest Session & Data Times' : 'Backtest Sessions Library'}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {!isCreating ? (
            /* Sessions List View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Saved Sessions</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Active dataset: <span className="font-mono text-primary">{dataset?.symbol || 'DATA'}</span> ({currentBars.length} bars)
                  </p>
                </div>
                <button
                  onClick={handleOpenCreate}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 transition-colors"
                >
                  <Plus size={14} />
                  New Backtest Session
                </button>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="py-12 text-center space-y-3 border border-dashed border-border rounded-lg p-6">
                  <Calendar size={32} className="mx-auto text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">No backtest sessions saved for this dataset yet.</p>
                  <button
                    onClick={handleOpenCreate}
                    className="px-3 py-1.5 bg-secondary text-secondary-foreground text-xs font-medium rounded hover:bg-accent transition-colors"
                  >
                    Create your first Data Times session
                  </button>
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {sessions.map((s) => {
                    const isActive = activeSession?.id === s.id;
                    const closedTrades = s.orders?.filter((o) => o.status === 'closed') || [];
                    const wins = closedTrades.filter((o) => (o.pnl || 0) > 0).length;
                    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
                    const totalPnl = closedTrades.reduce((sum, o) => sum + (o.pnl || 0), 0);

                    return (
                      <div
                        key={s.id}
                        className={`p-3.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                          isActive
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-secondary/30 hover:bg-secondary/60'
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground truncate">{s.name}</span>
                            {isActive && (
                              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                            <span>{s.symbol}</span>
                            <span>•</span>
                            <span>
                              {s.dateFilter?.mode === 'years'
                                ? `Years: ${s.dateFilter.startYear || ''}${s.dateFilter.endYear && s.dateFilter.endYear !== s.dateFilter.startYear ? ` - ${s.dateFilter.endYear}` : ''}`
                                : s.dateFilter?.mode === 'months'
                                ? `Months: ${s.dateFilter.months?.map((m) => MONTH_NAMES[m]).join(', ')}`
                                : s.dateFilter?.mode === 'custom'
                                ? 'Custom Window'
                                : 'Full Dataset'}
                            </span>
                            <span>•</span>
                            <span>Trades: {closedTrades.length}</span>
                            {closedTrades.length > 0 && (
                              <>
                                <span>•</span>
                                <span>WR: {winRate.toFixed(0)}%</span>
                                <span>•</span>
                                <span className={totalPnl >= 0 ? 'text-long font-semibold' : 'text-short font-semibold'}>
                                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              onSelectSession(s);
                              onClose();
                            }}
                            className="px-2.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded hover:bg-primary/90 flex items-center gap-1 transition-colors"
                            title="Load & Play Session"
                          >
                            <Play size={12} />
                            Load
                          </button>
                          <button
                            onClick={() => handleDuplicate(s)}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
                            title="Duplicate Session"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.name)}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10 transition-colors"
                            title="Delete Session"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Create Session & Configure Data Times */
            <div className="space-y-4">
              {/* Session Name */}
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Session Name</label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. 2021 Bull Run Strategy Test"
                  className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary"
                />
              </div>

              {/* Data Times Configuration */}
              <div className="panel p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-foreground">Data Times (Time-Window Filter)</span>
                  </div>
                  <button
                    onClick={handleRandomWindow}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 font-mono font-medium"
                    title="Pick random 60-day historical window"
                  >
                    <Sparkles size={11} />
                    Random Blind Window
                  </button>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Select which historical year(s) or month(s) from your data to backtest without lookahead bias.
                </p>

                {/* Filter Mode Tabs */}
                <div className="grid grid-cols-4 gap-1 bg-secondary/60 p-1 rounded-md text-[11px] font-medium">
                  {[
                    { id: 'all', label: 'All Data' },
                    { id: 'years', label: 'By Year(s)' },
                    { id: 'months', label: 'By Month(s)' },
                    { id: 'custom', label: 'Custom Range' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterMode(tab.id as any)}
                      className={`py-1 rounded transition-colors ${
                        filterMode === tab.id
                          ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Years Selector */}
                {filterMode === 'years' && (
                  <div className="space-y-2 pt-1 animate-in fade-in duration-100">
                    <span className="text-[11px] text-muted-foreground block">Select backtesting year(s):</span>
                    <div className="flex flex-wrap gap-1.5">
                      {availableYears.map((y) => {
                        const selected = selectedYears.includes(y);
                        return (
                          <button
                            key={y}
                            onClick={() => toggleYear(y)}
                            className={`px-3 py-1 text-xs font-mono rounded-md border transition-colors ${
                              selected
                                ? 'bg-primary/20 border-primary text-primary font-bold'
                                : 'bg-secondary/40 border-border text-foreground hover:bg-secondary'
                            }`}
                          >
                            {y}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Months Selector */}
                {filterMode === 'months' && (
                  <div className="space-y-2 pt-1 animate-in fade-in duration-100">
                    <span className="text-[11px] text-muted-foreground block">Select active month(s):</span>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {MONTH_NAMES.map((m, idx) => {
                        const selected = selectedMonths.includes(idx);
                        return (
                          <button
                            key={m}
                            onClick={() => toggleMonth(idx)}
                            className={`py-1 text-xs font-mono rounded border transition-colors text-center ${
                              selected
                                ? 'bg-primary/20 border-primary text-primary font-bold'
                                : 'bg-secondary/40 border-border text-foreground hover:bg-secondary'
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Custom Range */}
                {filterMode === 'custom' && (
                  <div className="grid grid-cols-2 gap-3 pt-1 animate-in fade-in duration-100">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase font-mono mb-1 block">Start Date</label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase font-mono mb-1 block">End Date</label>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Starting Capital & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Starting Balance</label>
                  <div className="relative">
                    <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="number"
                      step={500}
                      min={100}
                      max={100000000}
                      value={startingBalance}
                      onChange={(e) => setStartingBalance(Number(e.target.value))}
                      className="w-full bg-secondary border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground mb-1 block">Strategy Notes / Rules</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. 15m breakout, 2:1 RR rule"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewSession}
                  className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 size={14} />
                  Start & Save Session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
