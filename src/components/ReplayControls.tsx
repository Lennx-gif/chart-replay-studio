import { Play, Pause, SkipForward, SkipBack, RotateCcw, ChevronsRight, ChevronsLeft, Flag, ShieldAlert } from 'lucide-react';
import type { StepUnit } from '@/lib/db';
import { SPEEDS, formatBarTime } from '@/lib/replay';

interface ReplayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStep: (count: number) => void;
  onRestart: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  stepUnit: StepUnit;
  onStepUnitChange: (unit: StepUnit) => void;
  pauseOnTradeEvents: boolean;
  onPauseOnTradeEventsChange: (on: boolean) => void;
  position: number;
  total: number;
  /** Time of the newest revealed bar (display timezone already applied by the caller). */
  currentTime?: number;
  tzOffset: number;
  onSeek: (position: number) => void;
  onSetStart: () => void;
  startPosition: number;
  /** Bookmark UI slot (rendered at the right of the bar). */
  bookmarks?: React.ReactNode;
}

const STEP_BIG = 10;

export function ReplayControls({
  isPlaying, onPlayPause, onStep, onRestart, speed, onSpeedChange, stepUnit, onStepUnitChange,
  pauseOnTradeEvents, onPauseOnTradeEventsChange, position, total, currentTime, tzOffset, onSeek,
  onSetStart, startPosition, bookmarks,
}: ReplayControlsProps) {
  const unitLabel = stepUnit === 'bar' ? 'bar' : 'candle';
  const pct = total > 1 ? ((position - 1) / (total - 1)) * 100 : 0;

  return (
    <div className="flex flex-col border-t border-border bg-card">
      {/* Scrubber */}
      <div className="flex items-center gap-3 px-3 pt-2">
        <input
          type="range"
          min={1}
          max={Math.max(1, total)}
          value={position}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 h-1 accent-primary cursor-pointer"
          aria-label="Replay position"
        />
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {currentTime != null ? formatBarTime(currentTime, tzOffset) : '—'} · {position.toLocaleString()} / {total.toLocaleString()} ({pct.toFixed(0)}%)
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
        {/* Transport */}
        <button className="control-btn" onClick={onRestart} title="Back to replay start">
          <RotateCcw size={16} />
        </button>
        <button className="control-btn" onClick={() => onStep(-STEP_BIG)} title={`Back ${STEP_BIG} ${unitLabel}s (Shift+←)`}>
          <ChevronsLeft size={16} />
        </button>
        <button className="control-btn" onClick={() => onStep(-1)} title={`Back 1 ${unitLabel} (←)`}>
          <SkipBack size={16} />
        </button>
        <button
          className="control-btn !w-10 !h-10 bg-primary/20 text-primary border-primary/40 hover:bg-primary/30"
          onClick={onPlayPause}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <button className="control-btn" onClick={() => onStep(1)} title={`Forward 1 ${unitLabel} (→)`}>
          <SkipForward size={16} />
        </button>
        <button className="control-btn" onClick={() => onStep(STEP_BIG)} title={`Forward ${STEP_BIG} ${unitLabel}s (Shift+→)`}>
          <ChevronsRight size={16} />
        </button>

        {/* Step unit */}
        <div className="flex items-center ml-2 rounded border border-border overflow-hidden" role="group" aria-label="Step unit">
          {(['bar', 'candle'] as StepUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => onStepUnitChange(u)}
              className={`px-2 py-1 text-[10px] font-mono uppercase transition-colors ${
                stepUnit === u ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={u === 'bar' ? 'Step by the finest bar in the data' : 'Step by whole candles of the chart timeframe'}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs text-muted-foreground font-mono">Speed</span>
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="bg-secondary text-secondary-foreground border border-border rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            title="Units per second (+ / - to change)"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}/s</option>
            ))}
          </select>
        </div>

        {/* Pause on trade events */}
        <button
          onClick={() => onPauseOnTradeEventsChange(!pauseOnTradeEvents)}
          className={`toolbar-btn text-xs gap-1 ml-2 ${pauseOnTradeEvents ? 'toolbar-btn-active' : ''}`}
          title="Pause playback when an order fills or hits SL/TP"
        >
          <ShieldAlert size={12} />
          <span className="hidden xl:inline">Pause on trade</span>
        </button>

        <button
          onClick={onSetStart}
          className="toolbar-btn text-xs gap-1"
          title={`Make the current bar this session's start point (currently bar ${startPosition.toLocaleString()})`}
        >
          <Flag size={12} />
          <span className="hidden xl:inline">Set start</span>
        </button>

        <div className="ml-auto">{bookmarks}</div>
      </div>
    </div>
  );
}
