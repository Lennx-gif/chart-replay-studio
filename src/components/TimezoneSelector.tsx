import { useMemo } from 'react';
import { getNewYorkOffset } from '@/lib/timezone';

interface TimezoneSelectorProps {
  offset: number;
  onOffsetChange: (offset: number) => void;
}

export function TimezoneSelector({ offset, onOffsetChange }: TimezoneSelectorProps) {
  const nyOffset = useMemo(() => getNewYorkOffset(), []);

  const TIMEZONES = useMemo(
    () => [
      { offset: nyOffset, label: `New York (UTC${nyOffset >= 0 ? '+' : ''}${nyOffset} · Default)` },
      { offset: 0, label: 'London / UTC+0 (GMT/BST)' },
      { offset: 1, label: 'Frankfurt / UTC+1 (CET)' },
      { offset: 9, label: 'Tokyo / UTC+9 (JST)' },
      { offset: 10, label: 'Sydney / UTC+10 (AEST)' },
      { offset: -8, label: 'UTC-8 (PST · Los Angeles)' },
      { offset: -7, label: 'UTC-7 (MST · Denver)' },
      { offset: -6, label: 'UTC-6 (CST · Chicago)' },
      { offset: -5, label: 'UTC-5 (EST · Fixed)' },
      { offset: -4, label: 'UTC-4 (EDT · Fixed)' },
      { offset: -3, label: 'UTC-3 (BRT · São Paulo)' },
      { offset: 2, label: 'UTC+2 (EET · Athens/Cairo)' },
      { offset: 3, label: 'UTC+3 (MSK · Riyadh/Moscow)' },
      { offset: 4, label: 'UTC+4 (GST · Dubai)' },
      { offset: 5.5, label: 'UTC+5:30 (IST · Mumbai)' },
      { offset: 8, label: 'UTC+8 (SGT/HKT · Singapore/Hong Kong)' },
      { offset: 12, label: 'UTC+12 (NZST · Auckland)' },
    ],
    [nyOffset]
  );

  return (
    <select
      value={offset}
      onChange={(e) => onOffsetChange(Number(e.target.value))}
      className="bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      title="Display timezone"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.offset + tz.label} value={tz.offset}>
          {tz.label}
        </option>
      ))}
    </select>
  );
}
