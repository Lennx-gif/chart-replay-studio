export type DrawingType = 'trendline' | 'horizontal' | 'rectangle';

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
}

let nextId = 1;
export function createDrawingId(): string {
  return `drawing-${nextId++}`;
}
