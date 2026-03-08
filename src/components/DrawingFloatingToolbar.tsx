import { useState } from 'react';
import type { Drawing, LineStyle } from '@/lib/drawings';
import { DRAWING_LABELS } from '@/lib/drawings';
import {
  Trash2, Lock, Unlock, Copy, X, ShoppingCart,
  Eye, EyeOff, ChevronDown
} from 'lucide-react';

interface DrawingFloatingToolbarProps {
  drawing: Drawing;
  position: { x: number; y: number };
  onUpdate: (updated: Drawing) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPlaceOrder?: () => void;
  onClose: () => void;
}

const QUICK_COLORS = [
  '#d4a54a', '#c47d2e', '#4caf50', '#e05347', '#2196f3',
  '#9c27b0', '#ff9800', '#00bcd4', '#ffffff', '#607d8b',
];
const LINE_WIDTHS = [1, 2, 3, 4];
const LINE_STYLES: { value: LineStyle; label: string; dash: string }[] = [
  { value: 'solid', label: 'Solid', dash: '━━━' },
  { value: 'dashed', label: 'Dashed', dash: '╌╌╌' },
  { value: 'dotted', label: 'Dotted', dash: '┈┈┈' },
];

export function DrawingFloatingToolbar({
  drawing, position, onUpdate, onDelete, onDuplicate, onPlaceOrder, onClose
}: DrawingFloatingToolbarProps) {
  const [showColors, setShowColors] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const x = Math.max(8, Math.min(position.x, window.innerWidth - 460));
  const y = Math.max(8, position.y);

  const isPosition = drawing.type === 'position_long' || drawing.type === 'position_short';
  const supportsExtend = ['trendline', 'ray', 'extended_line', 'horizontal'].includes(drawing.type);
  const supportsFill = ['rectangle', 'ellipse', 'triangle'].includes(drawing.type);
  const opacity = drawing.opacity ?? 1;

  return (
    <div
      className="absolute z-40 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={{ left: x, top: y }}
    >
      {/* Main row */}
      <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl px-1.5 py-1">
        {/* Label */}
        <span className="text-[9px] text-muted-foreground font-mono px-1 select-none truncate max-w-[80px]">
          {DRAWING_LABELS[drawing.type]}
        </span>
        <div className="w-px h-4 bg-border" />

        {/* Color swatch */}
        <button
          className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center"
          style={{ backgroundColor: drawing.color }}
          onClick={() => { setShowColors(!showColors); setShowAdvanced(false); }}
          title="Color"
        />

        {/* Line width */}
        <div className="flex items-center gap-px ml-0.5">
          {LINE_WIDTHS.map(w => (
            <button
              key={w}
              className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                drawing.lineWidth === w ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              onClick={() => onUpdate({ ...drawing, lineWidth: w })}
              title={`${w}px`}
            >
              <div style={{ height: Math.max(1, w), width: 14, backgroundColor: 'currentColor', borderRadius: 1 }} />
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Line style */}
        <div className="flex items-center gap-px">
          {LINE_STYLES.map(s => (
            <button
              key={s.value}
              className={`px-1.5 h-6 text-[9px] font-mono rounded transition-colors ${
                drawing.lineStyle === s.value ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              onClick={() => onUpdate({ ...drawing, lineStyle: s.value })}
              title={s.label}
            >
              {s.dash}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Advanced toggle */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            showAdvanced ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          onClick={() => { setShowAdvanced(!showAdvanced); setShowColors(false); }}
          title="Advanced settings"
        >
          <ChevronDown size={12} className={showAdvanced ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        {/* Visibility */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            drawing.visible === false ? 'text-muted-foreground/40' : 'text-foreground hover:bg-secondary'
          }`}
          onClick={() => onUpdate({ ...drawing, visible: drawing.visible === false ? true : false })}
          title={drawing.visible === false ? 'Show' : 'Hide'}
        >
          {drawing.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>

        {/* Lock */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            drawing.locked ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          onClick={() => onUpdate({ ...drawing, locked: !drawing.locked })}
          title={drawing.locked ? 'Unlock' : 'Lock'}
        >
          {drawing.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>

        {/* Duplicate */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={() => onDuplicate(drawing.id)}
          title="Duplicate"
        >
          <Copy size={12} />
        </button>

        {/* Place order */}
        {onPlaceOrder && (
          <button
            className="h-6 px-2 flex items-center gap-1 rounded text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            onClick={onPlaceOrder}
            title="Place as pending order"
          >
            <ShoppingCart size={11} />
            Order
          </button>
        )}

        {/* Delete */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => onDelete(drawing.id)}
          title="Delete (Del)"
        >
          <Trash2 size={12} />
        </button>

        {/* Close */}
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClose}
        >
          <X size={11} />
        </button>
      </div>

      {/* Color picker */}
      {showColors && (
        <div className="flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-2 py-1.5">
          {QUICK_COLORS.map(c => (
            <button
              key={c}
              className={`w-6 h-6 rounded border transition-all ${
                drawing.color === c ? 'border-foreground scale-110 ring-1 ring-foreground' : 'border-border hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
              onClick={() => { onUpdate({ ...drawing, color: c }); setShowColors(false); }}
            />
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <input
            type="color"
            value={drawing.color}
            onChange={(e) => onUpdate({ ...drawing, color: e.target.value })}
            className="w-6 h-6 bg-transparent border border-border rounded cursor-pointer"
            title="Custom color"
          />
        </div>
      )}

      {/* Advanced settings panel */}
      {showAdvanced && (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-3 py-2 space-y-2 min-w-[220px]">
          {/* Opacity */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Opacity</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => onUpdate({ ...drawing, opacity: parseFloat(e.target.value) })}
                className="w-20 h-1 accent-primary"
              />
              <span className="text-[10px] font-mono text-foreground w-8 text-right">{Math.round(opacity * 100)}%</span>
            </div>
          </div>

          {/* Fill (shapes only) */}
          {supportsFill && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Fill</span>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-5 h-5 rounded border border-border"
                  style={{ backgroundColor: drawing.fillColor || drawing.color + '30' }}
                  onClick={() => {
                    const el = document.createElement('input');
                    el.type = 'color';
                    el.value = drawing.fillColor || drawing.color;
                    el.addEventListener('input', (ev) => {
                      onUpdate({ ...drawing, fillColor: (ev.target as HTMLInputElement).value });
                    });
                    el.click();
                  }}
                  title="Fill color"
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={drawing.fillOpacity ?? 0.1}
                  onChange={(e) => onUpdate({ ...drawing, fillOpacity: parseFloat(e.target.value) })}
                  className="w-16 h-1 accent-primary"
                />
              </div>
            </div>
          )}

          {/* Extend (lines only) */}
          {supportsExtend && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Extend</span>
              <div className="flex items-center gap-1">
                <button
                  className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                    drawing.extendLeft ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => onUpdate({ ...drawing, extendLeft: !drawing.extendLeft })}
                >
                  ← Left
                </button>
                <button
                  className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                    drawing.extendRight ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => onUpdate({ ...drawing, extendRight: !drawing.extendRight })}
                >
                  Right →
                </button>
              </div>
            </div>
          )}

          {/* Show label */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Show Label</span>
            <button
              className={`w-8 h-4 rounded-full transition-colors relative ${
                drawing.showLabel !== false ? 'bg-primary' : 'bg-secondary'
              }`}
              onClick={() => onUpdate({ ...drawing, showLabel: drawing.showLabel === false ? true : false })}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                drawing.showLabel !== false ? 'left-4' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Text input for text/label */}
          {drawing.type === 'text' && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Note</span>
              <input
                type="text"
                value={drawing.text || ''}
                onChange={(e) => onUpdate({ ...drawing, text: e.target.value })}
                placeholder="Enter text..."
                className="w-full bg-secondary text-foreground border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      )}

      {/* Position info */}
      {isPosition && drawing.entryPrice != null && (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-3 py-2 text-[10px] font-mono">
          <div className="grid grid-cols-4 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Entry</span>
            <span className="text-foreground">{drawing.entryPrice?.toFixed(5)}</span>
            <span className="text-muted-foreground">R:R</span>
            <span className="text-primary font-semibold">1:{drawing.riskRewardRatio?.toFixed(1)}</span>
            <span className="text-muted-foreground">SL</span>
            <span className="text-short">{drawing.stopLoss?.toFixed(5)}</span>
            <span className="text-muted-foreground">TP</span>
            <span className="text-long">{drawing.takeProfit?.toFixed(5)}</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-border flex items-center justify-between">
            <span className="text-muted-foreground">Risk</span>
            <span className="text-short">{drawing.stopLoss && drawing.entryPrice ? Math.abs(drawing.entryPrice - drawing.stopLoss).toFixed(5) : '—'}</span>
            <span className="text-muted-foreground">Reward</span>
            <span className="text-long">{drawing.takeProfit && drawing.entryPrice ? Math.abs(drawing.takeProfit - drawing.entryPrice).toFixed(5) : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
