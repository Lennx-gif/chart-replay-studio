import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Database, Download, HardDrive, Play, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { FileUpload } from '@/components/FileUpload';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { parseCSV } from '@/lib/csvParser';
import type { DatasetRecord, SessionRecord } from '@/lib/db';
import { formatTimeframe } from '@/lib/replay';
import {
  DEFAULT_STARTING_BALANCE, createSession, deleteDataset, deleteSession, duplicateSession, exportBackup, getSetting,
  importBackup, listDatasets, listSessions, requestPersistentStorage, saveDataset, setSetting, storageEstimate,
} from '@/lib/store';

type Pending = { kind: 'session'; item: SessionRecord } | { kind: 'dataset'; item: DatasetRecord } | null;

const fmtDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

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
  const [pending, setPending] = useState<Pending>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
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

  const startSession = async (dataset: DatasetRecord) => {
    try {
      const session = await createSession({ name: '', dataset, startingBalance: balance });
      navigate(`/session/${session.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create session');
    }
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const bars = await parseCSV(file);
      const name = file.name.replace(/\.csv$/i, '');
      const dataset = await saveDataset(name, bars);
      toast.success(`Imported ${bars.length.toLocaleString()} bars from ${file.name}`);
      await startSession(dataset);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to parse CSV');
    } finally {
      setImporting(false);
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

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chart Replay Studio</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <HardDrive size={13} />
              Everything is stored locally on this device. No account needed.
              {usage && usage.quota > 0 && <span className="font-mono">· {fmtBytes(usage.usage)} used</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="toolbar-btn text-xs gap-1.5" onClick={handleExport} title="Download all sessions and data as one file">
              <Download size={13} /> Back up
            </button>
            <button className="toolbar-btn text-xs gap-1.5" onClick={() => backupInput.current?.click()} title="Restore from a backup file">
              <Upload size={13} /> Restore
            </button>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleRestore(f); e.target.value = ''; }}
            />
          </div>
        </header>

        {/* Sessions */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Sessions</h2>
          {!loaded ? null : sessions.length === 0 ? (
            <div className="panel p-6 text-center text-sm text-muted-foreground">
              No sessions yet. Import price data below to start your first replay.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((s) => {
                const pct = s.totalBars > 1 ? ((s.position - 1) / (s.totalBars - 1)) * 100 : 0;
                return (
                  <div
                    key={s.id}
                    className="panel p-4 group cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => navigate(`/session/${s.id}`)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/session/${s.id}`); }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{s.name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">{s.symbol} · {formatTimeframe(s.timeframe)}</div>
                      </div>
                      <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button className="p-1 text-muted-foreground hover:text-foreground" title="Duplicate" onClick={(e) => { e.stopPropagation(); void handleDuplicate(s); }}>
                          <Copy size={13} />
                        </button>
                        <button className="p-1 text-muted-foreground hover:text-destructive" title="Delete" onClick={(e) => { e.stopPropagation(); setPending({ kind: 'session', item: s }); }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 h-1 rounded bg-secondary overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>{pct.toFixed(0)}% replayed · {s.closedTrades} trades</span>
                      <span className={s.realizedPnl >= 0 ? 'text-long' : 'text-short'}>
                        {s.closedTrades > 0 ? `${s.realizedPnl >= 0 ? '+' : ''}${s.realizedPnl.toFixed(2)}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Opened {ago(s.lastOpenedAt)}</span>
                      <span className="flex items-center gap-1 text-primary"><Play size={10} /> Resume</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* New session */}
        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">New session</h2>
            <FileUpload onFileSelected={handleFile} isLoading={importing} />
            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              Starting balance
              <input
                type="number"
                min={1}
                step={100}
                defaultValue={balance}
                key={balance}
                onBlur={(e) => void handleBalance(e.target.value)}
                className="w-28 bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Your data</h2>
            {datasets.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-muted-foreground">Imported price data will appear here, ready to reuse.</div>
            ) : (
              <div className="panel divide-y divide-border">
                {datasets.map((d) => {
                  const used = sessions.filter((s) => s.datasetId === d.id).length;
                  return (
                    <div key={d.id} className="flex items-center gap-3 p-3 group">
                      <Database size={16} className="text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{d.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {d.barCount.toLocaleString()} bars · {formatTimeframe(d.baseTimeframe)} · {fmtDate(d.firstTime)} → {fmtDate(d.lastTime)}
                        </div>
                      </div>
                      <button className="toolbar-btn text-xs gap-1" onClick={() => void startSession(d)}>
                        <Play size={11} /> New
                      </button>
                      <button
                        className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
                        title={used > 0 ? `Used by ${used} session(s)` : 'Remove data'}
                        disabled={used > 0}
                        onClick={() => setPending({ kind: 'dataset', item: d })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

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
