import { useState, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  ChevronsRight,
  ChevronsLeft,
  Flag,
  ShieldAlert,
  GripVertical,
  SlidersHorizontal,
  Undo2,
  Minimize2,
  Maximize2,
} from 'lucide-react';
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
  isPlaying,
  onPlayPause,
  onStep,
  onRestart,
  speed,
  onSpeedChange,
  stepUnit,
  onStepUnitChange,
  pauseOnTradeEvents,
  onPauseOnTradeEventsChange,
  position,
  total,
  currentTime,
  tzOffset,
  onSeek,
  onSetStart,
  startPosition,
  bookmarks,
}: ReplayControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);

  // Position state (null = center bottom)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('replay_controls_pos');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Opacity state (20% to 100%)
  const [opacity, setOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('replay_controls_opacity');
      return saved ? Number(saved) : 95;
    } catch {
      return 95;
    }
  });

  const isDragging = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const currentX = dragPos ? dragPos.x : window.innerWidth / 2 - 320;
    const currentY = dragPos ? dragPos.y : window.innerHeight - 70;
    dragStartRef.current = { x: e.clientX - currentX, y: e.clientY - currentY };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 180, ev.clientX - dragStartRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 50, ev.clientY - dragStartRef.current.y));
      setDragPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setDragPos((curr) => {
        if (curr) localStorage.setItem('replay_controls_pos', JSON.stringify(curr));
        return curr;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    localStorage.setItem('replay_controls_opacity', String(val));
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDragPos(null);
    localStorage.removeItem('replay_controls_pos');
  };

  const unitLabel = stepUnit === 'bar' ? 'bar' : 'candle';
  const pct = total > 1 ? ((position - 1) / (total - 1)) * 100 : 0;
  const timeFormatted = currentTime != null ? formatBarTime(currentTime, tzOffset) : '';

  const containerStyle: React.CSSProperties = {
    opacity: opacity / 100,
    ...(dragPos ? { left: `${dragPos.x}px`, top: `${dragPos.y}px` } : {}),
  };

  const containerClasses = dragPos
    ? 'fixed z-30 select-none max-w-[94vw] transition-opacity'
    : 'absolute bottom-4 left-1/2 -translate-x-1/2 z-30 select-none max-w-[94vw] transition-opacity';

  // Minimal collapsed pill
  if (collapsed) {
    return (
      <div className={containerClasses} style={containerStyle}>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/92 backdrop-blur-md border border-border/80 shadow-2xl">
          <div
            onMouseDown={handleDragStart}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground px-0.5 flex items-center"
            title="Drag control pill"
          >
            <GripVertical size={13} />
          </div>

          <button
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            onClick={() => onStep(-1)}
            title="Step Back 1"
          >
            <SkipBack size={13} />
          </button>

          <button
            className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 shadow-md shadow-primary/25 transition-all"
            onClick={onPlayPause}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>

          <button
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            onClick={() => onStep(1)}
            title="Step Forward 1"
          >
            <SkipForward size={13} />
          </button>

          <div className="w-px h-3.5 bg-border mx-0.5" />

          {/* Opacity popover */}
          <div className="relative flex items-center">
            <button
              onClick={() => setShowOpacitySlider((p) => !p)}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              title={`Opacity: ${opacity}%`}
            >
              <SlidersHorizontal size={11} />
            </button>
            {showOpacitySlider && (
              <div className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl px-2.5 py-1.5 flex items-center gap-2 select-none z-50 whitespace-nowrap">
                <span className="text-[10px] font-mono text-muted-foreground">Opacity</span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={opacity}
                  onChange={(e) => handleOpacityChange(Number(e.target.value))}
                  className="w-16 h-1 accent-primary cursor-pointer"
                />
                <span className="text-[10px] font-mono text-foreground font-semibold">{opacity}%</span>
              </div>
            )}
          </div>

          {dragPos && (
            <button
              onClick={handleResetPosition}
              className="p-1 rounded-full text-muted-foreground hover:text-primary transition-colors"
              title="Snap Back to Bottom Center"
            >
              <Undo2 size={11} />
            </button>
          )}

          <button
            onClick={() => setCollapsed(false)}
            className="p-1 rounded-full text-muted-foreground hover:text-primary transition-colors"
            title="Expand Controls"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Expanded bullet pill
  return (
    <div className={containerClasses} style={containerStyle}>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/92 backdrop-blur-md border border-border/80 shadow-2xl text-foreground">
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground px-0.5 -ml-1 flex items-center select-none"
          title="Drag Controls Anywhere"
        >
          <GripVertical size={14} />
        </div>

        {/* Reset / Restart */}
        <button
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={onRestart}
          title="Restart Replay"
        >
          <RotateCcw size={13} />
        </button>

        {/* Big step back */}
        <button
          className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={() => onStep(-STEP_BIG)}
          title={`Back ${STEP_BIG} ${unitLabel}s (Shift+Left)`}
        >
          <ChevronsLeft size={13} />
        </button>

        {/* Step back 1 */}
        <button
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={() => onStep(-1)}
          title={`Back 1 ${unitLabel} (Left Arrow)`}
        >
          <SkipBack size={14} />
        </button>

        {/* Play / Pause button */}
        <button
          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 shadow-md shadow-primary/25 transition-all"
          onClick={onPlayPause}
          title={isPlaying ? 'Pause (Space)' : 'Play Replay (Space)'}
        >
          {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>

        {/* Step forward 1 */}
        <button
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={() => onStep(1)}
          title={`Forward 1 ${unitLabel} (Right Arrow)`}
        >
          <SkipForward size={14} />
        </button>

        {/* Big step forward */}
        <button
          className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={() => onStep(STEP_BIG)}
          title={`Forward ${STEP_BIG} ${unitLabel}s (Shift+Right)`}
        >
          <ChevronsRight size={13} />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Step Unit Toggle */}
        <div className="flex items-center gap-0.5 bg-secondary/80 rounded-full p-0.5 border border-border">
          {(['bar', 'candle'] as StepUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => onStepUnitChange(u)}
              className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded-full transition-all ${
                stepUnit === u ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={u === 'bar' ? 'Step by base data bar' : 'Step by chart timeframe candle'}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1">
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="bg-secondary text-secondary-foreground border border-border rounded-full px-2 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            title="Playback Speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Scrubber & Time */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={Math.max(1, total)}
            value={position}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-20 sm:w-28 md:w-36 h-1.5 accent-primary cursor-pointer bg-secondary rounded-full"
            title="Scrub replay position"
          />

          <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap">
            {timeFormatted && (
              <span className="text-primary font-semibold text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">
                {timeFormatted}
              </span>
            )}
            <span className="text-muted-foreground text-[10px]">
              {position.toLocaleString()}/{total.toLocaleString()} ({pct.toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* Pause on trade events */}
        <button
          onClick={() => onPauseOnTradeEventsChange(!pauseOnTradeEvents)}
          className={`p-1 rounded-full text-xs transition-colors ${
            pauseOnTradeEvents ? 'text-primary bg-primary/15' : 'text-muted-foreground hover:text-foreground'
          }`}
          title="Pause playback when an order fills or hits SL/TP"
        >
          <ShieldAlert size={13} />
        </button>

        {/* Set Start Point */}
        <button
          onClick={onSetStart}
          className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          title={`Make the current bar this session's start point (currently bar ${startPosition.toLocaleString()})`}
        >
          <Flag size={13} />
        </button>

        {/* Bookmarks slot */}
        {bookmarks && <div className="flex items-center">{bookmarks}</div>}

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Opacity Popover Controller */}
        <div className="relative flex items-center">
          <button
            onClick={() => setShowOpacitySlider((p) => !p)}
            className={`p-1 rounded-full transition-colors flex items-center gap-1 text-[10px] font-mono ${
              showOpacitySlider ? 'text-primary bg-primary/15' : 'text-muted-foreground hover:text-foreground'
            }`}
            title={`Adjust Panel Opacity: ${opacity}% (Thin translucent glass)`}
          >
            <SlidersHorizontal size={12} />
            <span className="text-[10px] hidden md:inline">{opacity}%</span>
          </button>

          {showOpacitySlider && (
            <div className="absolute bottom-9 right-0 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl px-3 py-2 flex items-center gap-2 select-none z-50 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Opacity</span>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => handleOpacityChange(Number(e.target.value))}
                className="w-20 h-1 accent-primary cursor-pointer"
              />
              <span className="text-[10px] font-mono text-foreground font-bold w-8 text-right">{opacity}%</span>
            </div>
          )}
        </div>

        {/* Snap Back / Reset Position (if dragged away) */}
        {dragPos && (
          <button
            onClick={handleResetPosition}
            className="p-1 rounded-full text-muted-foreground hover:text-primary transition-colors"
            title="Snap back to bottom center"
          >
            <Undo2 size={12} />
          </button>
        )}

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors ml-0.5"
          title="Minimize Controls"
        >
          <Minimize2 size={12} />
        </button>
      </div>
    </div>
  );
}
