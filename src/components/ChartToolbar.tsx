import { useState, useCallback } from 'react';
import {
  MousePointer, Minus, Square, TrendingUp, TrendingDown, Columns,
  ArrowUpRight, ArrowRight, Trash2, Ruler, Type, Paintbrush,
  Triangle, Circle, Star, GitCommitHorizontal, ArrowUpDown,
  ChevronDown, Pin, PinOff, Info, Maximize2, Grip
} from 'lucide-react';
import type { DrawingType, ToolCategory } from '@/lib/drawings';
import { ALL_TOOLS, CATEGORY_LABELS } from '@/lib/drawings';

interface ChartToolbarProps {
  activeTool: DrawingType | null;
  onToolChange: (tool: DrawingType | null) => void;
  onClearDrawings: () => void;
  drawingCount: number;
  favorites: (DrawingType | null)[];
  onToggleFavorite: (type: DrawingType | null) => void;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  'null': <MousePointer size={15} />,
  'horizontal': <Minus size={15} />,
  'vertical': <Columns size={15} />,
  'trendline': <TrendingUp size={15} />,
  'ray': <ArrowUpRight size={15} />,
  'extended_line': <ArrowRight size={15} />,
  'info_line': <Info size={15} />,
  'rectangle': <Square size={15} />,
  'ellipse': <Circle size={15} />,
  'triangle': <Triangle size={15} />,
  'fibonacci': <GitCommitHorizontal size={15} />,
  'fib_extension': <Maximize2 size={15} />,
  'pitchfork': <Grip size={15} />,
  'position_long': <TrendingUp size={15} />,
  'position_short': <TrendingDown size={15} />,
  'measure': <Ruler size={15} />,
  'price_range': <ArrowUpDown size={15} />,
  'text': <Type size={15} />,
  'brush': <Paintbrush size={15} />,
};

const CATEGORY_ICONS: Record<ToolCategory, React.ReactNode> = {
  cursor: <MousePointer size={16} />,
  lines: <TrendingUp size={16} />,
  fibonacci: <GitCommitHorizontal size={16} />,
  shapes: <Square size={16} />,
  positions: <TrendingUp size={16} />,
  measure: <Ruler size={16} />,
  text: <Type size={16} />,
};

const CATEGORIES: ToolCategory[] = ['cursor', 'lines', 'fibonacci', 'shapes', 'positions', 'measure', 'text'];

export function ChartToolbar({ activeTool, onToolChange, onClearDrawings, drawingCount, favorites, onToggleFavorite }: ChartToolbarProps) {
  const [expandedCategory, setExpandedCategory] = useState<ToolCategory | null>(null);

  const handleCategoryClick = useCallback((cat: ToolCategory) => {
    if (cat === 'cursor') {
      onToolChange(null);
      setExpandedCategory(null);
      return;
    }
    setExpandedCategory(prev => prev === cat ? null : cat);
  }, [onToolChange]);

  const handleToolSelect = useCallback((type: DrawingType | null) => {
    onToolChange(type);
    setExpandedCategory(null);
  }, [onToolChange]);

  // Get the active tool's category to highlight the sidebar icon
  const activeCategory = activeTool
    ? ALL_TOOLS.find(t => t.type === activeTool)?.category || null
    : 'cursor';

  return (
    <div className="absolute left-0 top-0 bottom-0 z-30 flex" style={{ pointerEvents: 'none' }}>
      {/* Vertical icon bar */}
      <div className="flex flex-col bg-card/95 backdrop-blur-sm border-r border-border w-10 py-1 gap-0.5" style={{ pointerEvents: 'auto' }}>
        {/* Favorites at top */}
        {favorites.length > 0 && (
          <>
            {favorites.map(fav => {
              const key = String(fav);
              return (
                <button
                  key={key}
                  className={`w-10 h-8 flex items-center justify-center transition-colors relative group ${
                    activeTool === fav ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                  onClick={() => handleToolSelect(fav)}
                  title={ALL_TOOLS.find(t => t.type === fav)?.label || 'Cursor'}
                >
                  {TOOL_ICONS[key] || <Star size={14} />}
                  <Star size={6} className="absolute top-0.5 right-0.5 text-primary fill-primary" />
                </button>
              );
            })}
            <div className="mx-2 h-px bg-border" />
          </>
        )}

        {/* Category buttons */}
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat;
          const isExpanded = expandedCategory === cat;
          return (
            <button
              key={cat}
              className={`w-10 h-9 flex items-center justify-center transition-all relative ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              } ${isExpanded ? 'bg-primary/10' : 'hover:bg-secondary'}`}
              onClick={() => handleCategoryClick(cat)}
              title={CATEGORY_LABELS[cat]}
            >
              {CATEGORY_ICONS[cat]}
              {cat !== 'cursor' && (
                <ChevronDown size={7} className={`absolute bottom-0.5 right-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              )}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Clear all */}
        {drawingCount > 0 && (
          <button
            className="w-10 h-9 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors relative"
            onClick={onClearDrawings}
            title={`Clear all (${drawingCount})`}
          >
            <Trash2 size={15} />
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-mono">
              {drawingCount}
            </span>
          </button>
        )}
      </div>

      {/* Flyout panel */}
      {expandedCategory && (
        <div
          className="bg-card/95 backdrop-blur-sm border-r border-border w-48 py-1 animate-in slide-in-from-left-2 duration-150 shadow-xl"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
            {CATEGORY_LABELS[expandedCategory]}
          </div>
          {ALL_TOOLS
            .filter(t => t.category === expandedCategory)
            .map(tool => {
              const key = String(tool.type);
              const isFav = favorites.includes(tool.type);
              return (
                <div key={key} className="flex items-center group">
                  <button
                    className={`flex-1 flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                      activeTool === tool.type
                        ? 'text-primary bg-primary/10'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                    onClick={() => handleToolSelect(tool.type)}
                  >
                    <span className="w-5 flex items-center justify-center opacity-70">
                      {TOOL_ICONS[key]}
                    </span>
                    <span className="flex-1 text-left">{tool.label}</span>
                    {tool.shortcut && (
                      <span className="text-[9px] text-muted-foreground font-mono bg-secondary px-1 rounded">
                        {tool.shortcut}
                      </span>
                    )}
                  </button>
                  <button
                    className={`w-7 h-7 flex items-center justify-center transition-colors ${
                      isFav ? 'text-primary' : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-primary'
                    }`}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(tool.type); }}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFav ? <PinOff size={11} /> : <Pin size={11} />}
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
