interface TimeframeSelectorProps {
  baseTimeframe: number;
  currentTimeframe: number;
  onTimeframeChange: (tf: number) => void;
}

const ALL_TIMEFRAMES = [
  { minutes: 1, label: '1m' },
  { minutes: 5, label: '5m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1H' },
  { minutes: 240, label: '4H' },
  { minutes: 1440, label: '1D' },
  { minutes: 10080, label: '1W' },
];

export function TimeframeSelector({ baseTimeframe, currentTimeframe, onTimeframeChange }: TimeframeSelectorProps) {
  const availableTFs = ALL_TIMEFRAMES.filter(tf => tf.minutes >= baseTimeframe);

  return (
    <div className="flex items-center gap-0.5">
      {availableTFs.map(({ minutes, label }) => (
        <button
          key={minutes}
          className={`toolbar-btn !px-2 ${currentTimeframe === minutes ? 'toolbar-btn-active' : ''}`}
          onClick={() => onTimeframeChange(minutes)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
