import { useState, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Clock,
  Gauge,
  Minimize2,
  Maximize2,
  GripVertical,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';

export type StepMode = 'bar' | 'time';

interface ReplayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  // Speed interval in ms or multiplier
  intervalMs: number;
  onIntervalChange: (ms: number) => void;
  // Step alignment
  stepMode: StepMode;
  onStepModeChange: (mode: StepMode) => void;
  stepMinutes: number;
  onStepMinutesChange: (minutes: number) => void;
  // Progress
  currentBar: number;
  totalBars: number;
  currentTime?: number; // unix seconds
  onSeek: (bar: number) => void;
}

const SPEED_PRESETS = [
  { ms: 1500, label: '0.5x' },
  { ms: 800, label: '1x' },
  { ms: 400, label: '2x' },
  { ms: 200, label: '4x' },
  { ms: 100, label: '8x' },
  { ms: 50, label: 'Turbo' },
];

const STEP_TIMEFRAMES = [
  { minutes: 1, label: '1m' },
  { minutes: 5, label: '5m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1H' },
  { minutes: 240, label: '4H' },
  { minutes: 1440, label: '1D' },
];

export function ReplayControls({
  isPlaying,
  onPlayPause,
  onStepForward,
  onStepBack,
  onReset,
  intervalMs,
  onIntervalChange,
  stepMode,
  onStepModeChange,
  stepMinutes,
  onStepMinutesChange,
  currentBar,
  totalBars,
  currentTime,
  onSeek,
}: ReplayControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);

  // Position state (null = center bottom)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
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
      return saved ? Number(saved) : 92;
    } catch {
      return 92;
    }
  });

  const isDragging = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const currentX = position ? position.x : (window.innerWidth / 2 - 280);
    const currentY = position ? position.y : (window.innerHeight - 70);
    dragStartRef.current = { x: e.clientX - currentX, y: e.clientY - currentY };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 180, ev.clientX - dragStartRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 50, ev.clientY - dragStartRef.current.y));
      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setPosition((curr) => {
        if (curr) {
          localStorage.setItem('replay_controls_pos', JSON.stringify(curr));
        }
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
    setPosition(null);
    localStorage.removeItem('replay_controls_pos');
  };

  const formattedTime = currentTime
    ? new Date(currentTime * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : '';

  const containerStyle: React.CSSProperties = {
    opacity: opacity / 100,
    ...(position ? { left: `${position.x}px`, top: `${position.y}px` } : {}),
  };

  const containerClasses = position
    ? 'fixed z-30 select-none max-w-[94vw] transition-opacity'
    : 'absolute bottom-4 left-1/2 -translate-x-1/2 z-30 select-none max-w-[94vw] transition-opacity';

  // Minimal bullet pill mode
  if (collapsed) {
    return (
      <div className={containerClasses} style={containerStyle}>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border/80 shadow-2xl">
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground px-0.5 flex items-center"
            title="Drag control pill"
          >
            <GripVertical size={13} />
          </div>

          <button
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            onClick={onStepBack}
            title="Step Back"
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
            onClick={onStepForward}
            title="Step Forward"
          >
            <SkipForward size={13} />
          </button>

          <div className="w-px h-3.5 bg-border mx-0.5" />

          {/* Opacity trigger */}
          <div className="relative flex items-center">
            <button
              onClick={() => setShowOpacitySlider((p) => !p)}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              title={`Adjust Opacity: ${opacity}%`}
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

          {position && (
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

        {/* Reset */}
        <button
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={onReset}
          title="Reset to beginning"
        >
          <RotateCcw size={13} />
        </button>

        {/* Step Back */}
        <button
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={onStepBack}
          title="Step Back (Left Arrow)"
        >
          <SkipBack size={14} />
        </button>

        {/* Play / Pause - Glowing Center Button */}
        <button
          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 shadow-md shadow-primary/25 transition-all"
          onClick={onPlayPause}
          title={isPlaying ? 'Pause (Space)' : 'Play Replay (Space)'}
        >
          {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>

        {/* Step Forward */}
        <button
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          onClick={onStepForward}
          title="Step Forward (Right Arrow)"
        >
          <SkipForward size={14} />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Step Mode Toggle */}
        <div className="flex items-center gap-0.5 bg-secondary/80 rounded-full p-0.5 border border-border">
          <button
            onClick={() => onStepModeChange('bar')}
            className={`px-2 py-0.5 text-[11px] font-mono rounded-full transition-all ${
              stepMode === 'bar'
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Advance 1 bar of active chart timeframe per tick"
          >
            1 Bar
          </button>
          <button
            onClick={() => onStepModeChange('time')}
            className={`px-2 py-0.5 text-[11px] font-mono rounded-full flex items-center gap-1 transition-all ${
              stepMode === 'time'
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Advance by fixed timeframe increment per tick"
          >
            <Clock size={10} />
            Time Step
          </button>
        </div>

        {/* Step Minutes Dropdown (when stepMode === 'time') */}
        {stepMode === 'time' && (
          <select
            value={stepMinutes}
            onChange={(e) => onStepMinutesChange(Number(e.target.value))}
            className="bg-secondary text-secondary-foreground border border-border rounded-full px-2 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            title="Replay step time increment"
          >
            {STEP_TIMEFRAMES.map((st) => (
              <option key={st.minutes} value={st.minutes}>
                {st.label} / tick
              </option>
            ))}
          </select>
        )}

        {/* Speed / Delay Selector */}
        <div className="flex items-center gap-1">
          <Gauge size={12} className="text-muted-foreground ml-0.5" />
          <select
            value={intervalMs}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
            className="bg-secondary text-secondary-foreground border border-border rounded-full px-2 py-0.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            title="Playback Speed"
          >
            {SPEED_PRESETS.map((p) => (
              <option key={p.ms} value={p.ms}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Progress Slider & UTC Scrubber */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={Math.max(1, totalBars)}
            value={currentBar}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-20 sm:w-28 md:w-36 h-1.5 accent-primary cursor-pointer bg-secondary rounded-full"
            title="Scrub replay position"
          />

          <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap">
            {formattedTime && (
              <span className="text-primary font-semibold text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">
                {formattedTime}
              </span>
            )}
            <span className="text-muted-foreground text-[10px]">
              {currentBar}/{totalBars}
            </span>
          </div>
        </div>

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
        {position && (
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
