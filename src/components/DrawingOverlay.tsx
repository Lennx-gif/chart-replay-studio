import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing, DrawingType, DrawingPoint, LineStyle } from '@/lib/drawings';
import { createDrawingId, DEFAULT_COLORS, DEFAULT_FIB_LEVELS, getClicksNeeded } from '@/lib/drawings';
import { DrawingFloatingToolbar } from './DrawingFloatingToolbar';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  activeTool: DrawingType | null;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  onPlacePendingOrder?: (side: 'buy' | 'sell', price: number, sl?: number, tp?: number) => void;
}

function setLineDash(ctx: CanvasRenderingContext2D, style: LineStyle) {
  switch (style) {
    case 'dashed': ctx.setLineDash([6, 4]); break;
    case 'dotted': ctx.setLineDash([2, 3]); break;
    default: ctx.setLineDash([]); break;
  }
}

const NUBIAN_LONG = '#4caf50';
const NUBIAN_SHORT = '#e05347';
const NUBIAN_GOLD = '#d4a54a';
const NUBIAN_AMBER = '#c47d2e';

// Hit-test distance threshold in pixels
const HIT_THRESHOLD = 8;

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function DrawingOverlay({ chart, series, activeTool, drawings, onDrawingsChange, containerRef, onPlacePendingOrder }: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingPointsRef = useRef<DrawingPoint[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; drawingId: string } | null>(null);
  const [dragState, setDragState] = useState<{
    drawingId: string;
    anchor: 'body' | 'p0' | 'p1' | 'p2';
    startMouse: { x: number; y: number };
    originalPoints: DrawingPoint[];
  } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

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

  const snapPrice = useCallback((price: number) => {
    if (price > 10) return Math.round(price * 100) / 100;
    return Math.round(price * 10000) / 10000;
  }, []);

  // Hit-test: find the drawing under cursor using proper line-distance
  const hitTestDrawing = useCallback((mx: number, my: number): Drawing | null => {
    if (!chart || !series) return null;
    const timeScale = chart.timeScale();
    let best: Drawing | null = null;
    let bestDist = HIT_THRESHOLD;

    for (const d of drawings) {
      if (d.locked) continue;
      let dist = Infinity;

      if (d.type === 'horizontal' && d.points[0]) {
        const y = series.priceToCoordinate(d.points[0].price);
        if (y !== null) dist = Math.abs(my - y);
      } else if (d.type === 'vertical' && d.points[0]) {
        const x = timeScale.timeToCoordinate(d.points[0].time as any);
        if (x !== null) dist = Math.abs(mx - x);
      } else if ((d.type === 'trendline' || d.type === 'fibonacci') && d.points.length === 2) {
        const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y1 = series.priceToCoordinate(d.points[0].price);
        const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y2 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          dist = distToSegment(mx, my, x1, y1, x2, y2);
        }
      } else if (d.type === 'ray' && d.points.length === 2) {
        const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y1 = series.priceToCoordinate(d.points[0].price);
        const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y2 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          dist = distToLine(mx, my, x1, y1, x2, y2);
        }
      } else if (d.type === 'rectangle' && d.points.length === 2) {
        const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y1 = series.priceToCoordinate(d.points[0].price);
        const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y2 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          // Hit on edges
          if (mx >= rx - HIT_THRESHOLD && mx <= rx + rw + HIT_THRESHOLD && my >= ry - HIT_THRESHOLD && my <= ry + rh + HIT_THRESHOLD) {
            const dLeft = Math.abs(mx - rx);
            const dRight = Math.abs(mx - (rx + rw));
            const dTop = Math.abs(my - ry);
            const dBottom = Math.abs(my - (ry + rh));
            dist = Math.min(dLeft, dRight, dTop, dBottom);
            // Also hit inside
            if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) dist = 0;
          }
        }
      } else if ((d.type === 'position_long' || d.type === 'position_short') && d.entryPrice != null) {
        const entryY = series.priceToCoordinate(d.entryPrice);
        const slY = d.stopLoss != null ? series.priceToCoordinate(d.stopLoss) : null;
        const tpY = d.takeProfit != null ? series.priceToCoordinate(d.takeProfit) : null;
        const dists: number[] = [];
        if (entryY !== null) dists.push(Math.abs(my - entryY));
        if (slY !== null) dists.push(Math.abs(my - slY));
        if (tpY !== null) dists.push(Math.abs(my - tpY));
        if (dists.length > 0) dist = Math.min(...dists);
      }

      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }, [chart, series, drawings]);

  // Compute toolbar position for selected drawing
  const computeToolbarPos = useCallback((drawing: Drawing) => {
    if (!chart || !series) return null;
    const timeScale = chart.timeScale();
    if (drawing.type === 'horizontal' && drawing.points[0]) {
      const y = series.priceToCoordinate(drawing.points[0].price);
      return y !== null ? { x: 60, y: y - 40 } : null;
    }
    if (drawing.type === 'vertical' && drawing.points[0]) {
      const x = timeScale.timeToCoordinate(drawing.points[0].time as any);
      return x !== null ? { x: x - 100, y: 10 } : null;
    }
    if (drawing.points.length >= 2) {
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      if (x1 !== null && y1 !== null) return { x: x1, y: y1 - 44 };
    }
    if ((drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.entryPrice != null) {
      const y = series.priceToCoordinate(drawing.entryPrice);
      const x1 = drawing.points[0] ? timeScale.timeToCoordinate(drawing.points[0].time as any) : 100;
      return y !== null && x1 !== null ? { x: x1, y: y - 44 } : null;
    }
    return null;
  }, [chart, series]);

  // Click handler
  const handleClick = useCallback((e: MouseEvent) => {
    setContextMenu(null);

    if (!activeTool) {
      // Selection mode
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTestDrawing(mx, my);
      if (hit) {
        setSelectedDrawingId(hit.id);
      } else {
        setSelectedDrawingId(null);
        setToolbarPos(null);
      }
      return;
    }

    const rawPoint = getBarAndPrice(e);
    if (!rawPoint) return;
    const point = { ...rawPoint, price: snapPrice(rawPoint.price) };
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
  }, [activeTool, drawings, onDrawingsChange, getBarAndPrice, snapPrice, hitTestDrawing, containerRef]);

  // Mouse move - hover detection + drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mouseRef.current = { x: mx, y: my };

    // Drag in progress
    if (dragState && chart && series) {
      const timeCoord = chart.timeScale().coordinateToTime(mx);
      const priceCoord = series.coordinateToPrice(my);
      if (timeCoord === null || priceCoord === null) return;

      const d = drawings.find(dd => dd.id === dragState.drawingId);
      if (!d) return;

      if (dragState.anchor === 'body') {
        // Move all points by delta
        const dp = snapPrice(priceCoord) - snapPrice(dragState.originalPoints[0].price);
        const dt = (timeCoord as number) - dragState.originalPoints[0].time;
        const newPoints = dragState.originalPoints.map(p => ({
          time: p.time + dt,
          price: snapPrice(p.price + dp),
        }));
        const updated = { ...d, points: newPoints };
        if (d.entryPrice != null && d.stopLoss != null && d.takeProfit != null) {
          updated.entryPrice = newPoints[0]?.price;
          updated.stopLoss = newPoints[1]?.price;
          updated.takeProfit = newPoints[2]?.price;
        }
        onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
      }
      return;
    }

    // Hover detection when no tool active
    if (!activeTool) {
      const hit = hitTestDrawing(mx, my);
      setHoveredDrawingId(hit?.id || null);
    }
  }, [containerRef, activeTool, hitTestDrawing, dragState, chart, series, drawings, onDrawingsChange, snapPrice]);

  // Mouse down - start drag
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (activeTool || e.button !== 0) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTestDrawing(mx, my);
    if (hit && !hit.locked && selectedDrawingId === hit.id) {
      e.preventDefault();
      e.stopPropagation();
      setDragState({
        drawingId: hit.id,
        anchor: 'body',
        startMouse: { x: mx, y: my },
        originalPoints: [...hit.points],
      });
    }
  }, [activeTool, hitTestDrawing, selectedDrawingId, containerRef]);

  const handleMouseUp = useCallback(() => {
    if (dragState) setDragState(null);
  }, [dragState]);

  // Right-click context menu
  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (pendingPointsRef.current.length > 0) {
      e.preventDefault();
      pendingPointsRef.current = [];
      return;
    }
    if (!containerRef.current || activeTool) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTestDrawing(mx, my);
    if (hit) {
      e.preventDefault();
      setSelectedDrawingId(hit.id);
      setContextMenu({ x: mx, y: my, drawingId: hit.id });
    }
  }, [activeTool, hitTestDrawing, containerRef]);

  // Keyboard: Delete/Backspace to remove selected drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        e.preventDefault();
        onDrawingsChange(drawings.filter(d => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
        setToolbarPos(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedDrawingId, drawings, onDrawingsChange]);

  useEffect(() => {
    pendingPointsRef.current = [];
  }, [activeTool]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('click', handleClick);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('contextmenu', handleContextMenu);
    return () => {
      el.removeEventListener('click', handleClick);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleClick, handleMouseMove, handleMouseDown, handleMouseUp, handleContextMenu, containerRef]);

  // Update toolbar position when selection/chart changes
  useEffect(() => {
    if (selectedDrawing) {
      const pos = computeToolbarPos(selectedDrawing);
      setToolbarPos(pos);
    } else {
      setToolbarPos(null);
    }
  }, [selectedDrawing, computeToolbarPos]);

  // Render loop
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
        const isHovered = drawing.id === hoveredDrawingId;
        ctx.strokeStyle = drawing.color;
        ctx.fillStyle = drawing.color;
        ctx.lineWidth = drawing.lineWidth;
        setLineDash(ctx, drawing.lineStyle);

        if (isSelected) {
          ctx.lineWidth = drawing.lineWidth + 1;
          ctx.shadowColor = drawing.color;
          ctx.shadowBlur = 10;
        } else if (isHovered) {
          ctx.lineWidth = drawing.lineWidth + 0.5;
          ctx.shadowColor = drawing.color;
          ctx.shadowBlur = 4;
        }

        if (drawing.locked) ctx.globalAlpha = 0.5;

        // --- Draw each type ---
        if (drawing.type === 'horizontal' && drawing.points[0]) {
          const y = series.priceToCoordinate(drawing.points[0].price);
          if (y !== null) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '10px JetBrains Mono, monospace';
            const text = drawing.label || drawing.points[0].price.toFixed(4);
            const tw = ctx.measureText(text).width;
            const lx = width - tw - 16;
            ctx.fillStyle = drawing.color + '25';
            ctx.beginPath(); ctx.roundRect(lx, y - 10, tw + 12, 20, 3); ctx.fill();
            ctx.fillStyle = drawing.color;
            ctx.fillText(text, lx + 6, y + 4);
            if (isSelected) {
              ctx.setLineDash([]);
              ctx.fillStyle = '#fff';
              ctx.beginPath(); ctx.arc(40, y, 4, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = drawing.color; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(40, y, 4, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.arc(width - 40, y, 4, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = drawing.color;
              ctx.beginPath(); ctx.arc(width - 40, y, 4, 0, Math.PI * 2); ctx.stroke();
            }
          }
        } else if (drawing.type === 'vertical' && drawing.points[0]) {
          const x = timeScale.timeToCoordinate(drawing.points[0].time as any);
          if (x !== null) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            if (isSelected) {
              ctx.setLineDash([]);
              ctx.fillStyle = '#fff';
              ctx.beginPath(); ctx.arc(x, 40, 4, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = drawing.color; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(x, 40, 4, 0, Math.PI * 2); ctx.stroke();
            }
          }
        } else if (drawing.type === 'trendline' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
            ctx.setLineDash([]);
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillStyle = drawing.color + '90';
            ctx.fillText(`${angle.toFixed(1)}°`, (x1 + x2) / 2 + 6, (y1 + y2) / 2 - 6);
            // Anchor dots (TradingView style - white fill, colored border)
            drawAnchor(ctx, x1, y1, drawing.color, isSelected);
            drawAnchor(ctx, x2, y2, drawing.color, isSelected);
            if (isSelected) {
              drawAnchor(ctx, (x1 + x2) / 2, (y1 + y2) / 2, drawing.color, true); // midpoint
            }
          }
        } else if (drawing.type === 'ray' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const dx = x2 - x1, dy = y2 - y1;
            const extX = dx > 0 ? width + 100 : -100;
            const t = dx !== 0 ? (extX - x1) / dx : 10;
            const extY = y1 + dy * t;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(extX, extY); ctx.stroke();
            drawAnchor(ctx, x1, y1, drawing.color, isSelected);
            drawAnchor(ctx, x2, y2, drawing.color, isSelected);
          }
        } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
            const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
            ctx.globalAlpha = drawing.locked ? 0.06 : 0.1;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.globalAlpha = drawing.locked ? 0.4 : 0.8;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.globalAlpha = 1;
            if (isSelected) {
              const priceDiff = Math.abs(drawing.points[1].price - drawing.points[0].price);
              ctx.setLineDash([]);
              ctx.font = '9px JetBrains Mono, monospace';
              ctx.fillStyle = drawing.color + '90';
              ctx.fillText(`Δ ${priceDiff.toFixed(4)}`, rx + 4, ry + 12);
              drawAnchor(ctx, x1, y1, drawing.color, true);
              drawAnchor(ctx, x2, y2, drawing.color, true);
              drawAnchor(ctx, x1, y2, drawing.color, true);
              drawAnchor(ctx, x2, y1, drawing.color, true);
            }
          }
        } else if (drawing.type === 'fibonacci' && drawing.points.length === 2) {
          renderFibonacci(ctx, drawing, series, timeScale, width, isSelected);
        } else if ((drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.points.length >= 3) {
          renderPosition(ctx, drawing, series, timeScale, width, isSelected);
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }

      // Pending preview
      renderPendingPreview(ctx, series, timeScale, width, height);
    };

    render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 60);
    return () => { clearInterval(interval); };
  }, [chart, series, drawings, activeTool, containerRef, selectedDrawingId, hoveredDrawingId, snapPrice]);

  // --- Helper render functions ---

  function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, show: boolean) {
    if (!show) return;
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
  }

  function renderFibonacci(ctx: CanvasRenderingContext2D, drawing: Drawing, series: any, timeScale: any, width: number, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
    const y1 = series.priceToCoordinate(drawing.points[0].price);
    const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
    const y2 = series.priceToCoordinate(drawing.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const levels = drawing.fibLevels || DEFAULT_FIB_LEVELS;
    const priceDiff = drawing.points[1].price - drawing.points[0].price;
    ctx.font = '10px JetBrains Mono, monospace';
    const fibColors = ['#d4a54a', '#c47d2e', '#a0855c', '#8b6914', '#d4a54a', '#c47d2e', '#a0855c'];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const price = drawing.points[0].price + priceDiff * level;
      const y = series.priceToCoordinate(price);
      if (y !== null) {
        ctx.strokeStyle = fibColors[i % fibColors.length];
        ctx.globalAlpha = 0.6;
        ctx.setLineDash(level === 0 || level === 1 ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), y);
        ctx.lineTo(Math.max(x1, x2) + 60, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = fibColors[i % fibColors.length];
        ctx.fillText(`${(level * 100).toFixed(1)}% — ${price.toFixed(4)}`, Math.max(x1, x2) + 8, y + 4);
      }
    }
    for (let i = 0; i < levels.length - 1; i++) {
      const p1 = drawing.points[0].price + priceDiff * levels[i];
      const p2 = drawing.points[0].price + priceDiff * levels[i + 1];
      const cy1 = series.priceToCoordinate(p1);
      const cy2 = series.priceToCoordinate(p2);
      if (cy1 !== null && cy2 !== null) {
        ctx.fillStyle = fibColors[i % fibColors.length];
        ctx.globalAlpha = 0.04 + (i * 0.012);
        ctx.fillRect(Math.min(x1, x2), Math.min(cy1, cy2), Math.abs(x2 - x1) + 60, Math.abs(cy2 - cy1));
        ctx.globalAlpha = 1;
      }
    }
    if (isSelected) {
      drawAnchor(ctx, x1, y1, drawing.color, true);
      drawAnchor(ctx, x2, y2, drawing.color, true);
    }
  }

  function renderPosition(ctx: CanvasRenderingContext2D, drawing: Drawing, series: any, timeScale: any, width: number, isSelected: boolean) {
    const entryPrice = drawing.entryPrice!;
    const slPrice = drawing.stopLoss!;
    const tpPrice = drawing.takeProfit!;
    const isLong = drawing.type === 'position_long';
    const entryY = series.priceToCoordinate(entryPrice);
    const slY = series.priceToCoordinate(slPrice);
    const tpY = series.priceToCoordinate(tpPrice);
    const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
    if (entryY === null || slY === null || tpY === null || x1 === null) return;

    const boxWidth = 280;

    // TP zone
    const tpGrad = ctx.createLinearGradient(x1, Math.min(entryY, tpY), x1, Math.max(entryY, tpY));
    tpGrad.addColorStop(0, NUBIAN_LONG + '18');
    tpGrad.addColorStop(1, NUBIAN_LONG + '05');
    ctx.fillStyle = tpGrad;
    ctx.fillRect(x1, Math.min(entryY, tpY), boxWidth, Math.abs(tpY - entryY));
    ctx.strokeStyle = NUBIAN_LONG;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(x1, tpY); ctx.lineTo(x1 + boxWidth, tpY); ctx.stroke();

    // SL zone
    const slGrad = ctx.createLinearGradient(x1, Math.min(entryY, slY), x1, Math.max(entryY, slY));
    slGrad.addColorStop(0, NUBIAN_SHORT + '05');
    slGrad.addColorStop(1, NUBIAN_SHORT + '18');
    ctx.fillStyle = slGrad;
    ctx.fillRect(x1, Math.min(entryY, slY), boxWidth, Math.abs(slY - entryY));
    ctx.strokeStyle = NUBIAN_SHORT;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(x1, slY); ctx.lineTo(x1 + boxWidth, slY); ctx.stroke();
    ctx.setLineDash([]);

    // Entry line
    ctx.strokeStyle = NUBIAN_GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, entryY); ctx.lineTo(x1 + boxWidth, entryY); ctx.stroke();

    // Direction indicator
    ctx.fillStyle = isLong ? NUBIAN_LONG : NUBIAN_SHORT;
    const arrowX = x1 + boxWidth - 20;
    ctx.beginPath();
    if (isLong) {
      ctx.moveTo(arrowX, entryY - 15);
      ctx.lineTo(arrowX - 6, entryY - 5);
      ctx.lineTo(arrowX + 6, entryY - 5);
    } else {
      ctx.moveTo(arrowX, entryY + 15);
      ctx.lineTo(arrowX - 6, entryY + 5);
      ctx.lineTo(arrowX + 6, entryY + 5);
    }
    ctx.fill();

    // Labels
    ctx.font = '10px JetBrains Mono, monospace';

    // TP label
    const tpText = `TP: ${tpPrice.toFixed(4)}  +${Math.abs(tpPrice - entryPrice).toFixed(4)}`;
    const tpTw = ctx.measureText(tpText).width;
    ctx.fillStyle = NUBIAN_LONG + '20';
    ctx.beginPath(); ctx.roundRect(x1 + 4, tpY + (tpY < entryY ? -18 : 4), tpTw + 10, 16, 3); ctx.fill();
    ctx.fillStyle = NUBIAN_LONG;
    ctx.fillText(tpText, x1 + 9, tpY + (tpY < entryY ? -6 : 16));

    // SL label
    const slText = `SL: ${slPrice.toFixed(4)}  -${Math.abs(entryPrice - slPrice).toFixed(4)}`;
    const slTw = ctx.measureText(slText).width;
    ctx.fillStyle = NUBIAN_SHORT + '20';
    ctx.beginPath(); ctx.roundRect(x1 + 4, slY + (slY > entryY ? 4 : -18), slTw + 10, 16, 3); ctx.fill();
    ctx.fillStyle = NUBIAN_SHORT;
    ctx.fillText(slText, x1 + 9, slY + (slY > entryY ? 16 : -6));

    // Entry label with R:R
    const rr = drawing.riskRewardRatio || 0;
    const entryText = `${isLong ? '▲ LONG' : '▼ SHORT'} @ ${entryPrice.toFixed(4)}  R:R 1:${rr.toFixed(1)}`;
    const entryTw = ctx.measureText(entryText).width;
    ctx.fillStyle = NUBIAN_GOLD + '20';
    ctx.beginPath(); ctx.roundRect(x1 + 4, entryY - 20, entryTw + 10, 16, 3); ctx.fill();
    ctx.fillStyle = NUBIAN_GOLD;
    ctx.fillText(entryText, x1 + 9, entryY - 8);

    // Pips on the right
    const risk = Math.abs(entryPrice - slPrice);
    const reward = Math.abs(tpPrice - entryPrice);
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = NUBIAN_LONG + '80';
    ctx.fillText(`+${(reward * 10000).toFixed(0)} pips`, x1 + boxWidth + 4, (entryY + tpY) / 2 + 3);
    ctx.fillStyle = NUBIAN_SHORT + '80';
    ctx.fillText(`-${(risk * 10000).toFixed(0)} pips`, x1 + boxWidth + 4, (entryY + slY) / 2 + 3);

    // Anchor dots when selected
    if (isSelected) {
      drawAnchor(ctx, x1, entryY, NUBIAN_GOLD, true);
      drawAnchor(ctx, x1, slY, NUBIAN_SHORT, true);
      drawAnchor(ctx, x1, tpY, NUBIAN_LONG, true);
    }
  }

  function renderPendingPreview(ctx: CanvasRenderingContext2D, series: any, timeScale: any, width: number, height: number) {
    if (!activeTool || !mouseRef.current) return;

    if (pendingPointsRef.current.length > 0) {
      const pts = pendingPointsRef.current;
      ctx.strokeStyle = DEFAULT_COLORS[activeTool] || '#aaa';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      if (activeTool === 'position_long' || activeTool === 'position_short') {
        for (const pt of pts) {
          const y = series.priceToCoordinate(pt.price);
          if (y !== null) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = NUBIAN_GOLD;
            ctx.fillText(pt.price.toFixed(4), 10, y - 4);
            ctx.setLineDash([3, 3]);
          }
        }
        if (mouseRef.current) {
          const mousePrice = series.coordinateToPrice(mouseRef.current.y);
          if (mousePrice !== null) {
            ctx.strokeStyle = NUBIAN_AMBER + '60';
            ctx.beginPath(); ctx.moveTo(0, mouseRef.current.y); ctx.lineTo(width, mouseRef.current.y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = NUBIAN_AMBER;
            ctx.fillText(snapPrice(mousePrice).toFixed(4), 10, mouseRef.current.y - 4);
          }
        }
        // Step indicator
        ctx.setLineDash([]);
        ctx.font = '12px Outfit, sans-serif';
        const labels = ['① Click to set Entry', '② Click to set Stop Loss', '③ Click to set Take Profit'];
        const bgText = labels[pts.length] || '';
        const tw = ctx.measureText(bgText).width;
        ctx.fillStyle = '#1a1510e0';
        ctx.beginPath(); ctx.roundRect(8, 6, tw + 16, 24, 6); ctx.fill();
        ctx.fillStyle = NUBIAN_GOLD;
        ctx.fillText(bgText, 16, 22);
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

    // Step hint for position tools (no points yet)
    if ((activeTool === 'position_long' || activeTool === 'position_short') && pendingPointsRef.current.length === 0) {
      ctx.font = '12px Outfit, sans-serif';
      const bgText = '① Click to set Entry Price';
      const tw = ctx.measureText(bgText).width;
      ctx.fillStyle = '#1a1510e0';
      ctx.beginPath(); ctx.roundRect(8, 6, tw + 16, 24, 6); ctx.fill();
      ctx.fillStyle = NUBIAN_GOLD;
      ctx.fillText(bgText, 16, 22);
    }

    // Crosshair snap for other tools
    if (activeTool && !(activeTool === 'position_long' || activeTool === 'position_short') && pendingPointsRef.current.length === 0 && mouseRef.current) {
      const mousePrice = series.coordinateToPrice(mouseRef.current.y);
      if (mousePrice !== null) {
        ctx.strokeStyle = NUBIAN_AMBER + '40';
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, mouseRef.current.y); ctx.lineTo(width, mouseRef.current.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = NUBIAN_AMBER;
        ctx.fillText(snapPrice(mousePrice).toFixed(4), mouseRef.current.x + 10, mouseRef.current.y - 6);
      }
    }
  }

  const handleUpdateDrawing = useCallback((updated: Drawing) => {
    onDrawingsChange(drawings.map(d => d.id === updated.id ? updated : d));
  }, [drawings, onDrawingsChange]);

  const handleDeleteDrawing = useCallback((id: string) => {
    onDrawingsChange(drawings.filter(d => d.id !== id));
    setSelectedDrawingId(null);
    setToolbarPos(null);
    setContextMenu(null);
  }, [drawings, onDrawingsChange]);

  const handleDuplicateDrawing = useCallback((id: string) => {
    const d = drawings.find(dd => dd.id === id);
    if (!d) return;
    const clone: Drawing = {
      ...d,
      id: createDrawingId(),
      points: d.points.map(p => ({ ...p, price: p.price + (d.type === 'vertical' ? 0 : 0.0005) })),
    };
    if (clone.entryPrice) clone.entryPrice = clone.entryPrice + 0.0005;
    if (clone.stopLoss) clone.stopLoss = clone.stopLoss + 0.0005;
    if (clone.takeProfit) clone.takeProfit = clone.takeProfit + 0.0005;
    onDrawingsChange([...drawings, clone]);
    setSelectedDrawingId(clone.id);
    setContextMenu(null);
  }, [drawings, onDrawingsChange]);

  const handlePlaceOrderFromDrawing = useCallback((id: string) => {
    const d = drawings.find(dd => dd.id === id);
    if (!d || !onPlacePendingOrder) return;
    if (d.type === 'position_long' && d.entryPrice != null) {
      onPlacePendingOrder('buy', d.entryPrice, d.stopLoss, d.takeProfit);
    } else if (d.type === 'position_short' && d.entryPrice != null) {
      onPlacePendingOrder('sell', d.entryPrice, d.stopLoss, d.takeProfit);
    }
    setContextMenu(null);
  }, [drawings, onPlacePendingOrder]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10, cursor: dragState ? 'grabbing' : (hoveredDrawingId && !activeTool ? 'pointer' : undefined) }}
      />

      {/* Floating toolbar on selected drawing */}
      {selectedDrawing && toolbarPos && (
        <DrawingFloatingToolbar
          drawing={selectedDrawing}
          position={toolbarPos}
          onUpdate={handleUpdateDrawing}
          onDelete={handleDeleteDrawing}
          onDuplicate={handleDuplicateDrawing}
          onPlaceOrder={(selectedDrawing.type === 'position_long' || selectedDrawing.type === 'position_short') ? () => handlePlaceOrderFromDrawing(selectedDrawing.id) : undefined}
          onClose={() => setSelectedDrawingId(null)}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-card border border-border rounded-md shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {(() => {
            const d = drawings.find(dd => dd.id === contextMenu.drawingId);
            if (!d) return null;
            const isPosition = d.type === 'position_long' || d.type === 'position_short';
            return (
              <>
                {isPosition && onPlacePendingOrder && (
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/10 text-primary flex items-center gap-2"
                    onClick={() => handlePlaceOrderFromDrawing(d.id)}
                  >
                    📋 Place as Pending Order
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary text-foreground"
                  onClick={() => { handleUpdateDrawing({ ...d, locked: !d.locked }); setContextMenu(null); }}
                >
                  {d.locked ? '🔓 Unlock' : '🔒 Lock'}
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary text-foreground"
                  onClick={() => handleDuplicateDrawing(d.id)}
                >
                  📄 Duplicate
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-destructive/10 text-destructive"
                  onClick={() => handleDeleteDrawing(d.id)}
                >
                  🗑️ Delete
                </button>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
