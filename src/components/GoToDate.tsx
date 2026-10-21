import { useState, useMemo } from 'react';
import { Calendar, Clock, X, Play } from 'lucide-react';
import type { OHLCVBar } from '@/lib/csvParser';

interface GoToDateProps {
  /** Base bars (UTC seconds). */
  raw: OHLCVBar[];
  /** Number of base bars currently revealed. */
  position: number;
  /** Display timezone offset in hours; the date/time inputs are in this zone. */
  tzOffset: number;
  onSeek: (position: number) => void;
  /** Seek to the first bar at or after this UTC time. */
  onSeekTime: (unixSeconds: number) => void;
}

interface TradingSession {
  name: string;
  startHour: number; // UTC
  endHour: number;
  color: string;
}

const SESSIONS: TradingSession[] = [
  { name: 'Sydney', startHour: 21, endHour: 6, color: 'hsl(var(--primary))' },
  { name: 'Tokyo', startHour: 0, endHour: 9, color: 'hsl(280, 60%, 55%)' },
  { name: 'London', startHour: 7, endHour: 16, color: 'hsl(45, 90%, 55%)' },
  { name: 'New York', startHour: 13, endHour: 22, color: 'hsl(var(--long))' },
];

const DAY = 86400;

export function GoToDate({ raw, position, tzOffset, onSeek, onSeekTime }: GoToDateProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('00:00');

  const toLocalIso = (unix: number) => new Date((unix + tzOffset * 3600) * 1000).toISOString().split('T')[0];
  const dateRange = useMemo(() => {
    if (raw.length === 0) return { min: '', max: '' };
    return { min: toLocalIso(raw[0].time), max: toLocalIso(raw[raw.length - 1].time) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, tzOffset]);

  const currentTime = raw[Math.max(0, position - 1)]?.time ?? 0;

  const handleGoTo = () => {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const localAsUtc = Date.UTC(y, m - 1, d, hh || 0, mm || 0) / 1000;
    onSeekTime(localAsUtc - tzOffset * 3600);
    setShowPanel(false);
  };

  const jumpToSession = (session: TradingSession) => {
    // First bar of the next session open after the current position.
    for (let i = position; i < raw.length; i++) {
      const hour = new Date(raw[i].time * 1000).getUTCHours();
      const prevHour = i > 0 ? new Date(raw[i - 1].time * 1000).getUTCHours() : -1;
      if (hour === session.startHour && prevHour !== session.startHour) {
        onSeek(i + 1);
        setShowPanel(false);
        return;
      }
    }
  };

  return (
    <div className="relative">
      <button
        className={`toolbar-btn text-xs gap-1.5 transition-all ${
          showPanel ? 'bg-primary/20 text-primary border-primary/50' : ''
        }`}
        onClick={() => setShowPanel(!showPanel)}
        title="Go to date / market session"
      >
        <Calendar size={13} className={showPanel ? 'text-primary' : 'text-muted-foreground'} />
        <span className="hidden sm:inline">Go To</span>
      </button>

      {showPanel && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-76 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Calendar size={13} className="text-primary" />
              <span>Go to Date / Session</span>
            </div>
            <button
              onClick={() => setShowPanel(false)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Date picker */}
          <div className="p-3.5 border-b border-border space-y-2.5">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Jump to Exact Date & Time
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateStr}
                min={dateRange.min}
                max={dateRange.max}
                onChange={(e) => setDateStr(e.target.value)}
                className="flex-1 bg-secondary/80 text-foreground border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-24 bg-secondary/80 text-foreground border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
            <button
              onClick={handleGoTo}
              disabled={!dateStr}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              <Play size={12} className="fill-current" />
              <span>Jump to Replay Time</span>
            </button>
          </div>

          {/* Session shortcuts */}
          <div className="p-3.5 border-b border-border">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Clock size={11} className="text-primary" />
              <span>Jump to Next Market Session</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SESSIONS.map((s) => (
                <button
                  key={s.name}
                  onClick={() => jumpToSession(s)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary border border-border/60 hover:border-primary/50 text-foreground text-xs transition-all text-left group"
                >
                  <div className="w-2 h-2 rounded-full shrink-0 group-hover:scale-125 transition-transform" style={{ backgroundColor: s.color }} />
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    {s.startHour.toString().padStart(2, '0')}:00
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick nav */}
          <div className="p-3.5 space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Timeline Jumps
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              <button className="py-1 px-1.5 bg-secondary/50 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/50 text-center transition-colors" onClick={() => onSeek(1)}>Start</button>
              <button className="py-1 px-1.5 bg-secondary/50 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/50 text-center transition-colors" onClick={() => onSeek(Math.floor(raw.length / 4))}>25%</button>
              <button className="py-1 px-1.5 bg-secondary/50 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/50 text-center transition-colors" onClick={() => onSeek(Math.floor(raw.length / 2))}>50%</button>
              <button className="py-1 px-1.5 bg-secondary/50 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/50 text-center transition-colors" onClick={() => onSeek(Math.floor(raw.length * 0.75))}>75%</button>
              <button className="py-1 px-1.5 bg-secondary/50 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/50 text-center transition-colors" onClick={() => onSeek(raw.length)}>End</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <button className="py-1 px-2 bg-secondary/40 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/40 text-center transition-colors" onClick={() => onSeekTime(currentTime - DAY)}>−1 Day</button>
              <button className="py-1 px-2 bg-secondary/40 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/40 text-center transition-colors" onClick={() => onSeekTime(currentTime + DAY)}>+1 Day</button>
              <button className="py-1 px-2 bg-secondary/40 hover:bg-secondary text-foreground text-[10px] font-mono rounded-md border border-border/40 text-center transition-colors" onClick={() => onSeekTime(currentTime + 7 * DAY)}>+1 Week</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
