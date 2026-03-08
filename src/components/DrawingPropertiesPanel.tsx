import { useState } from 'react';
import type { Drawing, LineStyle } from '@/lib/drawings';
import { DRAWING_LABELS } from '@/lib/drawings';
import { X, Lock, Unlock, Trash2, Palette } from 'lucide-react';

interface DrawingPropertiesPanelProps {
  drawing: Drawing;
  onUpdate: (updated: Drawing) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const COLOR_PRESETS = [
  '#d4a54a', '#c47d2e', '#a0855c', '#4caf50', '#e05347',
  '#8b6914', '#ff9800', '#9c27b0', '#2196f3', '#ffd54f',
  '#e91e63', '#ffffff', '#78909c', '#00bcd4',
];

const LINE_STYLES: { value: LineStyle; label: string }[] = [
  { value: 'solid', label: '━━━' },
  { value: 'dashed', label: '┅┅┅' },
  { value: 'dotted', label: '┈┈┈' },
];

export function DrawingPropertiesPanel({ drawing, onUpdate, onDelete, onClose }: DrawingPropertiesPanelProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="absolute top-2 right-2 z-30 panel p-3 w-64 shadow-xl animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-foreground">
          {DRAWING_LABELS[drawing.type]}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Color */}
      <div className="mb-3">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Color</label>
        <div className="flex items-center gap-1 flex-wrap">
          {COLOR_PRESETS.map(c => (
            <button
              key={c}
              className={`w-5 h-5 rounded-sm border transition-all ${
                drawing.color === c ? 'border-foreground scale-110' : 'border-border hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              onClick={() => onUpdate({ ...drawing, color: c })}
            />
          ))}
          <button
            className="w-5 h-5 rounded-sm border border-border flex items-center justify-center hover:border-foreground transition-colors"
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            <Palette size={10} className="text-muted-foreground" />
          </button>
        </div>
        {showColorPicker && (
          <input
            type="color"
            value={drawing.color}
            onChange={(e) => onUpdate({ ...drawing, color: e.target.value })}
            className="mt-1 w-full h-6 bg-transparent border border-border rounded cursor-pointer"
          />
        )}
      </div>

      {/* Line width */}
      <div className="mb-3">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
          Width: {drawing.lineWidth}px
        </label>
        <input
          type="range"
          min={1}
          max={5}
          value={drawing.lineWidth}
          onChange={(e) => onUpdate({ ...drawing, lineWidth: Number(e.target.value) })}
          className="w-full h-1 accent-primary"
        />
      </div>

      {/* Line style */}
      <div className="mb-3">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Style</label>
        <div className="flex gap-1">
          {LINE_STYLES.map(s => (
            <button
              key={s.value}
              className={`toolbar-btn !px-2 font-mono text-xs ${
                drawing.lineStyle === s.value ? 'toolbar-btn-active' : ''
              }`}
              onClick={() => onUpdate({ ...drawing, lineStyle: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div className="mb-3">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Label</label>
        <input
          type="text"
          value={drawing.label || ''}
          onChange={(e) => onUpdate({ ...drawing, label: e.target.value })}
          placeholder="Optional label..."
          className="w-full bg-secondary text-secondary-foreground border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Position details */}
      {(drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.entryPrice != null && (
        <div className="mb-3 p-2 bg-secondary/50 rounded border border-border">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Position</label>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
            <span className="text-muted-foreground">Entry:</span>
            <span className="text-foreground">{drawing.entryPrice?.toFixed(4)}</span>
            <span className="text-muted-foreground">SL:</span>
            <span className="text-short">{drawing.stopLoss?.toFixed(4)}</span>
            <span className="text-muted-foreground">TP:</span>
            <span className="text-long">{drawing.takeProfit?.toFixed(4)}</span>
            {drawing.riskRewardRatio != null && (
              <>
                <span className="text-muted-foreground">R:R:</span>
                <span className="text-primary">1:{drawing.riskRewardRatio.toFixed(1)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t border-border">
        <button
          className="toolbar-btn gap-1 flex-1"
          onClick={() => onUpdate({ ...drawing, locked: !drawing.locked })}
        >
          {drawing.locked ? <Lock size={12} /> : <Unlock size={12} />}
          {drawing.locked ? 'Locked' : 'Lock'}
        </button>
        <button
          className="toolbar-btn gap-1 flex-1 text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(drawing.id)}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}
