import { useState, useRef } from 'react';
import type { DrawingType } from '@/lib/drawings';
import { ALL_TOOLS } from '@/lib/drawings';
import {
  MousePointer,
  Minus,
  Columns,
  TrendingUp,
  ArrowUpRight,
  ArrowRight,
  Square,
  Circle,
  Triangle,
  GitCommitHorizontal,
  Maximize2,
  Grip,
  TrendingDown,
  Ruler,
  ArrowUpDown,
  Type,
  Paintbrush,
  GripVertical,
  X,
} from 'lucide-react';

interface FavoritesFloatingBarProps {
  favorites: (DrawingType | null)[];
  activeTool: DrawingType | null;
  onToolSelect: (tool: DrawingType | null) => void;
  onRemoveFavorite: (tool: DrawingType | null) => void;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  'null': <MousePointer size={14} />,
  'horizontal': <Minus size={14} />,
  'vertical': <Columns size={14} />,
  'trendline': <TrendingUp size={14} />,
  'ray': <ArrowUpRight size={14} />,
  'extended_line': <ArrowRight size={14} />,
  'rectangle': <Square size={14} />,
  'ellipse': <Circle size={14} />,
  'triangle': <Triangle size={14} />,
  'fibonacci': <GitCommitHorizontal size={14} />,
  'fib_extension': <Maximize2 size={14} />,
  'pitchfork': <Grip size={14} />,
  'position_long': <TrendingUp size={14} className="text-long" />,
  'position_short': <TrendingDown size={14} className="text-short" />,
  'measure': <Ruler size={14} />,
  'price_range': <ArrowUpDown size={14} />,
  'text': <Type size={14} />,
  'brush': <Paintbrush size={14} />,
};

export function FavoritesFloatingBar({
  favorites,
  activeTool,
  onToolSelect,
  onRemoveFavorite,
}: FavoritesFloatingBarProps) {
  const [position, setPosition] = useState({ x: 70, y: 55 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  if (favorites.length === 0) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 300, moveEvent.clientX - dragStart.current.x)),
        y: Math.max(45, Math.min(window.innerHeight - 80, moveEvent.clientY - dragStart.current.y)),
      });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className="absolute z-40 flex items-center gap-0.5 bg-card/95 backdrop-blur-md border border-border/80 rounded-lg shadow-xl px-1 py-0.5 select-none animate-in fade-in duration-150"
      style={{ left: position.x, top: position.y }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground px-0.5 flex items-center"
        title="Drag toolbar"
      >
        <GripVertical size={13} />
      </div>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Starred tools */}
      {favorites.map((tool) => {
        const key = String(tool);
        const toolDef = ALL_TOOLS.find((t) => t.type === tool);
        const isActive = activeTool === tool;

        return (
          <div key={key} className="relative group">
            <button
              onClick={() => onToolSelect(tool)}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                isActive
                  ? 'bg-primary/20 text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title={toolDef?.label || 'Cursor'}
            >
              {TOOL_ICONS[key] || <MousePointer size={14} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFavorite(tool);
              }}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive hidden group-hover:flex items-center justify-center shadow"
              title="Remove from favorites"
            >
              <X size={8} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
