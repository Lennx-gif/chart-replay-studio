import { useState, useMemo } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
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
  { name: 'Sydney', startHour: 21, endHour: 6, color: 'hsl(var(--primary))' },
  { name: 'Tokyo', startHour: 0, endHour: 9, color: 'hsl(280, 60%, 55%)' },
  { name: 'London', startHour: 7, endHour: 16, color: 'hsl(45, 90%, 55%)' },
  { name: 'New York', startHour: 13, endHour: 22, color: 'hsl(var(--long))' },
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
    const target = new Date(`${dateStr}T${timeStr}:00`).getTime() / 1000;
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
    // Find next occurrence of session start from current bar
    const currentTime = bars[Math.min(currentBarIndex - 1, bars.length - 1)]?.time || 0;
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
        className="toolbar-btn text-xs gap-1.5"
        onClick={() => setShowPanel(!showPanel)}
        title="Go to date"
      >
        <Calendar size={13} />
        <span className="hidden sm:inline">Go To</span>
      </button>

      {showPanel && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Go to Date / Session</span>
            <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          {/* Date picker */}
          <div className="p-3 border-b border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Jump to Date</div>
            <div className="flex gap-2 mb-2">
              <input
                type="date"
                value={dateStr}
                min={dateRange.min}
                max={dateRange.max}
                onChange={e => setDateStr(e.target.value)}
                className="flex-1 bg-secondary text-secondary-foreground border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="time"
                value={timeStr}
                onChange={e => setTimeStr(e.target.value)}
                className="w-24 bg-secondary text-secondary-foreground border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleGoTo}
              disabled={!dateStr}
              className="w-full toolbar-btn text-xs justify-center disabled:opacity-40"
            >
              Go
            </button>
          </div>

          {/* Session shortcuts */}
          <div className="p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              <Clock size={10} className="inline mr-1" />
              Jump to Next Session
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {SESSIONS.map(s => (
                <button
                  key={s.name}
                  onClick={() => jumpToSession(s)}
                  className="toolbar-btn text-xs gap-1.5 justify-start"
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                  <span className="text-[9px] text-muted-foreground ml-auto">
                    {s.startHour.toString().padStart(2, '0')}:00
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick nav */}
          <div className="px-3 pb-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Quick Nav</div>
            <div className="flex gap-1.5">
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(1)}>Start</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(Math.floor(bars.length / 4))}>25%</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(Math.floor(bars.length / 2))}>50%</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(Math.floor(bars.length * 0.75))}>75%</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(bars.length)}>End</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
