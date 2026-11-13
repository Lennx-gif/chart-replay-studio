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
} from 'lucide-react';
import { toast } from 'sonner';
import type { NewsEventRecord, NewsImpact } from '@/lib/db';
import { listNewsEvents, saveNewsEvents, clearNewsEvents } from '@/lib/store';
import { parseNewsCSV, getReplayEventStatus } from '@/lib/newsParser';
import { SAMPLE_NEWS_EVENTS } from '@/lib/sampleNews';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      return true;
    });
  }, [events, selectedCurrency, targetCurrencies, selectedImpact]);

  const fmtEventTime = (unix: number) => {
    return new Date(unix * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none text-xs">
      {/* News Controls Header */}
      <div className="p-2.5 border-b border-border bg-secondary/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Calendar size={13} className="text-primary" />
            <span>Economic Calendar</span>
          </div>
          <div className="flex items-center gap-1">
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

        {/* Filters Row */}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className="bg-card text-foreground border border-border rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="bg-card text-foreground border border-border rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Impacts</option>
            <option value="high">High Impact 🔴</option>
            <option value="medium">Medium Impact 🟠</option>
            <option value="low">Low Impact 🟡</option>
          </select>
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading calendar...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground space-y-1">
            <div>No events found</div>
            <div className="text-[10px] opacity-75">Try changing currency or impact filter</div>
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
                    : 'opacity-70'
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

                {/* Jump to event bar */}
                {onJumpToTime && (
                  <div className="mt-1.5 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onJumpToTime(event.time)}
                      className="text-[9px] text-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <span>Jump to event bar</span>
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
