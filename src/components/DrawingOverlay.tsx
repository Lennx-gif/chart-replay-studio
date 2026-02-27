import { useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing, DrawingType, DrawingPoint } from '@/lib/drawings';
import { createDrawingId } from '@/lib/drawings';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  activeTool: DrawingType | null;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

// Colors for drawings
const DRAWING_COLORS: Record<DrawingType, string> = {
  trendline: '#00bcd4',
  horizontal: '#ff9800',
  rectangle: 'rgba(0, 188, 212, 0.15)',
};

export function DrawingOverlay({ chart, series, activeTool, drawings, onDrawingsChange, containerRef }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingPointRef = useRef<DrawingPoint | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  const getBarAndPrice = useCallback((e: MouseEvent): DrawingPoint | null => {
    if (!chart || !series || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const timeCoord = chart.timeScale().coordinateToTime(x);
    const priceCoord = series.coordinateToPrice(y);

    if (timeCoord === null || priceCoord === null) return null;
    return { time: timeCoord as number, price: priceCoord };
  }, [chart, series, containerRef]);

  // Handle clicks for drawing
  const handleClick = useCallback((e: MouseEvent) => {
    if (!activeTool) return;
    const point = getBarAndPrice(e);
    if (!point) return;

    if (activeTool === 'horizontal') {
      // Single click - horizontal line
      const drawing: Drawing = {
        id: createDrawingId(),
        type: 'horizontal',
        points: [point],
        color: DRAWING_COLORS.horizontal,
        lineWidth: 1,
      };
      onDrawingsChange([...drawings, drawing]);
    } else {
      // Two-click tools
      if (!pendingPointRef.current) {
        pendingPointRef.current = point;
      } else {
        const drawing: Drawing = {
          id: createDrawingId(),
          type: activeTool,
          points: [pendingPointRef.current, point],
          color: DRAWING_COLORS[activeTool],
          lineWidth: activeTool === 'trendline' ? 2 : 1,
        };
        onDrawingsChange([...drawings, drawing]);
        pendingPointRef.current = null;
      }
    }
  }, [activeTool, drawings, onDrawingsChange, getBarAndPrice]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, [containerRef]);

  // Reset pending point when tool changes
  useEffect(() => {
    pendingPointRef.current = null;
  }, [activeTool]);

  // Attach listeners
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('click', handleClick);
    el.addEventListener('mousemove', handleMouseMove);
    return () => {
      el.removeEventListener('click', handleClick);
      el.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleClick, handleMouseMove, containerRef]);

  // Render drawings on canvas
  useEffect(() => {
    if (!chart || !series || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const timeScale = chart.timeScale();

      for (const drawing of drawings) {
        ctx.strokeStyle = drawing.color;
        ctx.fillStyle = drawing.color;
        ctx.lineWidth = drawing.lineWidth;

        if (drawing.type === 'horizontal' && drawing.points[0]) {
          const y = series.priceToCoordinate(drawing.points[0].price);
          if (y !== null) {
            ctx.beginPath();
            ctx.setLineDash([5, 3]);
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Price label
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = drawing.color;
            const text = drawing.points[0].price.toFixed(4);
            ctx.fillText(text, 5, y - 4);
          }
        } else if (drawing.type === 'trendline' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);

          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);

          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const rx = Math.min(x1, x2);
            const ry = Math.min(y1, y2);
            const rw = Math.abs(x2 - x1);
            const rh = Math.abs(y2 - y1);
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#00bcd4';
            ctx.strokeRect(rx, ry, rw, rh);
          }
        }
      }

      // Draw pending point preview
      if (pendingPointRef.current && mouseRef.current && activeTool) {
        const x1 = timeScale.timeToCoordinate(pendingPointRef.current.time as any);
        const y1 = series.priceToCoordinate(pendingPointRef.current.price);
        if (x1 !== null && y1 !== null) {
          ctx.strokeStyle = DRAWING_COLORS[activeTool];
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
          if (activeTool === 'rectangle') {
            const rx = Math.min(x1, mouseRef.current.x);
            const ry = Math.min(y1, mouseRef.current.y);
            const rw = Math.abs(mouseRef.current.x - x1);
            const rh = Math.abs(mouseRef.current.y - y1);
            ctx.strokeRect(rx, ry, rw, rh);
          } else {
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
    };

    render();

    // Re-render on chart changes
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 100);

    return () => {
      clearInterval(interval);
    };
  }, [chart, series, drawings, activeTool, containerRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
}
