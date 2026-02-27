import { Play, Pause, SkipForward, SkipBack, RotateCcw } from 'lucide-react';

interface ReplayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  currentBar: number;
  totalBars: number;
  onSeek: (bar: number) => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export function ReplayControls({
  isPlaying, onPlayPause, onStepForward, onStepBack, onReset,
  speed, onSpeedChange, currentBar, totalBars, onSeek,
}: ReplayControlsProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-card">
      {/* Playback buttons */}
      <button className="control-btn" onClick={onReset} title="Reset">
        <RotateCcw size={16} />
      </button>
      <button className="control-btn" onClick={onStepBack} title="Step back">
        <SkipBack size={16} />
      </button>
      <button
        className="control-btn !w-10 !h-10 bg-primary/20 text-primary border-primary/40 hover:bg-primary/30"
        onClick={onPlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>
      <button className="control-btn" onClick={onStepForward} title="Step forward">
        <SkipForward size={16} />
      </button>

      {/* Speed selector */}
      <div className="flex items-center gap-1 ml-2">
        <span className="text-xs text-muted-foreground font-mono">Speed:</span>
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="bg-secondary text-secondary-foreground border border-border rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {SPEEDS.map(s => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>

      {/* Progress */}
      <div className="flex-1 flex items-center gap-2 ml-3">
        <input
          type="range"
          min={1}
          max={totalBars}
          value={currentBar}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 h-1 accent-primary cursor-pointer"
        />
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {currentBar} / {totalBars}
        </span>
      </div>
    </div>
  );
}
