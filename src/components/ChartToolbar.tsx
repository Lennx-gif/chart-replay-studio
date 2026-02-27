import {
  TrendingUp, Minus, Square, MousePointer, Trash2,
  ArrowUpRight, GitCommitHorizontal, Target, TrendingDown, Columns
} from 'lucide-react';
import type { DrawingType } from '@/lib/drawings';

interface ChartToolbarProps {
  activeTool: DrawingType | null;
  onToolChange: (tool: DrawingType | null) => void;
  onClearDrawings: () => void;
  drawingCount: number;
}

const TOOL_GROUPS: { label: string; tools: { type: DrawingType | null; icon: React.ReactNode; label: string }[] }[] = [
  {
    label: 'Cursor',
    tools: [
      { type: null, icon: <MousePointer size={14} />, label: 'Select' },
    ],
  },
  {
    label: 'Lines',
    tools: [
      { type: 'horizontal', icon: <Minus size={14} />, label: 'H-Line' },
      { type: 'vertical', icon: <Columns size={14} />, label: 'V-Line' },
      { type: 'trendline', icon: <TrendingUp size={14} />, label: 'Trendline' },
      { type: 'ray', icon: <ArrowUpRight size={14} />, label: 'Ray' },
    ],
  },
  {
    label: 'Shapes',
    tools: [
      { type: 'rectangle', icon: <Square size={14} />, label: 'Rectangle' },
      { type: 'fibonacci', icon: <GitCommitHorizontal size={14} />, label: 'Fib Retrace' },
    ],
  },
  {
    label: 'Positions',
    tools: [
      { type: 'position_long', icon: <TrendingUp size={14} />, label: 'Long' },
      { type: 'position_short', icon: <TrendingDown size={14} />, label: 'Short' },
    ],
  },
];

export function ChartToolbar({ activeTool, onToolChange, onClearDrawings, drawingCount }: ChartToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-card overflow-x-auto">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={group.label} className="flex items-center gap-0.5">
          {gi > 0 && <div className="w-px h-5 bg-border mx-1" />}
          {group.tools.map(({ type, icon, label }) => (
            <button
              key={label}
              className={`toolbar-btn gap-1.5 ${activeTool === type ? 'toolbar-btn-active' : ''}`}
              onClick={() => onToolChange(type)}
              title={label}
            >
              {icon}
              <span className="hidden md:inline text-[11px]">{label}</span>
            </button>
          ))}
        </div>
      ))}

      {drawingCount > 0 && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            className="toolbar-btn gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={onClearDrawings}
            title="Clear all drawings"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline text-[11px]">Clear ({drawingCount})</span>
          </button>
        </>
      )}
    </div>
  );
}
