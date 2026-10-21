import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FolderOpen,
  Sparkles,
  Trash2,
  Download,
  Calendar,
  Layers,
  ArrowRight,
  Database,
} from 'lucide-react';
import {
  listDatasets,
  deleteDataset,
  exportFullBackup,
  importFullBackup,
  type StoredDataset,
} from '@/lib/db/localDatabase';
import { toast } from 'sonner';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  onDatasetSelected?: (dataset: StoredDataset) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelected, onDatasetSelected, isLoading }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'library' | 'samples'>('upload');
  const [savedDatasets, setSavedDatasets] = useState<StoredDataset[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);

  const fetchDatasets = useCallback(async () => {
    setLoadingLib(true);
    try {
      const list = await listDatasets();
      setSavedDatasets(list);
    } catch {
      // Ignored
    } finally {
      setLoadingLib(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        onFileSelected(file);
      } else {
        toast.error('Please upload a .csv file');
      }
    },
    [onFileSelected]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  const loadSample = async (url: string, name: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Sample not found');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const file = new File([blob], `${name}.csv`, { type: 'text/csv' });
      onFileSelected(file);
    } catch (e: any) {
      toast.error('Failed to load sample: ' + e.message);
    }
  };

  const handleDeleteDs = async (id: string, name: string) => {
    try {
      await deleteDataset(id);
      toast.success(`Deleted "${name}"`);
      fetchDatasets();
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
      toast.success('Local database exported successfully');
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
        const { datasets, sessions } = await importFullBackup(text);
        toast.success(`Restored ${datasets} datasets and ${sessions} sessions!`);
        fetchDatasets();
      } catch (err: any) {
        toast.error('Import failed: ' + (err.message || 'Invalid format'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-background">
      <div className="w-full max-w-xl space-y-5">
        {/* Header Title */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mb-1">
            <Database size={11} /> 100% Offline Local Engine
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">Chart Replay Studio</h1>
          <p className="text-xs text-muted-foreground">
            Multi-timeframe bar replay, custom Data Times backtesting, and TradingView charting
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-center gap-1 bg-card rounded-lg p-1 border border-border">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'upload' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload size={14} />
            Import CSV
          </button>
          <button
            onClick={() => {
              setActiveTab('library');
              fetchDatasets();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'library' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderOpen size={14} />
            Local Library ({savedDatasets.length})
          </button>
          <button
            onClick={() => setActiveTab('samples')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'samples' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles size={14} />
            Sample Data
          </button>
        </div>

        {/* Tab 1: Upload */}
        {activeTab === 'upload' && (
          <div className="panel p-6 space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
              }`}
              onClick={() => document.getElementById('csv-file-input')?.click()}
            >
              <FileSpreadsheet size={36} className="mx-auto text-primary mb-3" />
              <p className="text-sm font-semibold text-foreground">Drag and drop your OHLCV CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse from your machine</p>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
                disabled={isLoading}
              />
            </div>

            <div className="text-[11px] text-muted-foreground space-y-1 bg-secondary/30 p-3 rounded-lg border border-border/60">
              <span className="font-semibold text-foreground block">Accepted CSV Column Formats:</span>
              <p className="font-mono">Date, Time, Open, High, Low, Close, Volume</p>
              <p className="font-mono">Timestamp, Open, High, Low, Close, Volume</p>
            </div>
          </div>
        )}

        {/* Tab 2: Local Datasets Library */}
        {activeTab === 'library' && (
          <div className="panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Stored Datasets on this Machine</span>
              <span className="text-[10px] font-mono text-muted-foreground">{savedDatasets.length} items</span>
            </div>

            {loadingLib ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading local datasets...</div>
            ) : savedDatasets.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                No datasets saved yet. Upload a CSV or load a sample dataset to get started!
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedDatasets.map((ds) => (
                  <div
                    key={ds.id}
                    className="p-3 bg-secondary/40 hover:bg-secondary/70 border border-border rounded-lg flex items-center justify-between transition-colors group cursor-pointer"
                    onClick={() => onDatasetSelected && onDatasetSelected(ds)}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{ds.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2">
                        <span className="text-primary font-bold">{ds.symbol}</span>
                        <span>•</span>
                        <span>{ds.barCount} bars</span>
                        <span>•</span>
                        <span>{ds.baseTimeframe}m base</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDatasetSelected) onDatasetSelected(ds);
                        }}
                        className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded hover:bg-primary/90 flex items-center gap-1 transition-colors"
                      >
                        Open <ArrowRight size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDs(ds.id, ds.name);
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                        title="Delete from database"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Samples */}
        {activeTab === 'samples' && (
          <div className="panel p-5 space-y-3">
            <span className="text-xs font-semibold text-foreground">Bundled Offline Datasets</span>
            <p className="text-[11px] text-muted-foreground">
              Instant 1-click loading to test bar replay, lower/higher timeframes, and session management right away.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div
                onClick={() => loadSample('/samples/EURUSD_1H.csv', 'EURUSD_1H')}
                className="p-3.5 bg-secondary/40 hover:bg-secondary/80 border border-border rounded-lg cursor-pointer transition-colors space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-primary">EURUSD</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">1H Forex</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hourly forex data with London/NY sessions. Try decomposing down to 15m, 5m, or 1m!
                </p>
                <span className="text-xs text-primary font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  Load EURUSD <ArrowRight size={12} />
                </span>
              </div>

              <div
                onClick={() => loadSample('/samples/BTCUSD_1D.csv', 'BTCUSD_1D')}
                className="p-3.5 bg-secondary/40 hover:bg-secondary/80 border border-border rounded-lg cursor-pointer transition-colors space-y-1.5 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-amber">BTCUSD</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber/10 text-amber">Daily Crypto</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Daily crypto dataset. Test year/month filtering in Data Times or decompose to 4H / 1H.
                </p>
                <span className="text-xs text-amber font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  Load BTCUSD <ArrowRight size={12} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Database Backup & Restore */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 px-1">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            title="Download full backup of all datasets and sessions"
          >
            <Download size={12} /> Export Backup (.json)
          </button>
          <label className="flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors">
            <Upload size={12} /> Restore Backup (.json)
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
}
