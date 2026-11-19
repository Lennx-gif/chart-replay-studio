import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MousePointer,
  Minus,
  Square,
  TrendingUp,
  TrendingDown,
  Columns,
  ArrowUpRight,
  ArrowRight,
  Trash2,
  Ruler,
  Type,
  Paintbrush,
  Triangle,
  Circle,
  Star,
  GitCommitHorizontal,
  ArrowUpDown,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Magnet,
  Maximize2,
  Grip,
  ChevronRight,
  Sparkles,
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
  // TradingView utilities
  magnetMode: boolean;
  onToggleMagnet: () => void;
  lockAllDrawings: boolean;
  onToggleLockAll: () => void;
  hideAllDrawings: boolean;
  onToggleHideAll: () => void;
}

const CATEGORY_ICONS: Record<ToolCategory, React.ReactNode> = {
  cursor: <MousePointer size={16} />,
  lines: <TrendingUp size={16} />,
  fibonacci: <GitCommitHorizontal size={16} />,
  shapes: <Square size={16} />,
  positions: <TrendingUp size={16} className="text-long" />,
  measure: <Ruler size={16} />,
  text: <Type size={16} />,
};

const CATEGORIES: ToolCategory[] = [
  'cursor',
  'lines',
  'fibonacci',
  'shapes',
  'positions',
  'measure',
  'text',
];

export function ChartToolbar({
  activeTool,
  onToolChange,
  onClearDrawings,
  drawingCount,
  favorites,
  onToggleFavorite,
  magnetMode,
  onToggleMagnet,
  lockAllDrawings,
  onToggleLockAll,
  hideAllDrawings,
  onToggleHideAll,
}: ChartToolbarProps) {
  const [flyoutCategory, setFlyoutCategory] = useState<ToolCategory | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Close flyout on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setFlyoutCategory(null);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleCategoryClick = useCallback((cat: ToolCategory) => {
    if (cat === 'cursor') {
      onToolChange(null);
      setFlyoutCategory(null);
      return;
    }
    setFlyoutCategory((prev) => (prev === cat ? null : cat));
  }, [onToolChange]);

  const handleSelectTool = useCallback((tool: DrawingType | null) => {
    onToolChange(tool);
    setFlyoutCategory(null);
  }, [onToolChange]);

  const activeCategory = activeTool
    ? ALL_TOOLS.find((t) => t.type === activeTool)?.category || null
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
              const tool = ALL_TOOLS.find(t => t.type === fav);
              const tooltip = tool ? `${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}` : 'Cursor (Esc)';
              return (
                <button
                  onClick={() => handleCategoryClick(cat)}
                  className={`w-9 h-8 flex items-center justify-center rounded transition-colors relative ${
                    isActive || isFlyoutOpen
                      ? 'text-primary bg-primary/15'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                  onClick={() => handleToolSelect(fav)}
                  title={tooltip}
                >
                  {TOOL_ICONS[key] || <Star size={14} />}
                  <Star size={6} className="absolute top-0.5 right-0.5 text-primary fill-primary" />
                </button>

                {/* Submenu Flyout */}
                {isFlyoutOpen && (
                  <div className="absolute left-11 top-0 z-50 w-52 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-2xl py-1.5 animate-in fade-in slide-in-from-left-2 duration-150">
                    <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border/80 flex items-center justify-between">
                      <span>{CATEGORY_LABELS[cat]}</span>
                    </div>

                    <div className="py-1">
                      {categoryTools.map((tool) => {
                        const isToolActive = activeTool === tool.type;
                        const isFavorite = favorites.includes(tool.type);

                        return (
                          <div
                            key={String(tool.type)}
                            className={`flex items-center justify-between px-3 py-1.5 hover:bg-secondary/70 cursor-pointer text-xs transition-colors ${
                              isToolActive ? 'text-primary font-semibold bg-primary/10' : 'text-foreground'
                            }`}
                            onClick={() => handleSelectTool(tool.type)}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span>{tool.label}</span>
                              {tool.shortcut && (
                                <kbd className="text-[9px] font-mono text-muted-foreground bg-secondary px-1 py-0.5 rounded">
                                  {tool.shortcut}
                                </kbd>
                              )}
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(tool.type);
                              }}
                              className={`p-1 rounded hover:scale-110 transition-transform ${
                                isFavorite ? 'text-primary fill-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
                              }`}
                              title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
                            >
                              <Star size={12} className={isFavorite ? 'fill-primary' : ''} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom: Utilities & Modes */}
        <div className="flex flex-col gap-1 items-center border-t border-border pt-2">
          {/* Magnet Mode */}
          <button
            onClick={onToggleMagnet}
            className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${
              magnetMode
                ? 'text-primary bg-primary/20 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title={magnetMode ? 'Magnet Mode: ON (Snaps to High/Low/Open/Close)' : 'Magnet Mode: OFF'}
          >
            <Magnet size={15} />
          </button>

          {/* Lock All Drawings */}
          <button
            onClick={onToggleLockAll}
            className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${
              lockAllDrawings
                ? 'text-amber bg-amber/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title={lockAllDrawings ? 'Unlock all drawings' : 'Lock all drawings'}
          >
            {lockAllDrawings ? <Lock size={15} /> : <Unlock size={15} />}
          </button>

          {/* Hide/Show All Drawings */}
          <button
            onClick={onToggleHideAll}
            className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${
              hideAllDrawings
                ? 'text-short bg-short/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title={hideAllDrawings ? 'Show all drawings' : 'Hide all drawings'}
          >
            {hideAllDrawings ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>

          {/* Clear All Drawings */}
          <button
            onClick={onClearDrawings}
            disabled={drawingCount === 0}
            className="w-9 h-8 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            title={`Clear all drawings (${drawingCount})`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
