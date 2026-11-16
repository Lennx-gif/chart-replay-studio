import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  Filter,
  Upload,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Compass,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import type { NewsEventRecord, NewsImpact } from '@/lib/db';
import { listNewsEvents, saveNewsEvents, clearNewsEvents } from '@/lib/store';
import { parseNewsCSV, getReplayEventStatus } from '@/lib/newsParser';
import { SAMPLE_NEWS_EVENTS } from '@/lib/sampleNews';
import { WaybackCalendar, type WaybackDayIndicator, formatYmd } from './WaybackCalendar';

interface NewsFeedProps {
  currentReplayTime?: number;
  symbol?: string;
  onJumpToTime?: (unixSec: number) => void;
}

const CURRENCIES = ['ALL', 'AUTO', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

export function NewsFeed({ currentReplayTime = 0, symbol = 'EURUSD', onJumpToTime }: NewsFeedProps) {
  const [events, setEvents] = useState<NewsEventRecord[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('AUTO');
  const [selectedImpact, setSelectedImpact] = useState<NewsImpact | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateScope, setDateScope] = useState<'day' | 'week' | 'all'>('day');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive current replay date string (YYYY-MM-DD)
  const currentReplayYmd = useMemo(() => {
    if (!currentReplayTime || currentReplayTime <= 0) return null;
    return new Date(currentReplayTime * 1000).toISOString().slice(0, 10);
  }, [currentReplayTime]);

  // Initial selected date follows replay candle if not set
  useEffect(() => {
    if (currentReplayYmd && !selectedDate) {
      setSelectedDate(currentReplayYmd);
    }
  }, [currentReplayYmd, selectedDate]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const all = await listNewsEvents();
      setEvents(all);
    } catch {
      setEvents(SAMPLE_NEWS_EVENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseNewsCSV(text);
      if (parsed.length === 0) {
        toast.error('No valid economic calendar events detected in file');
        return;
      }
      await saveNewsEvents(parsed);
      toast.success(`Imported ${parsed.length} economic events`);
      await loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to import news CSV');
    }
  };

  const handleResetToSample = async () => {
    await clearNewsEvents();
    await saveNewsEvents(SAMPLE_NEWS_EVENTS);
    await loadEvents();
    toast.success('Restored sample economic calendar');
  };

  // Derive target currencies for auto-filtering
  const targetCurrencies = useMemo(() => {
    if (selectedCurrency !== 'AUTO') return [selectedCurrency];
    const s = (symbol || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length >= 6) {
      return [s.slice(0, 3), s.slice(3, 6)];
    }
    return ['USD', 'EUR'];
  }, [selectedCurrency, symbol]);

  // 1. Day indicators for WaybackCalendar (colored impact dots based on active filters)
  const dayIndicators = useMemo(() => {
    const map: Record<string, WaybackDayIndicator> = {};

    for (const e of events) {
      // Currency filter
      if (selectedCurrency !== 'ALL') {
        if (!targetCurrencies.includes(e.currency.toUpperCase())) {
          continue;
        }
      }
      // Impact filter
      if (selectedImpact !== 'ALL' && e.impact !== selectedImpact) {
        continue;
      }

      const dateStr = new Date(e.time * 1000).toISOString().slice(0, 10);
      if (!map[dateStr]) {
        map[dateStr] = { newsImpacts: { high: 0, medium: 0, low: 0 } };
      }

      if (e.impact === 'high') map[dateStr].newsImpacts!.high++;
      else if (e.impact === 'medium') map[dateStr].newsImpacts!.medium++;
      else if (e.impact === 'low') map[dateStr].newsImpacts!.low++;
    }

    return map;
  }, [events, selectedCurrency, targetCurrencies, selectedImpact]);

  // 2. Filter events by currency, impact, AND selected date/scope
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // Currency filter
      if (selectedCurrency !== 'ALL') {
        if (!targetCurrencies.includes(e.currency.toUpperCase())) {
          return false;
        }
      }
      // Impact filter
      if (selectedImpact !== 'ALL' && e.impact !== selectedImpact) {
        return false;
      }

      // Date filtering
      if (dateScope !== 'all' && selectedDate) {
        const eYmd = new Date(e.time * 1000).toISOString().slice(0, 10);
        if (dateScope === 'day') {
          if (eYmd !== selectedDate) return false;
        } else if (dateScope === 'week') {
          // Check if e.time falls in same Monday-Sunday week
          const [sY, sM, sD] = selectedDate.split('-').map(Number);
          const selUtc = Date.UTC(sY, sM - 1, sD) / 1000;
          const selDayOfWeek = (new Date(selUtc * 1000).getUTCDay() + 6) % 7; // Mon = 0
          const weekStart = selUtc - selDayOfWeek * 86400;
          const weekEnd = weekStart + 7 * 86400;
          if (e.time < weekStart || e.time >= weekEnd) return false;
        }
      }

      return true;
    });
  }, [events, selectedCurrency, targetCurrencies, selectedImpact, selectedDate, dateScope]);

  const fmtEventTime = (unix: number) => {
    return new Date(unix * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Jump chart to the start of the currently selected calendar date
  const handleJumpToSelectedDay = () => {
    if (!selectedDate || !onJumpToTime) return;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dayStartUnix = Date.UTC(y, m - 1, d) / 1000;
    onJumpToTime(dayStartUnix);
  };

  const handleSyncToChart = () => {
    if (currentReplayYmd) {
      setSelectedDate(currentReplayYmd);
      setDateScope('day');
    }
  };

  const isSyncedToReplay = selectedDate === currentReplayYmd;

  return (
    <div className="flex flex-col h-full overflow-hidden select-none text-xs">
      {/* 1. Header & Controls */}
      <div className="p-2.5 border-b border-border bg-secondary/30 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Calendar size={13} className="text-primary" />
            <span>Economic Calendar</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCalendar((p) => !p)}
              className={`p-1 rounded text-xs flex items-center gap-1 transition-colors ${
                showCalendar
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Toggle Wayback Calendar"
            >
              <span className="text-[10px] font-mono">Wayback</span>
              {showCalendar ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Import CSV Calendar"
            >
              <Upload size={12} />
            </button>
            <button
              onClick={handleResetToSample}
              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
              title="Reset to bundled sample calendar"
            >
              <RefreshCw size={12} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Currency & Impact Filters Row */}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className="bg-card text-foreground border border-border rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c === 'AUTO' ? `Pair (${targetCurrencies.join('/')})` : c}
              </option>
            ))}
          </select>

          <select
            value={selectedImpact}
            onChange={(e) => setSelectedImpact(e.target.value as any)}
            className="bg-card text-foreground border border-border rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="ALL">All Impacts</option>
            <option value="high">High Impact 🔴</option>
            <option value="medium">Medium Impact 🟠</option>
            <option value="low">Low Impact 🟡</option>
          </select>
        </div>
      </div>

      {/* 2. Compact Wayback Calendar Container */}
      {showCalendar && (
        <div className="p-2 border-b border-border bg-card/60 shrink-0">
          <WaybackCalendar
            mode="compact"
            currentReplayTime={currentReplayTime}
            selectedDate={selectedDate ?? undefined}
            onSelectDate={(ymd) => {
              setSelectedDate(ymd);
              if (dateScope === 'all') setDateScope('day');
            }}
            dayIndicators={dayIndicators}
          />
        </div>
      )}

      {/* 3. Active Historical Date Scope Banner */}
      <div className="px-2.5 py-1.5 bg-secondary/50 border-b border-border flex items-center justify-between text-[10px] font-mono shrink-0">
        <div className="flex items-center gap-1.5 truncate">
          <Clock size={11} className="text-primary shrink-0" />
          <span className="font-bold text-foreground truncate">
            {selectedDate ? selectedDate : 'All Events'}
          </span>
          <span className="text-muted-foreground">({filteredEvents.length})</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Day / Week / All toggles */}
          <div className="flex items-center bg-card rounded border border-border p-0.5">
            <button
              onClick={() => setDateScope('day')}
              className={`px-1 py-0.2 rounded text-[9px] ${
                dateScope === 'day' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setDateScope('week')}
              className={`px-1 py-0.2 rounded text-[9px] ${
                dateScope === 'week' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Wk
            </button>
            <button
              onClick={() => setDateScope('all')}
              className={`px-1 py-0.2 rounded text-[9px] ${
                dateScope === 'all' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
          </div>

          {/* Jump Chart Here action */}
          {selectedDate && onJumpToTime && (
            <button
              onClick={handleJumpToSelectedDay}
              className="px-1.5 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 flex items-center gap-0.5 cursor-pointer"
              title="Jump chart replay to this date"
            >
              <Compass size={10} />
              <span>Jump</span>
            </button>
          )}

          {/* Sync to Chart button if desynchronized */}
          {!isSyncedToReplay && currentReplayYmd && (
            <button
              onClick={handleSyncToChart}
              className="p-1 rounded hover:bg-secondary text-primary cursor-pointer"
              title="Sync calendar to active chart bar date"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* 4. Events Feed List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading calendar...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground space-y-1.5">
            <AlertCircle size={20} className="mx-auto text-muted-foreground opacity-50" />
            <div>No events found for {selectedDate || 'selection'}</div>
            <div className="text-[10px] opacity-75">
              Click &quot;All&quot; above or pick another date with colored impact dots on the Wayback Calendar.
            </div>
            {dateScope !== 'all' && (
              <button
                onClick={() => setDateScope('all')}
                className="mt-2 text-primary hover:underline text-[10px] font-semibold"
              >
                View all upcoming releases
              </button>
            )}
          </div>
        ) : (
          filteredEvents.map((event) => {
            const status = currentReplayTime > 0 ? getReplayEventStatus(event.time, currentReplayTime) : 'passed';
            const isHigh = event.impact === 'high';
            const isMed = event.impact === 'medium';

            return (
              <div
                key={event.id}
                className={`p-2.5 transition-colors group hover:bg-muted/30 ${
                  status === 'active'
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : status === 'upcoming'
                    ? 'bg-card'
                    : 'opacity-75'
                }`}
              >
                {/* Top line: Date/Time + Currency + Impact */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded ${
                        event.currency === 'USD'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : event.currency === 'EUR'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-secondary text-primary'
                      }`}
                    >
                      {event.currency}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {fmtEventTime(event.time)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isHigh ? 'bg-red-500' : isMed ? 'bg-amber-500' : 'bg-yellow-400'
                      }`}
                      title={`${event.impact.toUpperCase()} Impact`}
                    />
                    {status === 'active' && (
                      <span className="text-[9px] font-mono font-bold px-1 rounded bg-primary text-primary-foreground animate-pulse">
                        LIVE
                      </span>
                    )}
                    {status === 'upcoming' && (
                      <span className="text-[9px] font-mono text-primary flex items-center gap-0.5">
                        <Clock size={9} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Event Title */}
                <div className="font-semibold text-foreground text-xs leading-snug">
                  {event.title}
                </div>

                {/* Actual vs Forecast vs Previous */}
                {(event.actual || event.forecast || event.previous) && (
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] font-mono p-1 rounded bg-secondary/40 border border-border/50">
                    <div>
                      <span className="text-muted-foreground block text-[8px] uppercase">Act</span>
                      <span className="font-semibold text-foreground">{event.actual || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[8px] uppercase">Fcst</span>
                      <span className="text-foreground/80">{event.forecast || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[8px] uppercase">Prev</span>
                      <span className="text-muted-foreground">{event.previous || '—'}</span>
                    </div>
                  </div>
                )}

                {/* Direct Jump to event bar */}
                {onJumpToTime && (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      onClick={() => onJumpToTime(event.time)}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer opacity-75 group-hover:opacity-100 transition-opacity"
                      title="Seek chart directly to this event's candle"
                    >
                      <Compass size={11} />
                      <span>Jump Chart Here</span>
                      <ArrowRight size={10} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
