import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listDatasets,
  listSessions,
  deleteDataset,
  deleteSession,
  exportFullBackup,
  importFullBackup,
  saveSession,
  generateUUID,
  type StoredDataset,
  type BacktestSession,
} from '@/lib/db/localDatabase';
import { parseCSV, detectBaseTimeframe, type OHLCVBar } from '@/lib/csvParser';
import { timeframeToLabel } from '@/lib/timeframeEngine';
import { calculateStats } from '@/lib/tradeEngine';
import { CreateSessionModal } from './CreateSessionModal';
import { BalanceSettings } from './BalanceSettings';
import {
  Upload,
  FileSpreadsheet,
  FolderOpen,
  Sparkles,
  Trash2,
  Download,
  Calendar,
  Layers,
  Play,
  Plus,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Database,
  ArrowRight,
  Shield,
  BarChart3,
  BookOpen,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

interface HomeDashboardProps {
  onLaunchSession: (dataset: StoredDataset, session: BacktestSession) => void;
  onUploadFile: (file: File) => Promise<void>;
  isLoading: boolean;
}

export function HomeDashboard({
  onLaunchSession,
  onUploadFile,
  isLoading,
}: HomeDashboardProps) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'datasets' | 'telemetry'>('sessions');
  const [datasets, setDatasets] = useState<StoredDataset[]>([]);
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  // Create session modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedDatasetForCreate, setSelectedDatasetForCreate] = useState<StoredDataset | null>(null);

  // Load all datasets and sessions from local IndexedDB
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [allDatasets, allSessions] = await Promise.all([
        listDatasets(),
        listSessions(),
      ]);
      setDatasets(allDatasets);
      setSessions(allSessions);
    } catch {
      toast.error('Failed to load local data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Aggregate stats across all sessions
  const aggregatedStats = useMemo(() => {
    const allOrders = sessions.flatMap((s) => s.orders || []);
    return calculateStats(allOrders, 10000);
  }, [sessions]);

  // Handle Drag & Drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        await onUploadFile(file);
        refreshData();
      } else {
        toast.error('Please drop a valid .csv file');
      }
    },
    [onUploadFile, refreshData]
  );

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUploadFile(file);
      refreshData();
    }
  };

  // 1-Click Sample Loader
  const loadSample = async (url: string, name: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Sample not found');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const file = new File([blob], `${name}.csv`, { type: 'text/csv' });
      await onUploadFile(file);
      refreshData();
    } catch (e: any) {
      toast.error('Failed to load sample: ' + e.message);
    }
  };

  // Launch a session directly
  const handleLaunch = (session: BacktestSession) => {
    const ds = datasets.find((d) => d.id === session.datasetId);
    if (!ds) {
      toast.error('Underlying dataset not found in local library');
      return;
    }
    onLaunchSession(ds, session);
  };

  // Quick launch dataset with default session
  const handleQuickLaunchDataset = async (ds: StoredDataset) => {
    // Find existing session or create default
    const existing = sessions.find((s) => s.datasetId === ds.id);
    if (existing) {
      onLaunchSession(ds, existing);
      return;
    }

    const defaultSession: BacktestSession = {
      id: generateUUID(),
      name: `${ds.symbol} Replay`,
      datasetId: ds.id,
      symbol: ds.symbol,
      timeframe: ds.baseTimeframe,
      currentTimestamp: ds.bars[Math.min(50, ds.bars.length - 1)]?.time || ds.bars[0]?.time || 0,
      speed: 1,
      stepMode: 'bar',
      stepMinutes: ds.baseTimeframe,
      dateFilter: { mode: 'all' },
      drawings: [],
      orders: [],
      startingBalance: 10000,
      leverage: 30,
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveSession(defaultSession);
    onLaunchSession(ds, defaultSession);
  };

  // Open create session wizard for dataset
  const handleOpenCreateForDataset = (ds: StoredDataset) => {
    setSelectedDatasetForCreate(ds);
    setCreateModalOpen(true);
  };

  const handleDeleteSession = async (sessId: string, sessName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession(sessId);
      toast.success(`Deleted session "${sessName}"`);
      refreshData();
    } catch {
      toast.error('Failed to delete session');
    }
  };

  const handleDeleteDataset = async (dsId: string, dsName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDataset(dsId);
      toast.success(`Deleted dataset "${dsName}"`);
      refreshData();
    } catch {
      toast.error('Failed to delete dataset');
    }
  };

  const handleExportBackup = async () => {
    try {
      const json = await exportFullBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `replay_studio_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch {
      toast.error('Failed to export backup');
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result);
        const { datasets: dsCount, sessions: sessCount } = await importFullBackup(text);
        toast.success(`Restored ${dsCount} datasets and ${sessCount} sessions!`);
        refreshData();
      } catch (err: any) {
        toast.error('Import failed: ' + (err.message || 'Invalid format'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col select-none">
      {/* Top Navbar */}
      <header className="border-b border-border bg-card/90 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
            <BarChart3 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold font-mono tracking-tight text-foreground">
                CHART REPLAY STUDIO
              </h1>
              <span className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-semibold">
                100% Offline Local Engine
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Local database engine, multi-timeframe bar replay, and TradingView charting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <BalanceSettings />

          <button
            onClick={handleExportBackup}
            className="h-8 px-2.5 rounded-md border border-border bg-secondary/80 hover:bg-secondary text-foreground text-xs flex items-center gap-1.5 transition-all shadow-sm"
            title="Export full backup JSON"
          >
            <Download size={13} className="text-primary" />
            <span className="hidden sm:inline">Export Backup</span>
          </button>

          <label className="h-8 px-2.5 rounded-md border border-border bg-secondary/80 hover:bg-secondary text-foreground text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer">
            <Upload size={13} className="text-primary" />
            <span className="hidden sm:inline">Restore</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Top Telemetry & Hero Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Datasets in library */}
          <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold">Loaded Datasets</span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">{datasets.length}</div>
              <span className="text-[11px] text-muted-foreground">
                {datasets.reduce((sum, d) => sum + d.barCount, 0).toLocaleString()} total bars
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Database size={20} />
            </div>
          </div>

          {/* Card 2: Backtest Sessions */}
          <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold">Active Sessions</span>
              <div className="text-2xl font-bold font-mono text-primary mt-1">{sessions.length}</div>
              <span className="text-[11px] text-muted-foreground">Isolated Data Times</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Layers size={20} />
            </div>
          </div>

          {/* Card 3: Total Trades Recorded */}
          <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold">Total Trades</span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                {aggregatedStats.totalTrades}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Win Rate: {aggregatedStats.winRate.toFixed(0)}%
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Activity size={20} />
            </div>
          </div>

          {/* Card 4: Net Realized PnL */}
          <div className="p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold">Total Net P&L</span>
              <div
                className={`text-2xl font-bold font-mono mt-1 ${
                  aggregatedStats.totalPnl >= 0 ? 'text-long' : 'text-short'
                }`}
              >
                {aggregatedStats.totalPnl >= 0 ? '+' : ''}${aggregatedStats.totalPnl.toFixed(2)}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Profit Factor: {aggregatedStats.profitFactor === Infinity ? '∞' : aggregatedStats.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <DollarSign size={20} />
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            {[
              { id: 'sessions' as const, label: `Backtest Sessions (${sessions.length})`, icon: <Layers size={14} /> },
              { id: 'datasets' as const, label: `Datasets & Import (${datasets.length})`, icon: <Database size={14} /> },
              { id: 'telemetry' as const, label: 'Telemetry & Journal', icon: <Activity size={14} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:text-foreground hover:bg-secondary border border-border'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Action Button */}
          {datasets.length > 0 && (
            <button
              onClick={() => handleOpenCreateForDataset(datasets[0])}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 glow-primary text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Plus size={13} />
              + Create Session
            </button>
          )}
        </div>

        {/* TAB 1: SESSIONS MANAGEMENT */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-border rounded-xl bg-card/40 space-y-3">
                <Layers size={40} className="mx-auto text-primary/40" />
                <h3 className="text-base font-bold text-foreground">No Backtest Sessions Created Yet</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Load a dataset or click a sample below to configure your account amount, leverage, and designated Data Times window.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab('datasets')}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 hover:bg-primary/90 glow-primary transition-all"
                  >
                    <Upload size={13} /> Load Dataset
                  </button>
                  <button
                    onClick={() => loadSample('/samples/EURUSD_1H.csv', 'EURUSD_1H')}
                    className="px-4 py-2 rounded-lg bg-secondary border border-border text-foreground text-xs font-semibold hover:bg-accent transition-all flex items-center gap-1.5"
                  >
                    <Sparkles size={13} className="text-primary" /> Load EURUSD Sample
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sessions.map((sess) => {
                  const ds = datasets.find((d) => d.id === sess.datasetId);
                  const sessOrders = sess.orders || [];
                  const sessStats = calculateStats(sessOrders, sess.startingBalance || 10000);
                  const dateFilter = sess.dateFilter;

                  return (
                    <div
                      key={sess.id}
                      onClick={() => handleLaunch(sess)}
                      className="p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-secondary/25 transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
                    >
                      <div>
                        {/* Session Card Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-primary" />
                              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                {sess.name}
                              </h3>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground">
                              <span className="text-primary font-semibold">{sess.symbol}</span>
                              <span>•</span>
                              <span>{timeframeToLabel(sess.timeframe || 60)}</span>
                              <span>•</span>
                              <span>Lev 1:{sess.leverage || 30}</span>
                            </div>
                          </div>

                          <button
                            onClick={(e) => handleDeleteSession(sess.id, sess.name, e)}
                            className="p-1 text-muted-foreground hover:text-short rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete session"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Data Times Badge */}
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground mb-3 bg-secondary/60 px-2.5 py-1 rounded-md border border-border/60">
                          <Calendar size={12} className="text-primary" />
                          <span>Range:</span>
                          <span className="text-foreground font-semibold">
                            {dateFilter?.mode === 'all' && 'All Historical Data'}
                            {dateFilter?.mode === 'years' && `Years: ${dateFilter.startYear || ''} - ${dateFilter.endYear || ''}`}
                            {dateFilter?.mode === 'months' && 'Specific Months'}
                            {dateFilter?.mode === 'custom' && 'Custom Date Range'}
                            {dateFilter?.mode === 'blind' && `Blind Window (${dateFilter.blindWindowDays || 60}d)`}
                          </span>
                        </div>

                        {/* Session Stats */}
                        <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-border/50 text-[11px] font-mono">
                          <div>
                            <span className="text-muted-foreground block text-[10px]">BALANCE</span>
                            <span className="font-semibold text-foreground">
                              ${sess.startingBalance?.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[10px]">TRADES</span>
                            <span className="font-semibold text-foreground">{sessOrders.length}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[10px]">NET P&L</span>
                            <span
                              className={`font-semibold ${
                                sessStats.totalPnl >= 0 ? 'text-long' : 'text-short'
                              }`}
                            >
                              {sessStats.totalPnl >= 0 ? '+' : ''}${sessStats.totalPnl.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Launch Button Footer */}
                      <div className="mt-4 flex items-center justify-between pt-2">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Updated {new Date(sess.updatedAt).toLocaleDateString()}
                        </span>

                        <span className="px-3 py-1 text-xs font-bold rounded-md bg-primary text-primary-foreground group-hover:bg-primary/90 glow-primary flex items-center gap-1 transition-all">
                          <Play size={11} className="fill-current" />
                          Launch Replay
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DATASETS & DATA LOADING */}
        {activeTab === 'datasets' && (
          <div className="space-y-6">
            {/* Drag & Drop Upload Panel */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('home-csv-file-input')?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer bg-card/40 ${
                dragOver
                  ? 'border-primary bg-primary/10 shadow-lg'
                  : 'border-border hover:border-primary/50 hover:bg-card/70'
              }`}
            >
              <FileSpreadsheet size={40} className="mx-auto text-primary mb-3" />
              <h3 className="text-sm font-bold text-foreground">Upload Local OHLCV CSV File</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Drag and drop your CSV here, or click to browse. Supports Unix timestamps, ISO dates, MT4/5, TradingView, and 5-to-7 column formats.
              </p>
              <input
                id="home-csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {/* Bundled Samples Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} className="text-primary" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Bundled Offline Datasets (Instant 1-Click Launch)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* EURUSD */}
                <div
                  onClick={() => loadSample('/samples/EURUSD_1H.csv', 'EURUSD_1H')}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-secondary/40 transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-primary">EURUSD</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        1H Forex
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Hourly forex bars with London & New York session action. Supports 15m, 5m, 1m sub-timeframes.
                    </p>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground text-xs font-bold transition-all flex items-center gap-1">
                    Load <ArrowRight size={12} />
                  </button>
                </div>

                {/* BTCUSD */}
                <div
                  onClick={() => loadSample('/samples/BTCUSD_1D.csv', 'BTCUSD_1D')}
                  className="p-4 rounded-xl border border-border bg-card hover:border-amber/50 hover:bg-secondary/40 transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-amber">BTCUSD</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">
                        Daily Crypto
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Daily crypto dataset. Perfect for year/month Data Times filtering or 4H/1H decomposition.
                    </p>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg bg-amber/20 text-amber group-hover:bg-amber group-hover:text-amber-foreground text-xs font-bold transition-all flex items-center gap-1">
                    Load <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Saved Datasets Table */}
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
                Saved Local Datasets Library ({datasets.length})
              </h3>
              {datasets.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-xl text-muted-foreground text-xs">
                  No datasets uploaded yet. Upload a CSV or load a sample dataset above.
                </div>
              ) : (
                <div className="overflow-x-auto border border-border rounded-xl bg-card">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-secondary/60 text-muted-foreground border-b border-border text-[11px]">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Symbol</th>
                        <th className="px-4 py-2.5 text-left">Dataset Name</th>
                        <th className="px-4 py-2.5 text-left">Timeframe</th>
                        <th className="px-4 py-2.5 text-left">Bars</th>
                        <th className="px-4 py-2.5 text-left">Date Range</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasets.map((ds) => {
                        const start = new Date(ds.startTime * 1000).toISOString().split('T')[0];
                        const end = new Date(ds.endTime * 1000).toISOString().split('T')[0];

                        return (
                          <tr key={ds.id} className="border-b border-border/50 hover:bg-secondary/30">
                            <td className="px-4 py-3 font-bold text-primary">{ds.symbol}</td>
                            <td className="px-4 py-3 text-foreground">{ds.name}</td>
                            <td className="px-4 py-3">{timeframeToLabel(ds.baseTimeframe)}</td>
                            <td className="px-4 py-3">{ds.barCount.toLocaleString()}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {start} &rarr; {end}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenCreateForDataset(ds)}
                                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/30 transition-all flex items-center gap-1"
                                >
                                  <Plus size={11} /> Create Session
                                </button>
                                <button
                                  onClick={() => handleQuickLaunchDataset(ds)}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-secondary hover:bg-accent text-foreground border border-border transition-all flex items-center gap-1"
                                >
                                  <Play size={11} /> Replay
                                </button>
                                <button
                                  onClick={(e) => handleDeleteDataset(ds.id, ds.name, e)}
                                  className="p-1 rounded text-muted-foreground hover:text-short hover:bg-secondary transition-colors"
                                  title="Delete dataset"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TELEMETRY & JOURNAL */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-border bg-card space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                Aggregated Replay Performance Across All Sessions
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <span className="text-muted-foreground block text-[10px] uppercase">TOTAL SESSIONS</span>
                  <span className="text-lg font-bold text-foreground">{sessions.length}</span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <span className="text-muted-foreground block text-[10px] uppercase">WIN RATE</span>
                  <span className="text-lg font-bold text-primary">{aggregatedStats.winRate.toFixed(1)}%</span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <span className="text-muted-foreground block text-[10px] uppercase">PROFIT FACTOR</span>
                  <span className="text-lg font-bold text-foreground">
                    {aggregatedStats.profitFactor === Infinity ? '∞' : aggregatedStats.profitFactor.toFixed(2)}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <span className="text-muted-foreground block text-[10px] uppercase">MAX DRAWDOWN</span>
                  <span className="text-lg font-bold text-short">
                    {aggregatedStats.maxDrawdownPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Session Modal */}
      {selectedDatasetForCreate && (
        <CreateSessionModal
          open={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setSelectedDatasetForCreate(null);
          }}
          dataset={selectedDatasetForCreate}
          currentBars={selectedDatasetForCreate.bars}
          onSessionCreated={(newSess) => {
            refreshData();
            onLaunchSession(selectedDatasetForCreate, newSess);
          }}
        />
      )}
    </div>
  );
}
