import type { BacktestSession } from '@/lib/db/localDatabase';
import { Calendar, ChevronDown, Layers, Plus } from 'lucide-react';

interface SessionHeaderBadgeProps {
  session: BacktestSession | null;
  onOpenSessionManager: () => void;
  onOpenCreateSession?: () => void;
}

export function SessionHeaderBadge({
  session,
  onOpenSessionManager,
  onOpenCreateSession,
}: SessionHeaderBadgeProps) {
  const filterSummary = session?.dateFilter
    ? session.dateFilter.mode === 'years'
      ? `${session.dateFilter.startYear || ''}${
          session.dateFilter.endYear && session.dateFilter.endYear !== session.dateFilter.startYear
            ? ` - ${session.dateFilter.endYear}`
            : ''
        }`
      : session.dateFilter.mode === 'custom'
      ? 'Custom Window'
      : session.dateFilter.mode === 'months'
      ? 'Month Filter'
      : session.dateFilter.mode === 'blind'
      ? `Blind ${session.dateFilter.blindWindowDays || 60}d`
      : 'Full Data'
    : 'Default Session';

  return (
    <div className="flex items-center gap-1">
      {/* Session Pill */}
      <button
        onClick={onOpenSessionManager}
        className="h-8 flex items-center gap-2 px-2.5 rounded-md bg-secondary/80 hover:bg-primary/10 border border-border hover:border-primary/40 transition-all text-left shadow-sm group"
        title="Manage Backtest Sessions & Data Times"
      >
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <div className="flex flex-col justify-center">
          <span className="text-[11px] font-bold text-foreground truncate max-w-[120px] leading-tight group-hover:text-primary transition-colors">
            {session?.name || 'Backtest Session'}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-1 leading-tight">
            <Calendar size={9} className="text-primary/70" />
            <span>{filterSummary}</span>
            {session?.leverage && session.leverage > 1 && (
              <span className="text-primary font-semibold">1:{session.leverage}</span>
            )}
          </span>
        </div>
        <ChevronDown size={12} className="text-muted-foreground group-hover:text-primary transition-colors ml-0.5" />
      </button>

      {/* Direct Create Session Button */}
      {onOpenCreateSession && (
        <button
          onClick={onOpenCreateSession}
          className="h-8 px-2.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary border border-primary/35 hover:border-primary flex items-center gap-1 text-xs font-semibold transition-all shadow-sm"
          title="Create New Backtest Session (Set Balance, Leverage, Data Times)"
        >
          <Plus size={13} />
          <span className="hidden md:inline">New Session</span>
        </button>
      )}
    </div>
  );
}
