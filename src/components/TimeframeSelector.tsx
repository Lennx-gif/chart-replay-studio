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
  return (
    <div className="flex items-center gap-0.5">
      {ALL_TIMEFRAMES.map(({ minutes, label }) => {
        const isLower = minutes < baseTimeframe;
        return (
          <button
            key={minutes}
            className={`toolbar-btn !px-2 ${currentTimeframe === minutes ? 'toolbar-btn-active font-bold text-primary' : ''}`}
            onClick={() => onTimeframeChange(minutes)}
            title={isLower ? `${label} (Synthesized lower timeframe from ${baseTimeframe}m data)` : `${label} timeframe`}
          >
            {label}
            {isLower && <span className="ml-0.5 text-[8px] text-primary/70">★</span>}
          </button>
        );
      })}
    </div>
  );
}
