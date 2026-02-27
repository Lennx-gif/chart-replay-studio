import { TrendingUp, Minus, Square, MousePointer, Trash2 } from 'lucide-react';
import type { DrawingType } from '@/lib/drawings';

interface ChartToolbarProps {
  activeTool: DrawingType | null;
  onToolChange: (tool: DrawingType | null) => void;
  onClearDrawings: () => void;
  drawingCount: number;
}

export function ChartToolbar({ activeTool, onToolChange, onClearDrawings, drawingCount }: ChartToolbarProps) {
  const tools: { type: DrawingType | null; icon: React.ReactNode; label: string }[] = [
    { type: null, icon: <MousePointer size={14} />, label: 'Select' },
    { type: 'trendline', icon: <TrendingUp size={14} />, label: 'Trendline' },
    { type: 'horizontal', icon: <Minus size={14} />, label: 'H-Line' },
    { type: 'rectangle', icon: <Square size={14} />, label: 'Rectangle' },
  ];

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card">
      {tools.map(({ type, icon, label }) => (
        <button
          key={label}
          className={`toolbar-btn gap-1.5 ${activeTool === type ? 'toolbar-btn-active' : ''}`}
          onClick={() => onToolChange(type)}
          title={label}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
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
            <span className="hidden sm:inline">Clear ({drawingCount})</span>
          </button>
        </>
      )}
    </div>
  );
}
