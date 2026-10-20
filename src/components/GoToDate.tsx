import { useState, useMemo } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
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
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(Math.floor(raw.length / 4))}>25%</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(Math.floor(raw.length / 2))}>50%</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(Math.floor(raw.length * 0.75))}>75%</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeek(raw.length)}>End</button>
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeekTime(currentTime - DAY)}>−1 day</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeekTime(currentTime + DAY)}>+1 day</button>
              <button className="toolbar-btn text-xs flex-1" onClick={() => onSeekTime(currentTime + 7 * DAY)}>+1 week</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
