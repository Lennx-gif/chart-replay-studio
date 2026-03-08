import { Upload, FileSpreadsheet, Search, Loader2, TrendingUp } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  onSymbolLoad: (symbol: string, timeframe: string) => void;
  isLoading: boolean;
}

const POPULAR_SYMBOLS = [
  { label: 'Forex', items: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF', 'EURGBP'] },
  { label: 'Stocks', items: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY', 'QQQ'] },
  { label: 'Crypto', items: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'ADA-USD', 'DOGE-USD', 'XRP-USD'] },
  { label: 'Commodities', items: ['GC=F', 'SI=F', 'CL=F', 'NG=F'] },
  { label: 'Indices', items: ['^GSPC', '^DJI', '^IXIC', '^VIX'] },
];

const TIMEFRAMES = [
  { value: '1m', label: '1 Min' },
  { value: '5m', label: '5 Min' },
  { value: '15m', label: '15 Min' },
  { value: '1h', label: '1 Hour' },
  { value: '1d', label: 'Daily' },
  { value: '1wk', label: 'Weekly' },
];

export function FileUpload({ onFileSelected, onSymbolLoad, isLoading }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('1d');
  const [mode, setMode] = useState<'symbol' | 'csv'>('symbol');

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      onFileSelected(file);
    }
  }, [onFileSelected]);

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;
    onSymbolLoad(trimmed, timeframe);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-8 bg-background">
      <div className="w-full max-w-xl space-y-6">
        {/* Tabs */}
        <div className="flex items-center justify-center gap-1 bg-card rounded-lg p-1 border border-border">
          <button
            onClick={() => setMode('symbol')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'symbol' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search size={16} />
            Search Symbol
          </button>
          <button
            onClick={() => setMode('csv')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === 'csv' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileSpreadsheet size={16} />
            Upload CSV
          </button>
        </div>

        {mode === 'symbol' ? (
          <div className="panel p-8 space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <TrendingUp size={28} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Load Market Data</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter a ticker symbol to fetch historical data
              </p>
            </div>

            <form onSubmit={handleSymbolSubmit} className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. AAPL, EURUSD, GC=F"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="bg-card border-border font-mono text-base"
                  maxLength={20}
                  disabled={isLoading}
                />
                <Select value={timeframe} onValueChange={setTimeframe} disabled={isLoading}>
                  <SelectTrigger className="w-[120px] bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEFRAMES.map((tf) => (
                      <SelectItem key={tf.value} value={tf.value}>
                        {tf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || !symbol.trim()}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching data...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Load Data
                  </>
                )}
              </Button>
            </form>

            {/* Quick picks */}
            <div className="space-y-3">
              {POPULAR_SYMBOLS.map((group) => (
                <div key={group.label}>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((s) => (
                      <button
                        key={s}
                        disabled={isLoading}
                        onClick={() => { setSymbol(s); onSymbolLoad(s, timeframe); }}
                        className="px-2.5 py-1 text-xs font-mono rounded-md bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`panel p-12 text-center cursor-pointer transition-all duration-200 ${
              dragOver ? 'border-primary glow-primary scale-[1.02]' : 'hover:border-muted-foreground/30'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) onFileSelected(file);
              };
              input.click();
            }}
          >
            <div className="flex flex-col items-center gap-4">
              {isLoading ? (
                <>
                  <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-muted-foreground text-sm">Parsing CSV data...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileSpreadsheet size={32} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground mb-1">Load OHLCV Data</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Drop a CSV file or click to browse
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                    <Upload size={14} />
                    <span>Supports: date,time,O,H,L,C,V or timestamp,O,H,L,C,V</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
