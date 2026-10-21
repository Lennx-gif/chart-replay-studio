import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  Database,
  Download,
  HardDrive,
  Play,
  Plus,
  Trash2,
  Upload,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Layers,
  BookOpen,
  Calendar,
  Search,
  Sparkles,
  ShieldCheck,
  Percent,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { toast } from 'sonner';
import { FileUpload } from '@/components/FileUpload';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { parseCSV } from '@/lib/csvParser';
import type { DatasetRecord, SessionRecord } from '@/lib/db';
import { formatTimeframe } from '@/lib/replay';
import { installSampleDataset } from '@/lib/sampleData';
import { calculateStats, type Order } from '@/lib/tradeEngine';
import {
  DEFAULT_STARTING_BALANCE,
  createSession,
  deleteDataset,
  deleteSession,
  duplicateSession,
  exportBackup,
  getSetting,
  importBackup,
  listDatasets,
  listSessions,
  requestPersistentStorage,
  saveDataset,
  setSetting,
  storageEstimate,
} from '@/lib/store';

type Pending = { kind: 'session'; item: SessionRecord } | { kind: 'dataset'; item: DatasetRecord } | null;
type DashboardTab = 'sessions' | 'datasets' | 'telemetry';

const fmtDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const fmtBytes = (n: number) =>
  n > 1e9
    ? `${(n / 1e9).toFixed(1)} GB`
    : n > 1e6
    ? `${(n / 1e6).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1e3))} KB`;

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export default function Home() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [balance, setBalance] = useState(DEFAULT_STARTING_BALANCE);
  const [importing, setImporting] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('sessions');
  const [searchQuery, setSearchQuery] = useState('');

  // Session creation modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalDataset, setCreateModalDataset] = useState<DatasetRecord | null>(null);

  const backupInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [s, d] = await Promise.all([listSessions(), listDatasets()]);
    setSessions(s);
    setDatasets(d);
    setUsage(await storageEstimate());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    void getSetting('defaultStartingBalance', DEFAULT_STARTING_BALANCE).then(setBalance);
    void requestPersistentStorage();
  }, [refresh]);

  // Aggregate telemetry calculation across all sessions
  const aggregateTelemetry = useMemo(() => {
    let allOrders: Order[] = [];
    let totalPnl = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalClosedTrades = 0;

    sessions.forEach((s) => {
      const closed = (s.orders || []).filter((o) => o.status === 'closed' && o.pnl != null);
      if (closed.length > 0) {
        allOrders = allOrders.concat(closed);
        closed.forEach((o) => {
          totalClosedTrades++;
          totalPnl += o.pnl || 0;
          if ((o.pnl || 0) > 0) totalWins++;
          else if ((o.pnl || 0) < 0) totalLosses++;
        });
      } else {
        totalClosedTrades += s.closedTrades || 0;
        totalPnl += s.realizedPnl || 0;
      }
    });

    const winRate = totalClosedTrades > 0 ? (totalWins / totalClosedTrades) * 100 : 0;
    const globalStats = calculateStats(allOrders, balance);

    return {
      totalSessions: sessions.length,
      totalDatasets: datasets.length,
      totalBars: datasets.reduce((sum, d) => sum + d.barCount, 0),
      totalTrades: totalClosedTrades,
      totalWins,
      totalLosses,
      winRate,
      totalPnl,
      profitFactor: globalStats.profitFactor,
      allOrders,
    };
  }, [sessions, datasets, balance]);

  const handleStartQuickSession = async (dataset: DatasetRecord) => {
    try {
      const session = await createSession({ name: '', dataset, startingBalance: balance });
      navigate(`/session/${session.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create session');
    }
  };

  const handleOpenCreateModal = (dataset?: DatasetRecord) => {
    if (datasets.length === 0) {
      toast.info('Please load or import a dataset first to configure a backtest session');
      setActiveTab('datasets');
      return;
    }
    setCreateModalDataset(dataset || datasets[0]);
    setCreateModalOpen(true);
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const bars = await parseCSV(file);
      const name = file.name.replace(/\.csv$/i, '');
      const dataset = await saveDataset(name, bars);
      toast.success(`Imported ${bars.length.toLocaleString()} bars from ${file.name}`);
      await refresh();
      // Open advanced session maker immediately
      setCreateModalDataset(dataset);
      setCreateModalOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to parse CSV');
    } finally {
      setImporting(false);
    }
  };

  const handleLoadSample = async (type: 'EURUSD' | 'BTCUSD') => {
    setLoadingSample(type);
    try {
      const dataset = await installSampleDataset(type);
      toast.success(`Loaded sample dataset: ${dataset.name}`);
      await refresh();
      setCreateModalDataset(dataset);
      setCreateModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to install sample dataset');
    } finally {
      setLoadingSample(null);
    }
  };

  const handleBalance = async (value: string) => {
    const n = parseFloat(value);
    if (!isNaN(n) && n > 0 && n <= 100_000_000) {
      setBalance(n);
      await setSetting('defaultStartingBalance', n);
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    try {
      if (pending.kind === 'session') {
        await deleteSession(pending.item.id);
        toast.success(`Deleted "${pending.item.name}"`);
      } else if (!(await deleteDataset(pending.item.id))) {
        toast.error('Delete the sessions that use this data first');
      } else {
        toast.success(`Removed "${pending.item.name}"`);
      }
    } catch {
      toast.error('Delete failed');
    }
    setPending(null);
    await refresh();
  };

  const handleDuplicate = async (s: SessionRecord) => {
    await duplicateSession(s.id);
    await refresh();
    toast.success('Session duplicated');
  };

  const handleExport = async () => {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-replay-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Backup failed');
    }
  };

  const handleRestore = async (file: File) => {
    try {
      const summary = await importBackup(JSON.parse(await file.text()));
      toast.success(`Restored ${summary.sessions} session(s) and ${summary.datasets} dataset(s)`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read backup');
    }
  };

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-lg shadow-primary/20 text-primary-foreground font-black text-lg">
              CR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Chart Replay Studio
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
                  Local-First Engine
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <HardDrive size={12} className="text-primary" />
                IndexedDB offline storage on device · No auth or cloud server required
                {usage && usage.quota > 0 && (
                  <span className="font-mono text-foreground/80">· {fmtBytes(usage.usage)} used</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20 cursor-pointer active:scale-95"
              onClick={() => handleOpenCreateModal()}
            >
              <Plus size={14} className="stroke-[3]" />
              <span>Create Backtest Session</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                className="toolbar-btn text-xs gap-1.5"
                onClick={handleExport}
                title="Download all sessions and datasets as a single JSON file"
              >
                <Download size={13} /> Back up
              </button>
              <button
                className="toolbar-btn text-xs gap-1.5"
                onClick={() => backupInput.current?.click()}
                title="Restore sessions and data from JSON backup"
              >
                <Upload size={13} /> Restore
              </button>
              <input
                ref={backupInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleRestore(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </header>

        {/* Hero Telemetry Metric Tiles */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="panel p-3.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
              <span>Sessions</span>
              <Layers size={12} className="text-primary" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">{aggregateTelemetry.totalSessions}</div>
            <div className="text-[10px] text-muted-foreground truncate">Backtest replays</div>
          </div>

          <div className="panel p-3.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
              <span>Datasets</span>
              <Database size={12} className="text-primary" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">{aggregateTelemetry.totalDatasets}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {aggregateTelemetry.totalBars.toLocaleString()} total bars
            </div>
          </div>

          <div className="panel p-3.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
              <span>Total Trades</span>
              <BarChart3 size={12} className="text-primary" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">{aggregateTelemetry.totalTrades}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {aggregateTelemetry.totalWins}W · {aggregateTelemetry.totalLosses}L
            </div>
          </div>

          <div className="panel p-3.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
              <span>Win Rate</span>
              <Percent size={12} className="text-primary" />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                aggregateTelemetry.winRate >= 50 ? 'text-long' : 'text-short'
              }`}
            >
              {aggregateTelemetry.totalTrades > 0 ? `${aggregateTelemetry.winRate.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">Across all sessions</div>
          </div>

          <div className="panel p-3.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
              <span>Realized P&L</span>
              <TrendingUp size={12} className="text-primary" />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                aggregateTelemetry.totalPnl >= 0 ? 'text-long' : 'text-short'
              }`}
            >
              {aggregateTelemetry.totalTrades > 0
                ? `${aggregateTelemetry.totalPnl >= 0 ? '+' : ''}$${aggregateTelemetry.totalPnl.toFixed(2)}`
                : '$0.00'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">Cumulative return</div>
          </div>

          <div className="panel p-3.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
              <span>Profit Factor</span>
              <ShieldCheck size={12} className="text-primary" />
            </div>
            <div className="text-xl font-bold font-mono text-primary">
              {aggregateTelemetry.profitFactor === Infinity
                ? '∞'
                : aggregateTelemetry.profitFactor > 0
                ? aggregateTelemetry.profitFactor.toFixed(2)
                : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">System edge</div>
          </div>
        </section>

        {/* Dashboard Tabbed Navigation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-2">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/50 border border-border w-fit">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'sessions'
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers size={13} />
              <span>Sessions</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/20">
                {sessions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('datasets')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'datasets'
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Database size={13} />
              <span>Datasets & Data Times</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/20">
                {datasets.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 size={13} />
              <span>Telemetry & Journal</span>
            </button>
          </div>

          {activeTab === 'sessions' && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-secondary/80 text-foreground border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                onClick={() => handleOpenCreateModal()}
                className="toolbar-btn text-xs gap-1.5"
                title="Create session from loaded data"
              >
                <Plus size={13} /> New Session
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Replay Sessions */}
        {activeTab === 'sessions' && (
          <section className="space-y-4">
            {!loaded ? null : filteredSessions.length === 0 ? (
              <div className="panel p-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center mx-auto text-primary">
                  <Play size={20} className="ml-1" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-base font-bold text-foreground">No replay sessions found</h3>
                  <p className="text-xs text-muted-foreground">
                    Create a backtest session by picking a specific date range, leverage, and starting balance, or import
                    data from your local drive.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => handleOpenCreateModal()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                  >
                    <Plus size={14} className="stroke-[3]" />
                    <span>Create Session</span>
                  </button>
                  <button
                    onClick={() => handleLoadSample('EURUSD')}
                    disabled={loadingSample !== null}
                    className="toolbar-btn text-xs gap-1.5"
                  >
                    <Sparkles size={13} className="text-primary" />
                    <span>Load EURUSD Sample</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSessions.map((s) => {
                  const pct = s.totalBars > 1 ? ((s.position - 1) / (s.totalBars - 1)) * 100 : 0;
                  return (
                    <div
                      key={s.id}
                      className="panel p-4 group cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 flex flex-col justify-between"
                      onClick={() => navigate(`/session/${s.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/session/${s.id}`);
                      }}
                    >
                      <div>
                        {/* Title & Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                              {s.name}
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <span className="font-semibold text-foreground/90">{s.symbol}</span>
                              <span>·</span>
                              <span className="text-primary">{formatTimeframe(s.timeframe)}</span>
                              {s.leverage && (
                                <>
                                  <span>·</span>
                                  <span className="text-[10px] px-1 rounded bg-secondary text-muted-foreground">
                                    1:{s.leverage}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button
                              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                              title="Duplicate session"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDuplicate(s);
                              }}
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Delete session"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPending({ kind: 'session', item: s });
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Date Range Badge */}
                        {s.startDate && s.endDate && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-secondary/40 px-2 py-0.5 rounded border border-border/50 w-fit">
                            <Calendar size={10} className="text-primary" />
                            <span>
                              {s.startDate} → {s.endDate}
                            </span>
                          </div>
                        )}

                        {/* Progress Bar */}
                        <div className="mt-3.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                            <span>Replay Progress</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full transition-all"
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Footer Metrics */}
                      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] font-mono">
                        <div className="text-muted-foreground">
                          {s.closedTrades} {s.closedTrades === 1 ? 'trade' : 'trades'}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={s.realizedPnl >= 0 ? 'text-long font-semibold' : 'text-short font-semibold'}>
                            {s.closedTrades > 0
                              ? `${s.realizedPnl >= 0 ? '+' : ''}$${s.realizedPnl.toFixed(2)}`
                              : '$0.00'}
                          </span>
                          <span className="flex items-center gap-1 text-primary text-xs font-semibold group-hover:translate-x-0.5 transition-transform">
                            <Play size={11} className="fill-current" /> Resume
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Datasets & Data Times */}
        {activeTab === 'datasets' && (
          <section className="space-y-6">
            {/* Quick Sample Ingestion Banner */}
            <div className="panel p-4 sm:p-5 bg-gradient-to-r from-card to-secondary/30 border-primary/20 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    Instant Backtest: Bundled Market Datasets
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  Zero upload required · 1-click loading
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Want to test immediately? Load pre-packaged institutional-grade price action with tick-accurate OHLCV bars.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  onClick={() => handleLoadSample('EURUSD')}
                  disabled={loadingSample !== null}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/50 text-xs font-medium text-foreground transition-all cursor-pointer"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>EURUSD · 1H Timeframe (1,200 bars)</span>
                  {loadingSample === 'EURUSD' && <span className="animate-spin text-xs">⏳</span>}
                </button>
                <button
                  onClick={() => handleLoadSample('BTCUSD')}
                  disabled={loadingSample !== null}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/50 text-xs font-medium text-foreground transition-all cursor-pointer"
                >
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>BTCUSD · 1D Timeframe (730 bars)</span>
                  {loadingSample === 'BTCUSD' && <span className="animate-spin text-xs">⏳</span>}
                </button>
              </div>
            </div>

            {/* Import & Storage Section */}
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2.5">
                  Import Custom CSV Price Data
                </h3>
                <FileUpload onFileSelected={handleFile} isLoading={importing} />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    Default Starting Balance ($)
                    <input
                      type="number"
                      min={1}
                      step={100}
                      defaultValue={balance}
                      key={balance}
                      onBlur={(e) => void handleBalance(e.target.value)}
                      className="w-28 bg-secondary text-foreground border border-border rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Your Loaded Datasets ({datasets.length})
                  </h3>
                  {datasets.length > 0 && (
                    <button
                      onClick={() => handleOpenCreateModal()}
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Plus size={12} /> New Session
                    </button>
                  )}
                </div>

                {datasets.length === 0 ? (
                  <div className="panel p-8 text-center text-xs text-muted-foreground space-y-2">
                    <Database size={24} className="text-muted-foreground mx-auto opacity-50" />
                    <div>No datasets stored yet.</div>
                    <div className="text-[11px]">
                      Import a CSV file on the left or click one of the bundled sample datasets above.
                    </div>
                  </div>
                ) : (
                  <div className="panel divide-y divide-border overflow-hidden">
                    {datasets.map((d) => {
                      const used = sessions.filter((s) => s.datasetId === d.id).length;
                      return (
                        <div key={d.id} className="flex items-center gap-3 p-3.5 group hover:bg-secondary/20 transition-colors">
                          <Database size={16} className="text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-foreground truncate">{d.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              {d.barCount.toLocaleString()} bars · Base TF: {formatTimeframe(d.baseTimeframe)}
                            </div>
                            <div className="text-[9px] font-mono text-muted-foreground">
                              {fmtDate(d.firstTime)} → {fmtDate(d.lastTime)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1 cursor-pointer"
                              onClick={() => handleOpenCreateModal(d)}
                              title="Configure date range & leverage for backtest session"
                            >
                              <Sliders size={11} /> Backtest
                            </button>
                            <button
                              className="toolbar-btn text-xs gap-1"
                              onClick={() => void handleStartQuickSession(d)}
                              title="Quick start with default settings"
                            >
                              <Play size={11} /> Quick
                            </button>
                            <button
                              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:text-muted-foreground"
                              title={used > 0 ? `Used by ${used} session(s)` : 'Remove data'}
                              disabled={used > 0}
                              onClick={() => setPending({ kind: 'dataset', item: d })}
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
            </div>
          </section>
        )}

        {/* Tab 3: Telemetry & Journal */}
        {activeTab === 'telemetry' && (
          <section className="space-y-6">
            {/* Global Journal & Performance Stats */}
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    Performance Telemetry & Trading Journal
                  </h3>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {aggregateTelemetry.totalTrades} closed trades recorded
                </span>
              </div>

              {aggregateTelemetry.totalTrades === 0 ? (
                <div className="py-8 text-center space-y-2 text-xs text-muted-foreground">
                  <BarChart3 size={24} className="mx-auto opacity-50 text-muted-foreground" />
                  <div>No closed trades logged across your sessions yet.</div>
                  <div>Place and close trades during your replay sessions to see detailed win/loss metrics.</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-secondary/40 border border-border/70 rounded-lg p-3">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Net Return</span>
                    <div
                      className={`text-lg font-bold font-mono mt-1 ${
                        aggregateTelemetry.totalPnl >= 0 ? 'text-long' : 'text-short'
                      }`}
                    >
                      {aggregateTelemetry.totalPnl >= 0 ? '+' : ''}${aggregateTelemetry.totalPnl.toFixed(2)}
                    </div>
                  </div>

                  <div className="bg-secondary/40 border border-border/70 rounded-lg p-3">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Win Rate</span>
                    <div
                      className={`text-lg font-bold font-mono mt-1 ${
                        aggregateTelemetry.winRate >= 50 ? 'text-long' : 'text-short'
                      }`}
                    >
                      {aggregateTelemetry.winRate.toFixed(1)}%
                    </div>
                  </div>

                  <div className="bg-secondary/40 border border-border/70 rounded-lg p-3">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Profit Factor</span>
                    <div className="text-lg font-bold font-mono text-primary mt-1">
                      {aggregateTelemetry.profitFactor === Infinity
                        ? '∞'
                        : aggregateTelemetry.profitFactor > 0
                        ? aggregateTelemetry.profitFactor.toFixed(2)
                        : '—'}
                    </div>
                  </div>

                  <div className="bg-secondary/40 border border-border/70 rounded-lg p-3">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Wins / Losses</span>
                    <div className="text-lg font-bold font-mono text-foreground mt-1">
                      <span className="text-long">{aggregateTelemetry.totalWins}W</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-short">{aggregateTelemetry.totalLosses}L</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Session Notes & Strategy Reflections */}
            <div className="panel p-5 space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <BookOpen size={15} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">Session Strategy Notes & Reflections</h3>
              </div>

              {sessions.filter((s) => s.notes && s.notes.trim().length > 0).length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No strategy notes recorded yet. In any replay session, click the note icon in the top toolbar to document
                  rules, setups, or reflections.
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions
                    .filter((s) => s.notes && s.notes.trim().length > 0)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="p-3.5 rounded-lg bg-secondary/30 border border-border/80 hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">{s.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-primary">
                              {s.symbol}
                            </span>
                          </div>
                          <button
                            onClick={() => navigate(`/session/${s.id}`)}
                            className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1"
                          >
                            <Play size={10} /> Open Session
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-background/50 p-2.5 rounded border border-border/50">
                          {s.notes}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Advanced Backtest Session Creation Modal */}
      <CreateSessionModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        dataset={createModalDataset}
        datasets={datasets}
        defaultStartingBalance={balance}
        onCreated={(session) => {
          navigate(`/session/${session.id}`);
        }}
      />

      {/* Delete Confirmation Alert */}
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pending?.item.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'session'
                ? 'This removes the session, its trades, drawings and bookmarks from this device. The price data is kept.'
                : 'This removes the price data from this device. You can import the CSV again later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirm()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
