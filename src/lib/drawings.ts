export type DrawingType =
  | 'trendline'
  | 'horizontal'
  | 'vertical'
  | 'ray'
  | 'extended_line'
  | 'info_line'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'fibonacci'
  | 'fib_extension'
  | 'pitchfork'
  | 'position_long'
  | 'position_short'
  | 'measure'
  | 'text'
  | 'brush'
  | 'price_range';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  label?: string;
  text?: string;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
  showLabel?: boolean;
  // Position-specific
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskRewardRatio?: number;
  // Fibonacci levels
  fibLevels?: number[];
  locked?: boolean;
  visible?: boolean;
  // Brush
  brushPoints?: { x: number; y: number }[];
}

export type ToolCategory = 'cursor' | 'lines' | 'fibonacci' | 'shapes' | 'positions' | 'measure' | 'text';

export interface ToolDef {
  type: DrawingType | null;
  label: string;
  shortcut?: string;
  category: ToolCategory;
}

export const ALL_TOOLS: ToolDef[] = [
  // Cursor
  { type: null, label: 'Cursor', shortcut: 'Esc', category: 'cursor' },
  // Lines
  { type: 'horizontal', label: 'Horizontal Line', shortcut: 'H', category: 'lines' },
  { type: 'vertical', label: 'Vertical Line', shortcut: 'V', category: 'lines' },
  { type: 'trendline', label: 'Trend Line', shortcut: 'T', category: 'lines' },
  { type: 'ray', label: 'Ray', shortcut: 'R', category: 'lines' },
  { type: 'extended_line', label: 'Extended Line', category: 'lines' },
  { type: 'info_line', label: 'Info Line', category: 'lines' },
  // Fibonacci
  { type: 'fibonacci', label: 'Fib Retracement', shortcut: 'F', category: 'fibonacci' },
  { type: 'fib_extension', label: 'Fib Extension', category: 'fibonacci' },
  { type: 'pitchfork', label: 'Pitchfork', category: 'fibonacci' },
  // Shapes
  { type: 'rectangle', label: 'Rectangle', category: 'shapes' },
  { type: 'ellipse', label: 'Ellipse', category: 'shapes' },
  { type: 'triangle', label: 'Triangle', category: 'shapes' },
  { type: 'brush', label: 'Brush', shortcut: 'B', category: 'shapes' },
  // Positions
  { type: 'position_long', label: 'Long Position', shortcut: 'L', category: 'positions' },
  { type: 'position_short', label: 'Short Position', shortcut: 'S', category: 'positions' },
  // Measure
  { type: 'measure', label: 'Measure', shortcut: 'M', category: 'measure' },
  { type: 'price_range', label: 'Price Range', category: 'measure' },
  // Text
  { type: 'text', label: 'Text Note', category: 'text' },
];

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  cursor: 'Cursor',
  lines: 'Lines',
  fibonacci: 'Fib & Gann',
  shapes: 'Shapes',
  positions: 'Positions',
  measure: 'Measure',
  text: 'Text',
};

export const DEFAULT_COLORS: Record<DrawingType, string> = {
  trendline: '#00bcd4',
  horizontal: '#ff9800',
  vertical: '#9c27b0',
  ray: '#4caf50',
  extended_line: '#00bcd4',
  info_line: '#2196f3',
  rectangle: '#00bcd4',
  ellipse: '#ff9800',
  triangle: '#9c27b0',
  fibonacci: '#ffd54f',
  fib_extension: '#ffd54f',
  pitchfork: '#ff5722',
  position_long: '#26a69a',
  position_short: '#ef5350',
  measure: '#9e9e9e',
  price_range: '#9e9e9e',
  text: '#ffffff',
  brush: '#d4a54a',
};

export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const DEFAULT_FIB_EXT_LEVELS = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];

export const DRAWING_LABELS: Record<DrawingType, string> = {
  trendline: 'Trend Line',
  horizontal: 'Horizontal Line',
  vertical: 'Vertical Line',
  ray: 'Ray',
  extended_line: 'Extended Line',
  info_line: 'Info Line',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  fibonacci: 'Fib Retracement',
  fib_extension: 'Fib Extension',
  pitchfork: 'Pitchfork',
  position_long: 'Long Position',
  position_short: 'Short Position',
  measure: 'Measure',
  price_range: 'Price Range',
  text: 'Text Note',
  brush: 'Brush',
};

let nextId = 1;
export function createDrawingId(): string {
  return `drawing-${nextId++}-${Date.now().toString(36)}`;
}

export function getClicksNeeded(type: DrawingType): number {
  switch (type) {
    case 'horizontal':
    case 'vertical':
    case 'text':
      return 1;
    case 'position_long':
    case 'position_short':
    case 'pitchfork':
    case 'triangle':
    case 'fib_extension':
      return 3;
    case 'brush':
      return 0; // drag-based
    default:
      return 2;
  }
}
