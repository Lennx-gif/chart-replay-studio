import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing, DrawingType, DrawingPoint, LineStyle } from '@/lib/drawings';
import { createDrawingId, DEFAULT_COLORS, DEFAULT_FIB_LEVELS, getClicksNeeded } from '@/lib/drawings';
import { DrawingPropertiesPanel } from './DrawingPropertiesPanel';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  activeTool: DrawingType | null;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

function setLineDash(ctx: CanvasRenderingContext2D, style: LineStyle) {
  switch (style) {
    case 'dashed': ctx.setLineDash([6, 4]); break;
    case 'dotted': ctx.setLineDash([2, 3]); break;
    default: ctx.setLineDash([]); break;
  }
}

export function DrawingOverlay({ chart, series, activeTool, drawings, onDrawingsChange, containerRef }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingPointsRef = useRef<DrawingPoint[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const selectedDrawing = drawings.find(d => d.id === selectedDrawingId) || null;

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

  const handleClick = useCallback((e: MouseEvent) => {
    if (!activeTool) {
      // In select mode, check if clicking near a drawing
      const point = getBarAndPrice(e);
      if (point) {
        // Simple: select nearest horizontal line by price proximity
        let nearest: Drawing | null = null;
        let minDist = Infinity;
        for (const d of drawings) {
          if (d.type === 'horizontal' && d.points[0]) {
            const dist = Math.abs(d.points[0].price - point.price);
            if (dist < minDist) { minDist = dist; nearest = d; }
          } else if (d.points.length > 0) {
            const dist = Math.abs(d.points[0].price - point.price);
            if (dist < minDist) { minDist = dist; nearest = d; }
          }
        }
        // Only select if reasonably close (within ~1% of visible range)
        if (nearest && series) {
          setSelectedDrawingId(nearest.id);
        } else {
          setSelectedDrawingId(null);
        }
      }
      return;
    }

    const point = getBarAndPrice(e);
    if (!point) return;

    const needed = getClicksNeeded(activeTool);

    if (needed === 1) {
      const drawing: Drawing = {
        id: createDrawingId(),
        type: activeTool,
        points: [point],
        color: DEFAULT_COLORS[activeTool],
        lineWidth: activeTool === 'horizontal' ? 1 : 1,
        lineStyle: activeTool === 'horizontal' ? 'dashed' : 'solid',
      };
      onDrawingsChange([...drawings, drawing]);
      pendingPointsRef.current = [];
    } else if (needed === 3) {
      // Position tool: entry, SL, TP
      const pts = [...pendingPointsRef.current, point];
      if (pts.length < 3) {
        pendingPointsRef.current = pts;
      } else {
        const entry = pts[0].price;
        const sl = pts[1].price;
        const tp = pts[2].price;
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tp - entry);
        const rr = risk > 0 ? reward / risk : 0;

        const drawing: Drawing = {
          id: createDrawingId(),
          type: activeTool,
          points: pts,
          color: DEFAULT_COLORS[activeTool],
          lineWidth: 1,
          lineStyle: 'solid',
          entryPrice: entry,
          stopLoss: sl,
          takeProfit: tp,
          riskRewardRatio: rr,
        };
        onDrawingsChange([...drawings, drawing]);
        pendingPointsRef.current = [];
      }
    } else {
      // Two-click tools
      if (pendingPointsRef.current.length === 0) {
        pendingPointsRef.current = [point];
      } else {
        const drawing: Drawing = {
          id: createDrawingId(),
          type: activeTool,
          points: [pendingPointsRef.current[0], point],
          color: DEFAULT_COLORS[activeTool],
          lineWidth: 2,
          lineStyle: 'solid',
          ...(activeTool === 'fibonacci' ? { fibLevels: DEFAULT_FIB_LEVELS } : {}),
        };
        onDrawingsChange([...drawings, drawing]);
        pendingPointsRef.current = [];
      }
    }
  }, [activeTool, drawings, onDrawingsChange, getBarAndPrice, series]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, [containerRef]);

  useEffect(() => {
    pendingPointsRef.current = [];
  }, [activeTool]);

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

  // Render
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
        const isSelected = drawing.id === selectedDrawingId;
        ctx.strokeStyle = drawing.color;
        ctx.fillStyle = drawing.color;
        ctx.lineWidth = drawing.lineWidth;
        setLineDash(ctx, drawing.lineStyle);

        if (isSelected) {
          ctx.lineWidth = drawing.lineWidth + 1;
          ctx.shadowColor = drawing.color;
          ctx.shadowBlur = 6;
        }

        if (drawing.type === 'horizontal' && drawing.points[0]) {
          const y = series.priceToCoordinate(drawing.points[0].price);
          if (y !== null) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            // Label
            ctx.setLineDash([]);
            ctx.font = '10px JetBrains Mono, monospace';
            const text = drawing.label || drawing.points[0].price.toFixed(4);
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = drawing.color + '30';
            ctx.fillRect(width - tw - 12, y - 8, tw + 8, 16);
            ctx.fillStyle = drawing.color;
            ctx.fillText(text, width - tw - 8, y + 4);
          }
        } else if (drawing.type === 'vertical' && drawing.points[0]) {
          const x = timeScale.timeToCoordinate(drawing.points[0].time as any);
          if (x !== null) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
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
            // Draw anchor dots
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
          }
        } else if (drawing.type === 'ray' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            // Extend to edge
            const dx = x2 - x1;
            const dy = y2 - y1;
            const extX = dx > 0 ? width + 100 : -100;
            const t = dx !== 0 ? (extX - x1) / dx : 10;
            const extY = y1 + dy * t;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(extX, extY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          }
        } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
            const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
            ctx.globalAlpha = 0.12;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.globalAlpha = 1;
            ctx.strokeRect(rx, ry, rw, rh);
          }
        } else if (drawing.type === 'fibonacci' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const levels = drawing.fibLevels || DEFAULT_FIB_LEVELS;
            const priceDiff = drawing.points[1].price - drawing.points[0].price;
            ctx.font = '10px JetBrains Mono, monospace';
            for (const level of levels) {
              const price = drawing.points[0].price + priceDiff * level;
              const y = series.priceToCoordinate(price);
              if (y !== null) {
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.setLineDash(level === 0 || level === 1 ? [] : [4, 4]);
                ctx.moveTo(Math.min(x1, x2), y);
                ctx.lineTo(Math.max(x1, x2) + 50, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.setLineDash([]);
                // Fill between levels
                const text = `${(level * 100).toFixed(1)}% (${price.toFixed(4)})`;
                ctx.fillStyle = drawing.color;
                ctx.fillText(text, Math.max(x1, x2) + 6, y + 4);
              }
            }
            // Shaded zones
            for (let i = 0; i < levels.length - 1; i++) {
              const p1 = drawing.points[0].price + priceDiff * levels[i];
              const p2 = drawing.points[0].price + priceDiff * levels[i + 1];
              const cy1 = series.priceToCoordinate(p1);
              const cy2 = series.priceToCoordinate(p2);
              if (cy1 !== null && cy2 !== null) {
                ctx.fillStyle = drawing.color;
                ctx.globalAlpha = 0.03 + (i * 0.015);
                ctx.fillRect(Math.min(x1, x2), Math.min(cy1, cy2), Math.abs(x2 - x1) + 50, Math.abs(cy2 - cy1));
                ctx.globalAlpha = 1;
              }
            }
          }
        } else if ((drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.points.length >= 3) {
          const entryPrice = drawing.entryPrice!;
          const slPrice = drawing.stopLoss!;
          const tpPrice = drawing.takeProfit!;

          const entryY = series.priceToCoordinate(entryPrice);
          const slY = series.priceToCoordinate(slPrice);
          const tpY = series.priceToCoordinate(tpPrice);
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);

          if (entryY !== null && slY !== null && tpY !== null && x1 !== null) {
            const boxWidth = 200;

            // TP zone
            ctx.fillStyle = '#26a69a';
            ctx.globalAlpha = 0.1;
            ctx.fillRect(x1, Math.min(entryY, tpY), boxWidth, Math.abs(tpY - entryY));
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#26a69a';
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(x1, tpY); ctx.lineTo(x1 + boxWidth, tpY); ctx.stroke();
            ctx.setLineDash([]);

            // SL zone
            ctx.fillStyle = '#ef5350';
            ctx.globalAlpha = 0.1;
            ctx.fillRect(x1, Math.min(entryY, slY), boxWidth, Math.abs(slY - entryY));
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ef5350';
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(x1, slY); ctx.lineTo(x1 + boxWidth, slY); ctx.stroke();
            ctx.setLineDash([]);

            // Entry line
            ctx.strokeStyle = drawing.color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x1, entryY); ctx.lineTo(x1 + boxWidth, entryY); ctx.stroke();

            // Labels
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = '#26a69a';
            ctx.fillText(`TP: ${tpPrice.toFixed(4)}`, x1 + 4, tpY + (tpY < entryY ? -4 : 14));
            ctx.fillStyle = '#ef5350';
            ctx.fillText(`SL: ${slPrice.toFixed(4)}`, x1 + 4, slY + (slY > entryY ? 14 : -4));
            ctx.fillStyle = drawing.color;
            ctx.fillText(
              `${drawing.type === 'position_long' ? 'LONG' : 'SHORT'} @ ${entryPrice.toFixed(4)}  R:R 1:${(drawing.riskRewardRatio || 0).toFixed(1)}`,
              x1 + 4, entryY - 6
            );
          }
        }

        // Reset
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }

      // Pending preview
      if (pendingPointsRef.current.length > 0 && mouseRef.current && activeTool) {
        const pts = pendingPointsRef.current;
        ctx.strokeStyle = DEFAULT_COLORS[activeTool] || '#aaa';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        if (activeTool === 'position_long' || activeTool === 'position_short') {
          // Show lines for placed points and preview to mouse
          for (const pt of pts) {
            const y = series.priceToCoordinate(pt.price);
            if (y !== null) {
              ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
          }
          // Info text
          ctx.setLineDash([]);
          ctx.font = '11px JetBrains Mono, monospace';
          ctx.fillStyle = '#aaa';
          const labels = ['Click: Set Entry', 'Click: Set Stop Loss', 'Click: Set Take Profit'];
          ctx.fillText(labels[pts.length] || '', 10, 20);
        } else {
          const x1 = timeScale.timeToCoordinate(pts[0].time as any);
          const y1 = series.priceToCoordinate(pts[0].price);
          if (x1 !== null && y1 !== null) {
            ctx.beginPath();
            if (activeTool === 'rectangle') {
              const rx = Math.min(x1, mouseRef.current.x);
              const ry = Math.min(y1, mouseRef.current.y);
              ctx.strokeRect(rx, ry, Math.abs(mouseRef.current.x - x1), Math.abs(mouseRef.current.y - y1));
            } else {
              ctx.moveTo(x1, y1);
              ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
              ctx.stroke();
            }
          }
        }
        ctx.setLineDash([]);
      }

      // Position hint
      if (activeTool && (activeTool === 'position_long' || activeTool === 'position_short') && pendingPointsRef.current.length === 0) {
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Click: Set Entry Price', 10, 20);
      }
    };

    render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 80);
    return () => { clearInterval(interval); };
  }, [chart, series, drawings, activeTool, containerRef, selectedDrawingId]);

  const handleUpdateDrawing = useCallback((updated: Drawing) => {
    onDrawingsChange(drawings.map(d => d.id === updated.id ? updated : d));
  }, [drawings, onDrawingsChange]);

  const handleDeleteDrawing = useCallback((id: string) => {
    onDrawingsChange(drawings.filter(d => d.id !== id));
    setSelectedDrawingId(null);
  }, [drawings, onDrawingsChange]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      />
      {selectedDrawing && (
        <DrawingPropertiesPanel
          drawing={selectedDrawing}
          onUpdate={handleUpdateDrawing}
          onDelete={handleDeleteDrawing}
          onClose={() => setSelectedDrawingId(null)}
        />
      )}
    </>
  );
}
