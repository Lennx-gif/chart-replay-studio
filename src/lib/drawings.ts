export type DrawingType =
  | 'trendline'
  | 'horizontal'
  | 'vertical'
  | 'ray'
  | 'rectangle'
  | 'fibonacci'
  | 'position_long'
  | 'position_short';

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
  // Position-specific
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskRewardRatio?: number;
  // Fibonacci levels
  fibLevels?: number[];
  locked?: boolean;
}

export const DEFAULT_COLORS: Record<DrawingType, string> = {
  trendline: '#00bcd4',
  horizontal: '#ff9800',
  vertical: '#9c27b0',
  ray: '#4caf50',
  rectangle: '#00bcd4',
  fibonacci: '#ffd54f',
  position_long: '#26a69a',
  position_short: '#ef5350',
};

export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const DRAWING_LABELS: Record<DrawingType, string> = {
  trendline: 'Trendline',
  horizontal: 'Horizontal Line',
  vertical: 'Vertical Line',
  ray: 'Ray',
  rectangle: 'Rectangle',
  fibonacci: 'Fibonacci Retracement',
  position_long: 'Long Position',
  position_short: 'Short Position',
};

let nextId = 1;
export function createDrawingId(): string {
  return `drawing-${nextId++}`;
}

export function getClicksNeeded(type: DrawingType): number {
  switch (type) {
    case 'horizontal':
    case 'vertical':
      return 1;
    case 'position_long':
    case 'position_short':
      return 3; // entry, SL, TP
    default:
      return 2;
  }
}
