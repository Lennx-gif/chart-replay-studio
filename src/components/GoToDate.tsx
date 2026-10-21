import { useState, useMemo } from 'react';
import { Calendar, Clock, X, ChevronRight, Compass } from 'lucide-react';
import type { OHLCVBar } from '@/lib/csvParser';

interface GoToDateProps {
  bars: OHLCVBar[];
  currentBarIndex: number;
  onSeek: (barIndex: number) => void;
}

interface TradingSession {
  name: string;
  startHour: number; // UTC
  endHour: number;
  color: string;
}

const SESSIONS: TradingSession[] = [
  { name: 'Sydney', startHour: 21, endHour: 6, color: '#2196f3' },
  { name: 'Tokyo', startHour: 0, endHour: 9, color: '#9c27b0' },
  { name: 'London', startHour: 7, endHour: 16, color: '#d4a54a' },
  { name: 'New York', startHour: 13, endHour: 22, color: '#4caf50' },
];

export function GoToDate({ bars, currentBarIndex, onSeek }: GoToDateProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('00:00');

  const dateRange = useMemo(() => {
    if (bars.length === 0) return { min: '', max: '' };
    const minDate = new Date(bars[0].time * 1000);
    const maxDate = new Date(bars[bars.length - 1].time * 1000);
    return {
      min: minDate.toISOString().split('T')[0],
      max: maxDate.toISOString().split('T')[0],
    };
  }, [bars]);

  const handleGoTo = () => {
    if (!dateStr) return;
    const target = new Date(`${dateStr}T${timeStr}:00Z`).getTime() / 1000;
    // Find nearest bar
    let nearest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < bars.length; i++) {
      const diff = Math.abs(bars[i].time - target);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = i;
      }
    }
    onSeek(nearest + 1); // bar index is 1-based
    setShowPanel(false);
  };

  const jumpToSession = (session: TradingSession) => {
    for (let i = currentBarIndex; i < bars.length; i++) {
      const d = new Date(bars[i].time * 1000);
      const hour = d.getUTCHours();
      if (hour === session.startHour) {
        onSeek(i + 1);
        setShowPanel(false);
        return;
      }
    }
    // Wrap around
    for (let i = 0; i < currentBarIndex; i++) {
      const d = new Date(bars[i].time * 1000);
      const hour = d.getUTCHours();
      if (hour === session.startHour) {
        onSeek(i + 1);
        setShowPanel(false);
        return;
      }
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`h-8 px-2.5 rounded-md border flex items-center gap-1.5 text-xs font-medium transition-all shadow-sm select-none ${
          showPanel
            ? 'bg-primary/20 text-primary border-primary/50'
            : 'bg-secondary/70 hover:bg-primary/20 text-foreground hover:text-primary border-border hover:border-primary/40'
        }`}
        title="Go to specific date or market session (Alt+G)"
      >
        <Calendar size={13} className="text-primary" />
        <span className="hidden sm:inline">Go To</span>
      </button>

      {showPanel && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden text-foreground animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Compass size={14} className="text-primary" />
              <span>Go to Date / Session</span>
            </div>
            <button
              onClick={() => setShowPanel(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Date picker */}
          <div className="p-3.5 border-b border-border/70 space-y-2">
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Exact Historical Timestamp
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateStr}
                min={dateRange.min}
                max={dateRange.max}
                onChange={(e) => setDateStr(e.target.value)}
                className="flex-1 bg-secondary text-foreground border border-border rounded-md px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-24 bg-secondary text-foreground border border-border rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            <button
              onClick={handleGoTo}
              disabled={!dateStr}
              className="w-full py-1.5 rounded-md text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 glow-primary transition-all disabled:opacity-40"
            >
              Jump to Candle
            </button>
          </div>

          {/* Session shortcuts */}
          <div className="p-3.5 border-b border-border/70">
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
              <Clock size={11} className="text-primary" />
              Jump to Market Open (UTC)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SESSIONS.map((s) => (
                <button
                  key={s.name}
                  onClick={() => jumpToSession(s)}
                  className="px-2.5 py-1.5 rounded-md border border-border bg-secondary/50 hover:bg-primary/20 hover:border-primary/40 text-foreground transition-all flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {s.startHour.toString().padStart(2, '0')}:00
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick nav */}
          <div className="p-3 bg-secondary/20">
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5">
              Timeline Seek
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: 'Start', pct: 0 },
                { label: '25%', pct: 0.25 },
                { label: '50%', pct: 0.5 },
                { label: '75%', pct: 0.75 },
                { label: 'End', pct: 1 },
              ].map(({ label, pct }) => (
                <button
                  key={label}
                  onClick={() => {
                    const idx = Math.max(1, Math.floor(bars.length * pct));
                    onSeek(idx);
                    setShowPanel(false);
                  }}
                  className="py-1 rounded text-[11px] font-mono border border-border bg-secondary hover:bg-accent text-secondary-foreground transition-colors text-center"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
