import { useState } from 'react';
import { TIMEFRAMES, timeframeToLabel } from '@/lib/timeframeEngine';
import { ChevronDown, Sparkles } from 'lucide-react';

interface TimeframeSelectorProps {
  baseTimeframe: number;
  currentTimeframe: number;
  onTimeframeChange: (tf: number) => void;
}

const PRIMARY_TFS = [1, 5, 15, 60, 240, 1440, 10080];

export function TimeframeSelector({ baseTimeframe, currentTimeframe, onTimeframeChange }: TimeframeSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isSynthesized = currentTimeframe < baseTimeframe;

  return (
    <div className="flex items-center gap-0.5 relative">
      {PRIMARY_TFS.map((minutes) => {
        const label = timeframeToLabel(minutes);
        const isActive = currentTimeframe === minutes;
        const isSub = minutes < baseTimeframe;

        return (
          <button
            key={minutes}
            className={`toolbar-btn !px-2 font-mono text-xs relative ${isActive ? 'toolbar-btn-active' : ''}`}
            onClick={() => onTimeframeChange(minutes)}
            title={isSub ? `${label} (Sub-bar decomposition from ${timeframeToLabel(baseTimeframe)})` : `${label} resolution`}
          >
            {label}
            {isSub && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary/70" />
            )}
          </button>
        );
      })}

      {/* Dropdown for other timeframes */}
      <div className="relative">
        <button
          className={`toolbar-btn !px-1.5 text-xs ${dropdownOpen ? 'toolbar-btn-active' : ''}`}
          onClick={() => setDropdownOpen(!dropdownOpen)}
          title="More timeframes"
        >
          <ChevronDown size={12} />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full mt-1 left-0 z-50 w-36 bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in duration-100">
            <div className="px-2 py-1 text-[10px] uppercase font-mono tracking-wider text-muted-foreground border-b border-border">
              All Timeframes
            </div>
            <div className="max-h-48 overflow-y-auto">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.minutes}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center justify-between hover:bg-secondary/70 transition-colors ${
                    currentTimeframe === tf.minutes ? 'text-primary font-semibold bg-primary/10' : 'text-foreground'
                  }`}
                  onClick={() => {
                    onTimeframeChange(tf.minutes);
                    setDropdownOpen(false);
                  }}
                >
                  <span>{tf.label}</span>
                  {tf.minutes < baseTimeframe ? (
                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                      <Sparkles size={9} className="text-primary" /> sub
                    </span>
                  ) : tf.minutes === baseTimeframe ? (
                    <span className="text-[9px] text-primary/80">base</span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">agg</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isSynthesized && (
        <span
          className="hidden md:inline-flex items-center gap-1 text-[9px] text-primary/90 font-mono px-1.5 py-0.5 rounded bg-primary/10 ml-1 select-none"
          title={`Viewing ${timeframeToLabel(currentTimeframe)} sub-bars decomposed from ${timeframeToLabel(baseTimeframe)} data`}
        >
          <Sparkles size={10} />
          Sub-TF
        </span>
      )}
    </div>
  );
}
