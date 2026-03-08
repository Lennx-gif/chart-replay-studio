import { useState } from 'react';
import type { Drawing, LineStyle } from '@/lib/drawings';
import { DRAWING_LABELS } from '@/lib/drawings';
import { Trash2, Lock, Unlock, Copy, Palette, X, ShoppingCart } from 'lucide-react';

interface DrawingFloatingToolbarProps {
  drawing: Drawing;
  position: { x: number; y: number };
  onUpdate: (updated: Drawing) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPlaceOrder?: () => void;
  onClose: () => void;
}

const QUICK_COLORS = ['#d4a54a', '#c47d2e', '#4caf50', '#e05347', '#2196f3', '#9c27b0', '#ff9800', '#ffffff'];
const LINE_WIDTHS = [1, 2, 3, 4];
const LINE_STYLES: { value: LineStyle; svg: string }[] = [
  { value: 'solid', svg: '━━' },
  { value: 'dashed', svg: '┅┅' },
  { value: 'dotted', svg: '┈┈' },
];

export function DrawingFloatingToolbar({ drawing, position, onUpdate, onDelete, onDuplicate, onPlaceOrder, onClose }: DrawingFloatingToolbarProps) {
  const [showColors, setShowColors] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Clamp position to stay in viewport
  const x = Math.max(8, Math.min(position.x, window.innerWidth - 420));
  const y = Math.max(8, position.y);

  return (
    <div
      className="absolute z-40 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={{ left: x, top: y }}
    >
      {/* Main toolbar row */}
      <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur-sm border border-border rounded-md shadow-xl px-1 py-0.5">
        {/* Type label */}
        <span className="text-[9px] text-muted-foreground font-mono px-1.5 select-none">
          {DRAWING_LABELS[drawing.type]}
        </span>
        <div className="w-px h-4 bg-border" />

        {/* Color button */}
        <button
          className="w-5 h-5 rounded-sm border border-border hover:scale-110 transition-transform mx-0.5"
          style={{ backgroundColor: drawing.color }}
          onClick={() => { setShowColors(!showColors); setShowAdvanced(false); }}
          title="Color"
        />

        {/* Width buttons */}
        {LINE_WIDTHS.map(w => (
          <button
            key={w}
            className={`w-6 h-6 flex items-center justify-center rounded-sm text-[9px] font-mono transition-colors ${
              drawing.lineWidth === w ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            onClick={() => onUpdate({ ...drawing, lineWidth: w })}
            title={`${w}px`}
          >
            <div style={{ height: w, width: 12, backgroundColor: 'currentColor', borderRadius: 1 }} />
          </button>
        ))}

        <div className="w-px h-4 bg-border" />

        {/* Style buttons */}
        {LINE_STYLES.map(s => (
          <button
            key={s.value}
            className={`px-1.5 h-6 text-[9px] font-mono rounded-sm transition-colors ${
              drawing.lineStyle === s.value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            onClick={() => onUpdate({ ...drawing, lineStyle: s.value })}
          >
            {s.svg}
          </button>
        ))}

        <div className="w-px h-4 bg-border" />

        {/* Lock */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded-sm transition-colors ${
            drawing.locked ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          onClick={() => onUpdate({ ...drawing, locked: !drawing.locked })}
          title={drawing.locked ? 'Unlock' : 'Lock'}
        >
          {drawing.locked ? <Lock size={11} /> : <Unlock size={11} />}
        </button>

        {/* Duplicate */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={() => onDuplicate(drawing.id)}
          title="Duplicate"
        >
          <Copy size={11} />
        </button>

        {/* Place Order (position tools only) */}
        {onPlaceOrder && (
          <button
            className="w-6 h-6 flex items-center justify-center rounded-sm text-primary hover:bg-primary/10 transition-colors"
            onClick={onPlaceOrder}
            title="Place as pending order"
          >
            <ShoppingCart size={11} />
          </button>
        )}

        {/* Delete */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded-sm text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => onDelete(drawing.id)}
          title="Delete (Del)"
        >
          <Trash2 size={11} />
        </button>

        {/* Close */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClose}
          title="Deselect"
        >
          <X size={10} />
        </button>
      </div>

      {/* Color picker dropdown */}
      {showColors && (
        <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur-sm border border-border rounded-md shadow-lg px-1.5 py-1">
          {QUICK_COLORS.map(c => (
            <button
              key={c}
              className={`w-5 h-5 rounded-sm border transition-all ${
                drawing.color === c ? 'border-foreground scale-110 ring-1 ring-foreground' : 'border-border hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              onClick={() => { onUpdate({ ...drawing, color: c }); setShowColors(false); }}
            />
          ))}
          <div className="w-px h-4 bg-border mx-0.5" />
          <input
            type="color"
            value={drawing.color}
            onChange={(e) => onUpdate({ ...drawing, color: e.target.value })}
            className="w-5 h-5 bg-transparent border border-border rounded-sm cursor-pointer"
            title="Custom color"
          />
        </div>
      )}

      {/* Position info (for position drawings) */}
      {(drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.entryPrice != null && (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-md shadow-lg px-2 py-1.5 text-[9px] font-mono">
          <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
            <span className="text-muted-foreground">Entry</span>
            <span className="text-foreground">{drawing.entryPrice?.toFixed(4)}</span>
            <span className="text-muted-foreground">R:R</span>
            <span className="text-primary">1:{drawing.riskRewardRatio?.toFixed(1)}</span>
            <span className="text-muted-foreground">SL</span>
            <span style={{ color: '#e05347' }}>{drawing.stopLoss?.toFixed(4)}</span>
            <span className="text-muted-foreground">TP</span>
            <span style={{ color: '#4caf50' }}>{drawing.takeProfit?.toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
