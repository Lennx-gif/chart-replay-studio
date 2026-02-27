interface TimezoneSelectorProps {
  offset: number;
  onOffsetChange: (offset: number) => void;
}

const TIMEZONES = [
  { offset: -12, label: 'UTC-12' },
  { offset: -11, label: 'UTC-11' },
  { offset: -10, label: 'UTC-10 (HST)' },
  { offset: -9, label: 'UTC-9 (AKST)' },
  { offset: -8, label: 'UTC-8 (PST)' },
  { offset: -7, label: 'UTC-7 (MST)' },
  { offset: -6, label: 'UTC-6 (CST)' },
  { offset: -5, label: 'UTC-5 (EST)' },
  { offset: -4, label: 'UTC-4 (AST)' },
  { offset: -3, label: 'UTC-3 (BRT)' },
  { offset: -2, label: 'UTC-2' },
  { offset: -1, label: 'UTC-1' },
  { offset: 0, label: 'UTC+0 (GMT)' },
  { offset: 1, label: 'UTC+1 (CET)' },
  { offset: 2, label: 'UTC+2 (EET)' },
  { offset: 3, label: 'UTC+3 (MSK)' },
  { offset: 4, label: 'UTC+4 (GST)' },
  { offset: 5, label: 'UTC+5 (PKT)' },
  { offset: 5.5, label: 'UTC+5:30 (IST)' },
  { offset: 6, label: 'UTC+6' },
  { offset: 7, label: 'UTC+7 (ICT)' },
  { offset: 8, label: 'UTC+8 (CST/SGT)' },
  { offset: 9, label: 'UTC+9 (JST)' },
  { offset: 10, label: 'UTC+10 (AEST)' },
  { offset: 11, label: 'UTC+11' },
  { offset: 12, label: 'UTC+12 (NZST)' },
];

export function TimezoneSelector({ offset, onOffsetChange }: TimezoneSelectorProps) {
  return (
    <select
      value={offset}
      onChange={(e) => onOffsetChange(Number(e.target.value))}
      className="bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
    >
      {TIMEZONES.map(tz => (
        <option key={tz.offset} value={tz.offset}>{tz.label}</option>
      ))}
    </select>
  );
}
