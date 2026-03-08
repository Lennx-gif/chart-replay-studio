import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, X } from 'lucide-react';

interface SymbolSwitcherProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string, timeframe: string) => void;
  currentTimeframe?: string;
}

const SUGGESTIONS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'SPY', 'QQQ',
  'GC=F', 'SI=F', 'CL=F',
];

export function SymbolSwitcher({ currentSymbol, onSymbolChange, currentTimeframe = '1d' }: SymbolSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = query.trim()
    ? SUGGESTIONS.filter((s) => s.includes(query.toUpperCase()))
    : SUGGESTIONS;

  const handleSelect = async (symbol: string) => {
    setLoading(true);
    setOpen(false);
    setQuery('');
    try {
      await onSymbolChange(symbol, currentTimeframe);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim().toUpperCase();
    if (trimmed) handleSelect(trimmed);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary hover:bg-accent text-foreground font-mono text-sm font-bold transition-colors"
        title="Change symbol"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} className="text-muted-foreground" />}
        {currentSymbol.replace(/_.*$/, '')}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <form onSubmit={handleSubmit} className="p-2 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                placeholder="Search symbol..."
                className="w-full bg-background border border-border rounded pl-7 pr-7 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                maxLength={20}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              )}
            </div>
          </form>

          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Press Enter to search "{query}"
              </div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-muted/50 text-foreground transition-colors"
                >
                  {s}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
