import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Drawing, DrawingType, DrawingPoint, LineStyle } from '@/lib/drawings';
import { createDrawingId, DEFAULT_COLORS, DEFAULT_FIB_LEVELS, DEFAULT_FIB_EXT_LEVELS, getClicksNeeded } from '@/lib/drawings';
import { DrawingFloatingToolbar } from './DrawingFloatingToolbar';

import type { OHLCVBar } from '@/lib/csvParser';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  activeTool: DrawingType | null;
  drawings: Drawing[];
  onDrawingsChange: (drawings: Drawing[]) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  onPlacePendingOrder?: (side: 'buy' | 'sell', price: number, sl?: number, tp?: number) => void;
  magnetMode?: boolean;
  lockAllDrawings?: boolean;
  hideAllDrawings?: boolean;
  visibleBars?: OHLCVBar[];
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

export type DragAnchor = 'body' | 'p0' | 'p1' | 'p2' | 'sl' | 'tp' | 'entry';

export function DrawingOverlay({
  chart,
  series,
  activeTool,
  drawings,
  onDrawingsChange,
  containerRef,
  onPlacePendingOrder,
  magnetMode = false,
  lockAllDrawings = false,
  hideAllDrawings = false,
  visibleBars = [],
}: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingPointsRef = useRef<DrawingPoint[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; drawingId: string } | null>(null);
  const [dragState, setDragState] = useState<{
    drawingId: string;
    anchor: DragAnchor;
    startMouse: { x: number; y: number };
    startCoord: { time: number; price: number };
    originalPoints: DrawingPoint[];
    originalDrawing: Drawing;
  } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const isBrushing = useRef(false);
  const brushPointsRef = useRef<{ x: number; y: number }[]>([]);

  const selectedDrawing = drawings.find(d => d.id === selectedDrawingId) || null;

  const getBarAndPrice = useCallback((e: MouseEvent): DrawingPoint | null => {
    if (!chart || !series || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const timeCoord = chart.timeScale().coordinateToTime(x);
    const priceCoord = series.coordinateToPrice(y);
    if (timeCoord === null || priceCoord === null) return null;

    if (magnetMode && visibleBars && visibleBars.length > 0) {
      const targetTime = timeCoord as number;
      let closestBar = visibleBars[0];
      let minTimeDiff = Math.abs(visibleBars[0].time - targetTime);
      for (let i = 1; i < visibleBars.length; i++) {
        const diff = Math.abs(visibleBars[i].time - targetTime);
        if (diff < minTimeDiff) {
          minTimeDiff = diff;
          closestBar = visibleBars[i];
        }
      }

      const ohlc = [closestBar.open, closestBar.high, closestBar.low, closestBar.close];
      let bestPrice = ohlc[0];
      let minPriceDiff = Math.abs(ohlc[0] - priceCoord);
      for (let j = 1; j < ohlc.length; j++) {
        const pDiff = Math.abs(ohlc[j] - priceCoord);
        if (pDiff < minPriceDiff) {
          minPriceDiff = pDiff;
          bestPrice = ohlc[j];
        }
      }

      return { time: closestBar.time, price: bestPrice };
    }

    return { time: timeCoord as number, price: priceCoord };
  }, [chart, series, containerRef, magnetMode, visibleBars]);

  const snapPrice = useCallback((price: number) => {
    if (price > 10) return Math.round(price * 100) / 100;
    return Math.round(price * 10000) / 10000;
  }, []);

  const hitTestDrawing = useCallback((mx: number, my: number): Drawing | null => {
    if (!chart || !series || lockAllDrawings || hideAllDrawings) return null;
    const timeScale = chart.timeScale();
    let best: Drawing | null = null;
    let bestDist = HIT_THRESHOLD;

    for (const d of drawings) {
      if (d.locked || d.visible === false) continue;
      let dist = Infinity;

      if (d.type === 'horizontal' && d.points[0]) {
        const y = series.priceToCoordinate(d.points[0].price);
        if (y !== null) dist = Math.abs(my - y);
      } else if (d.type === 'vertical' && d.points[0]) {
        const x = timeScale.timeToCoordinate(d.points[0].time as any);
        if (x !== null) dist = Math.abs(mx - x);
      } else if (d.type === 'text' && d.points[0]) {
        const x = timeScale.timeToCoordinate(d.points[0].time as any);
        const y = series.priceToCoordinate(d.points[0].price);
        if (x !== null && y !== null) dist = Math.hypot(mx - x, my - y);
      } else if (['trendline', 'fibonacci', 'fib_extension', 'info_line', 'measure', 'price_range'].includes(d.type) && d.points.length === 2) {
        const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y1 = series.priceToCoordinate(d.points[0].price);
        const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y2 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          dist = distToSegment(mx, my, x1, y1, x2, y2);
        }
      } else if ((d.type === 'ray' || d.type === 'extended_line') && d.points.length === 2) {
        const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y1 = series.priceToCoordinate(d.points[0].price);
        const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y2 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          dist = distToLine(mx, my, x1, y1, x2, y2);
        }
      } else if ((d.type === 'rectangle' || d.type === 'ellipse') && d.points.length === 2) {
        const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y1 = series.priceToCoordinate(d.points[0].price);
        const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y2 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          if (mx >= rx - HIT_THRESHOLD && mx <= rx + rw + HIT_THRESHOLD && my >= ry - HIT_THRESHOLD && my <= ry + rh + HIT_THRESHOLD) {
            const dLeft = Math.abs(mx - rx);
            const dRight = Math.abs(mx - (rx + rw));
            const dTop = Math.abs(my - ry);
            const dBottom = Math.abs(my - (ry + rh));
            dist = Math.min(dLeft, dRight, dTop, dBottom);
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
      } else if (d.type === 'triangle' && d.points.length === 3) {
        // Hit test on edges of triangle
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3;
          const xi = timeScale.timeToCoordinate(d.points[i].time as any);
          const yi = series.priceToCoordinate(d.points[i].price);
          const xj = timeScale.timeToCoordinate(d.points[j].time as any);
          const yj = series.priceToCoordinate(d.points[j].price);
          if (xi !== null && yi !== null && xj !== null && yj !== null) {
            dist = Math.min(dist, distToSegment(mx, my, xi, yi, xj, yj));
          }
        }
      } else if (d.type === 'pitchfork' && d.points.length === 3) {
        const x0 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y0 = series.priceToCoordinate(d.points[0].price);
        if (x0 !== null && y0 !== null) {
          dist = Math.hypot(mx - x0, my - y0);
        }
      }

      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }, [chart, series, drawings]);

  const findAnchorHit = useCallback((mx: number, my: number, d: Drawing): DragAnchor | null => {
    if (!chart || !series || d.locked || d.visible === false) return null;
    const timeScale = chart.timeScale();

    // Position-specific anchors (Entry, SL, TP)
    if ((d.type === 'position_long' || d.type === 'position_short') && d.entryPrice != null) {
      const entryY = series.priceToCoordinate(d.entryPrice);
      const slY = d.stopLoss != null ? series.priceToCoordinate(d.stopLoss) : null;
      const tpY = d.takeProfit != null ? series.priceToCoordinate(d.takeProfit) : null;
      const x1 = d.points[0] ? timeScale.timeToCoordinate(d.points[0].time as any) : null;
      const boxWidth = 280;

      if (x1 !== null && mx >= x1 - 20 && mx <= x1 + boxWidth + 20) {
        if (slY !== null && Math.abs(my - slY) <= 12) return 'sl';
        if (tpY !== null && Math.abs(my - tpY) <= 12) return 'tp';
        if (entryY !== null && Math.abs(my - entryY) <= 12) return 'entry';
      }
    }

    // Anchor points p0, p1, p2
    if (d.points && d.points.length > 0) {
      if (d.points[0]) {
        const x0 = timeScale.timeToCoordinate(d.points[0].time as any);
        const y0 = series.priceToCoordinate(d.points[0].price);
        if (x0 !== null && y0 !== null && Math.hypot(mx - x0, my - y0) <= 14) return 'p0';
      }
      if (d.points[1]) {
        const x1 = timeScale.timeToCoordinate(d.points[1].time as any);
        const y1 = series.priceToCoordinate(d.points[1].price);
        if (x1 !== null && y1 !== null && Math.hypot(mx - x1, my - y1) <= 14) return 'p1';
      }
      if (d.points[2]) {
        const x2 = timeScale.timeToCoordinate(d.points[2].time as any);
        const y2 = series.priceToCoordinate(d.points[2].price);
        if (x2 !== null && y2 !== null && Math.hypot(mx - x2, my - y2) <= 14) return 'p2';
      }
    }

    return null;
  }, [chart, series]);

  const computeToolbarPos = useCallback((drawing: Drawing) => {
    if (!chart || !series) return null;
    const timeScale = chart.timeScale();
    if (drawing.type === 'horizontal' && drawing.points[0]) {
      const y = series.priceToCoordinate(drawing.points[0].price);
      return y !== null ? { x: 80, y: y - 44 } : null;
    }
    if (drawing.type === 'vertical' && drawing.points[0]) {
      const x = timeScale.timeToCoordinate(drawing.points[0].time as any);
      return x !== null ? { x: x - 100, y: 10 } : null;
    }
    if (drawing.points.length >= 2) {
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      if (x1 !== null && y1 !== null) return { x: Math.max(60, x1), y: y1 - 48 };
    }
    if (drawing.points.length === 1) {
      const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
      const y1 = series.priceToCoordinate(drawing.points[0].price);
      if (x1 !== null && y1 !== null) return { x: Math.max(60, x1), y: y1 - 48 };
    }
    if ((drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.entryPrice != null) {
      const y = series.priceToCoordinate(drawing.entryPrice);
      const x1 = drawing.points[0] ? timeScale.timeToCoordinate(drawing.points[0].time as any) : 100;
      return y !== null && x1 !== null ? { x: Math.max(60, x1), y: y - 48 } : null;
    }
    return null;
  }, [chart, series]);

  // Click handler
  const handleClick = useCallback((e: MouseEvent) => {
    setContextMenu(null);

    if (!activeTool) {
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

    if (activeTool === 'brush') return; // handled by mousedown/up

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
        lineWidth: activeTool === 'horizontal' ? 1 : 2,
        lineStyle: activeTool === 'horizontal' ? 'dashed' : 'solid',
        text: activeTool === 'text' ? 'Note' : undefined,
        showLabel: true,
      };
      onDrawingsChange([...drawings, drawing]);
      if (activeTool === 'text') {
        setSelectedDrawingId(drawing.id);
      }
      pendingPointsRef.current = [];
    } else if (needed === 3) {
      const pts = [...pendingPointsRef.current, point];
      if (pts.length < 3) {
        pendingPointsRef.current = pts;
      } else {
        if (activeTool === 'position_long' || activeTool === 'position_short') {
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
            showLabel: true,
          };
          onDrawingsChange([...drawings, drawing]);
        } else if (activeTool === 'triangle') {
          const drawing: Drawing = {
            id: createDrawingId(),
            type: activeTool,
            points: pts,
            color: DEFAULT_COLORS[activeTool],
            lineWidth: 2,
            lineStyle: 'solid',
            fillOpacity: 0.1,
            showLabel: true,
          };
          onDrawingsChange([...drawings, drawing]);
        } else if (activeTool === 'pitchfork') {
          const drawing: Drawing = {
            id: createDrawingId(),
            type: activeTool,
            points: pts,
            color: DEFAULT_COLORS[activeTool],
            lineWidth: 2,
            lineStyle: 'solid',
            showLabel: true,
          };
          onDrawingsChange([...drawings, drawing]);
        } else if (activeTool === 'fib_extension') {
          const drawing: Drawing = {
            id: createDrawingId(),
            type: activeTool,
            points: pts,
            color: DEFAULT_COLORS[activeTool],
            lineWidth: 1,
            lineStyle: 'solid',
            fibLevels: DEFAULT_FIB_EXT_LEVELS,
            showLabel: true,
          };
          onDrawingsChange([...drawings, drawing]);
        }
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
          fillOpacity: activeTool === 'ellipse' ? 0.1 : undefined,
          showLabel: true,
        };
        onDrawingsChange([...drawings, drawing]);
        pendingPointsRef.current = [];
      }
    }
  }, [activeTool, drawings, onDrawingsChange, getBarAndPrice, snapPrice, hitTestDrawing, containerRef]);

  // Mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current || !chart || !series) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mouseRef.current = { x: mx, y: my };

    // Brush drawing
    if (isBrushing.current && activeTool === 'brush') {
      brushPointsRef.current.push({ x: mx, y: my });
      return;
    }

    // Drag in progress
    if (dragState) {
      const timeCoord = chart.timeScale().coordinateToTime(mx);
      const priceCoord = series.coordinateToPrice(my);
      if (timeCoord === null || priceCoord === null) return;

      const d = drawings.find(dd => dd.id === dragState.drawingId);
      if (!d) return;

      const snapP = snapPrice(priceCoord);
      const timeSec = timeCoord as number;

      if (dragState.anchor === 'body') {
        if (d.type === 'horizontal' && d.points[0]) {
          const updated: Drawing = {
            ...d,
            points: [{ ...d.points[0], price: snapP }],
          };
          onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
        } else if (d.type === 'vertical' && d.points[0]) {
          const updated: Drawing = {
            ...d,
            points: [{ ...d.points[0], time: timeSec }],
          };
          onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
        } else if (d.type === 'position_long' || d.type === 'position_short') {
          const dt = timeSec - dragState.startCoord.time;
          const dp = snapP - dragState.startCoord.price;
          const newEntry = snapPrice((dragState.originalDrawing.entryPrice ?? d.points[0]?.price) + dp);
          const newSL = dragState.originalDrawing.stopLoss != null ? snapPrice(dragState.originalDrawing.stopLoss + dp) : undefined;
          const newTP = dragState.originalDrawing.takeProfit != null ? snapPrice(dragState.originalDrawing.takeProfit + dp) : undefined;
          const newPoints = dragState.originalPoints.map(p => ({
            time: p.time + dt,
            price: snapPrice(p.price + dp),
          }));
          const updated: Drawing = {
            ...d,
            entryPrice: newEntry,
            stopLoss: newSL,
            takeProfit: newTP,
            points: newPoints,
          };
          onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
        } else {
          const dt = timeSec - dragState.startCoord.time;
          const dp = snapP - dragState.startCoord.price;
          const newPoints = dragState.originalPoints.map(p => ({
            time: p.time + dt,
            price: snapPrice(p.price + dp),
          }));
          const updated: Drawing = { ...d, points: newPoints };
          onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
        }
      } else if (dragState.anchor === 'p0') {
        const newPoints = [...d.points];
        newPoints[0] = { time: timeSec, price: snapP };
        const updated: Drawing = { ...d, points: newPoints };
        if (d.type === 'position_long' || d.type === 'position_short') {
          updated.entryPrice = snapP;
          if (updated.stopLoss != null && updated.takeProfit != null) {
            const risk = Math.abs(snapP - updated.stopLoss);
            const reward = Math.abs(updated.takeProfit - snapP);
            updated.riskRewardRatio = risk > 0 ? reward / risk : 0;
          }
        }
        onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
      } else if (dragState.anchor === 'p1') {
        const newPoints = [...d.points];
        if (newPoints.length > 1) {
          newPoints[1] = { time: timeSec, price: snapP };
          const updated: Drawing = { ...d, points: newPoints };
          onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
        }
      } else if (dragState.anchor === 'p2') {
        const newPoints = [...d.points];
        if (newPoints.length > 2) {
          newPoints[2] = { time: timeSec, price: snapP };
          const updated: Drawing = { ...d, points: newPoints };
          onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
        }
      } else if (dragState.anchor === 'sl') {
        const entry = d.entryPrice ?? d.points[0]?.price ?? snapP;
        const tp = d.takeProfit ?? (d.points[2]?.price ?? entry);
        const risk = Math.abs(entry - snapP);
        const reward = Math.abs(tp - entry);
        const rr = risk > 0 ? reward / risk : 0;
        const newPoints = [...d.points];
        if (newPoints[1]) newPoints[1] = { ...newPoints[1], price: snapP };
        const updated: Drawing = {
          ...d,
          stopLoss: snapP,
          riskRewardRatio: rr,
          points: newPoints,
        };
        onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
      } else if (dragState.anchor === 'tp') {
        const entry = d.entryPrice ?? d.points[0]?.price ?? snapP;
        const sl = d.stopLoss ?? (d.points[1]?.price ?? entry);
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(snapP - entry);
        const rr = risk > 0 ? reward / risk : 0;
        const newPoints = [...d.points];
        if (newPoints[2]) newPoints[2] = { ...newPoints[2], price: snapP };
        const updated: Drawing = {
          ...d,
          takeProfit: snapP,
          riskRewardRatio: rr,
          points: newPoints,
        };
        onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
      } else if (dragState.anchor === 'entry') {
        const oldEntry = d.entryPrice ?? snapP;
        const diff = snapP - oldEntry;
        const newSL = d.stopLoss != null ? snapPrice(d.stopLoss + diff) : undefined;
        const newTP = d.takeProfit != null ? snapPrice(d.takeProfit + diff) : undefined;
        const newPoints = [...d.points];
        if (newPoints[0]) newPoints[0] = { ...newPoints[0], price: snapP };
        if (newPoints[1] && newSL != null) newPoints[1] = { ...newPoints[1], price: newSL };
        if (newPoints[2] && newTP != null) newPoints[2] = { ...newPoints[2], price: newTP };
        const updated: Drawing = {
          ...d,
          entryPrice: snapP,
          stopLoss: newSL,
          takeProfit: newTP,
          points: newPoints,
        };
        onDrawingsChange(drawings.map(dd => dd.id === d.id ? updated : dd));
      }
      return;
    }

    if (!activeTool && canvasRef.current) {
      if (selectedDrawing) {
        const anchor = findAnchorHit(mx, my, selectedDrawing);
        if (anchor === 'p0' || anchor === 'p1' || anchor === 'p2') {
          canvasRef.current.style.cursor = 'crosshair';
        } else if (anchor === 'sl' || anchor === 'tp' || anchor === 'entry') {
          canvasRef.current.style.cursor = 'ns-resize';
        } else if (anchor === 'body') {
          canvasRef.current.style.cursor = 'grab';
        } else {
          const hit = hitTestDrawing(mx, my);
          canvasRef.current.style.cursor = hit ? 'grab' : 'default';
          setHoveredDrawingId(hit?.id || null);
        }
      } else {
        const hit = hitTestDrawing(mx, my);
        canvasRef.current.style.cursor = hit ? 'grab' : 'default';
        setHoveredDrawingId(hit?.id || null);
      }
    }
  }, [containerRef, chart, series, activeTool, dragState, drawings, snapPrice, onDrawingsChange, selectedDrawing, findAnchorHit, hitTestDrawing]);

  // Mouse down - start drag or brush
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (activeTool === 'brush' && e.button === 0 && containerRef.current) {
      isBrushing.current = true;
      const rect = containerRef.current.getBoundingClientRect();
      brushPointsRef.current = [{ x: e.clientX - rect.left, y: e.clientY - rect.top }];
      e.preventDefault();
      return;
    }

    if (activeTool || e.button !== 0 || !containerRef.current || !chart || !series) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const timeCoord = chart.timeScale().coordinateToTime(mx);
    const priceCoord = series.coordinateToPrice(my);
    if (timeCoord === null || priceCoord === null) return;

    // Check currently selected drawing first
    if (selectedDrawing && !selectedDrawing.locked && selectedDrawing.visible !== false) {
      const anchor = findAnchorHit(mx, my, selectedDrawing);
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
        setDragState({
          drawingId: selectedDrawing.id,
          anchor,
          startMouse: { x: mx, y: my },
          startCoord: { time: timeCoord as number, price: snapPrice(priceCoord) },
          originalPoints: selectedDrawing.points.map(p => ({ ...p })),
          originalDrawing: { ...selectedDrawing },
        });
        return;
      }
    }

    // Check hit against any drawing
    const hit = hitTestDrawing(mx, my);
    if (hit && !hit.locked && hit.visible !== false) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedDrawingId(hit.id);

      const anchor = findAnchorHit(mx, my, hit) || 'body';
      setDragState({
        drawingId: hit.id,
        anchor,
        startMouse: { x: mx, y: my },
        startCoord: { time: timeCoord as number, price: snapPrice(priceCoord) },
        originalPoints: hit.points.map(p => ({ ...p })),
        originalDrawing: { ...hit },
      });
    }
  }, [activeTool, containerRef, chart, series, selectedDrawing, findAnchorHit, hitTestDrawing, snapPrice]);

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      setDragState(null);
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }

    // Finish brush stroke
    if (isBrushing.current && activeTool === 'brush' && brushPointsRef.current.length > 2) {
      const drawing: Drawing = {
        id: createDrawingId(),
        type: 'brush',
        points: [], // brush uses brushPoints instead
        color: DEFAULT_COLORS.brush,
        lineWidth: 2,
        lineStyle: 'solid',
        brushPoints: [...brushPointsRef.current],
      };
      onDrawingsChange([...drawings, drawing]);
    }
    isBrushing.current = false;
    brushPointsRef.current = [];
  }, [dragState, activeTool, drawings, onDrawingsChange]);

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

  // Keyboard: Delete/Backspace
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        e.preventDefault();
        onDrawingsChange(drawings.filter(d => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
        setToolbarPos(null);
      }
      // Ctrl+Z undo last drawing
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && drawings.length > 0) {
        e.preventDefault();
        onDrawingsChange(drawings.slice(0, -1));
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

  // Update toolbar position
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
      if (hideAllDrawings) return;
      const timeScale = chart.timeScale();

      for (const drawing of drawings) {
        if (drawing.visible === false) continue;
        const isSelected = drawing.id === selectedDrawingId;
        const isHovered = drawing.id === hoveredDrawingId;
        const alpha = drawing.opacity ?? 1;

        ctx.strokeStyle = drawing.color;
        ctx.fillStyle = drawing.color;
        ctx.lineWidth = drawing.lineWidth;
        ctx.globalAlpha = alpha;
        setLineDash(ctx, drawing.lineStyle);

        ctx.lineWidth = Math.max(1, drawing.lineWidth);
        if (isSelected) {
          ctx.shadowColor = drawing.color;
          ctx.shadowBlur = 4;
        } else if (isHovered) {
          ctx.shadowColor = drawing.color;
          ctx.shadowBlur = 2;
        }

        if (drawing.locked) ctx.globalAlpha = alpha * 0.5;

        // --- Draw each type ---
        if (drawing.type === 'horizontal' && drawing.points[0]) {
          renderHorizontal(ctx, drawing, series, width, isSelected);
        } else if (drawing.type === 'vertical' && drawing.points[0]) {
          renderVertical(ctx, drawing, timeScale, height, isSelected);
        } else if (drawing.type === 'trendline' && drawing.points.length === 2) {
          renderTrendline(ctx, drawing, series, timeScale, isSelected, width);
        } else if (drawing.type === 'ray' && drawing.points.length === 2) {
          renderRay(ctx, drawing, series, timeScale, isSelected, width);
        } else if (drawing.type === 'extended_line' && drawing.points.length === 2) {
          renderExtendedLine(ctx, drawing, series, timeScale, isSelected, width);
        } else if (drawing.type === 'info_line' && drawing.points.length === 2) {
          renderInfoLine(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
          renderRectangle(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'ellipse' && drawing.points.length === 2) {
          renderEllipse(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'triangle' && drawing.points.length === 3) {
          renderTriangle(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'fibonacci' && drawing.points.length === 2) {
          renderFibonacci(ctx, drawing, series, timeScale, width, isSelected);
        } else if (drawing.type === 'fib_extension' && drawing.points.length === 3) {
          renderFibExtension(ctx, drawing, series, timeScale, width, isSelected);
        } else if (drawing.type === 'pitchfork' && drawing.points.length === 3) {
          renderPitchfork(ctx, drawing, series, timeScale, isSelected, width);
        } else if ((drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.points.length >= 3) {
          renderPosition(ctx, drawing, series, timeScale, width, isSelected);
        } else if (drawing.type === 'measure' && drawing.points.length === 2) {
          renderMeasure(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'price_range' && drawing.points.length === 2) {
          renderPriceRange(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'text' && drawing.points[0]) {
          renderText(ctx, drawing, series, timeScale, isSelected);
        } else if (drawing.type === 'brush' && drawing.brushPoints && drawing.brushPoints.length > 1) {
          renderBrush(ctx, drawing);
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }

      // Brush in progress
      if (isBrushing.current && brushPointsRef.current.length > 1) {
        ctx.strokeStyle = DEFAULT_COLORS.brush;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(brushPointsRef.current[0].x, brushPointsRef.current[0].y);
        for (let i = 1; i < brushPointsRef.current.length; i++) {
          ctx.lineTo(brushPointsRef.current[i].x, brushPointsRef.current[i].y);
        }
        ctx.stroke();
      }

      // Pending preview
      renderPendingPreview(ctx, series, timeScale, width, height);
    };

    render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 60);
    return () => { clearInterval(interval); };
  }, [chart, series, drawings, activeTool, containerRef, selectedDrawingId, hoveredDrawingId, snapPrice]);

  // --- Render helpers ---

  function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, show: boolean) {
    if (!show) return;
    ctx.setLineDash([]);
    ctx.fillStyle = '#1a1510';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
  }

  function renderHorizontal(ctx: CanvasRenderingContext2D, d: Drawing, series: any, width: number, isSelected: boolean) {
    const y = series.priceToCoordinate(d.points[0].price);
    if (y === null) return;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    ctx.setLineDash([]);
    if (d.showLabel !== false) {
      ctx.font = '10px JetBrains Mono, monospace';
      const text = d.label || d.points[0].price.toFixed(4);
      const tw = ctx.measureText(text).width;
      const lx = width - tw - 16;
      ctx.fillStyle = d.color + '25';
      ctx.beginPath(); ctx.roundRect(lx, y - 10, tw + 12, 20, 3); ctx.fill();
      ctx.fillStyle = d.color;
      ctx.fillText(text, lx + 6, y + 4);
    }
    if (isSelected) {
      drawAnchor(ctx, 60, y, d.color, true);
      drawAnchor(ctx, width - 60, y, d.color, true);
    }
  }

  function renderVertical(ctx: CanvasRenderingContext2D, d: Drawing, timeScale: any, height: number, isSelected: boolean) {
    const x = timeScale.timeToCoordinate(d.points[0].time as any);
    if (x === null) return;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    if (isSelected) {
      drawAnchor(ctx, x, 40, d.color, true);
      drawAnchor(ctx, x, height - 40, d.color, true);
    }
  }

  function renderTrendline(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean, width: number) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;

    let sx = x1, sy = y1, ex = x2, ey = y2;
    const dx = x2 - x1, dy = y2 - y1;

    if (d.extendLeft && dx !== 0) {
      const t = (0 - x1) / dx;
      sx = 0; sy = y1 + dy * t;
    }
    if (d.extendRight && dx !== 0) {
      const t = (width - x1) / dx;
      ex = width; ey = y1 + dy * t;
    }

    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

    if (d.showLabel !== false) {
      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      ctx.setLineDash([]);
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = d.color + '90';
      ctx.fillText(`${angle.toFixed(1)}°`, (x1 + x2) / 2 + 6, (y1 + y2) / 2 - 6);
    }

    drawAnchor(ctx, x1, y1, d.color, isSelected);
    drawAnchor(ctx, x2, y2, d.color, isSelected);
    if (isSelected) drawAnchor(ctx, (x1 + x2) / 2, (y1 + y2) / 2, d.color, true);
  }

  function renderRay(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean, width: number) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const dx = x2 - x1, dy = y2 - y1;
    const extX = dx > 0 ? width + 100 : -100;
    const t = dx !== 0 ? (extX - x1) / dx : 10;
    const extY = y1 + dy * t;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(extX, extY); ctx.stroke();
    drawAnchor(ctx, x1, y1, d.color, isSelected);
    drawAnchor(ctx, x2, y2, d.color, isSelected);
  }

  function renderExtendedLine(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean, width: number) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return;
    const tLeft = dx !== 0 ? (-100 - x1) / dx : -10;
    const tRight = dx !== 0 ? (width + 100 - x1) / dx : 10;
    ctx.beginPath();
    ctx.moveTo(x1 + dx * Math.min(tLeft, tRight), y1 + dy * Math.min(tLeft, tRight));
    ctx.lineTo(x1 + dx * Math.max(tLeft, tRight), y1 + dy * Math.max(tLeft, tRight));
    ctx.stroke();
    drawAnchor(ctx, x1, y1, d.color, isSelected);
    drawAnchor(ctx, x2, y2, d.color, isSelected);
  }

  function renderInfoLine(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

    // Info display
    const priceDiff = d.points[1].price - d.points[0].price;
    const timeDiff = d.points[1].time - d.points[0].time;
    const bars = Math.round(timeDiff / 60);
    const pips = Math.abs(priceDiff) * (d.points[0].price > 10 ? 100 : 10000);

    ctx.setLineDash([]);
    ctx.font = '10px JetBrains Mono, monospace';
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const infoText = `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(5)} (${pips.toFixed(0)}p) | ${bars} bars`;
    const tw = ctx.measureText(infoText).width;

    ctx.fillStyle = '#1a1510e0';
    ctx.beginPath(); ctx.roundRect(midX - tw / 2 - 6, midY - 20, tw + 12, 18, 4); ctx.fill();
    ctx.fillStyle = d.color;
    ctx.fillText(infoText, midX - tw / 2, midY - 8);

    drawAnchor(ctx, x1, y1, d.color, isSelected);
    drawAnchor(ctx, x2, y2, d.color, isSelected);
  }

  function renderRectangle(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
    ctx.globalAlpha = (d.fillOpacity ?? 0.1) * (d.opacity ?? 1);
    ctx.fillStyle = d.fillColor || d.color;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.globalAlpha = d.opacity ?? 1;
    ctx.strokeRect(rx, ry, rw, rh);
    if (isSelected) {
      drawAnchor(ctx, x1, y1, d.color, true);
      drawAnchor(ctx, x2, y2, d.color, true);
      drawAnchor(ctx, x1, y2, d.color, true);
      drawAnchor(ctx, x2, y1, d.color, true);
    }
  }

  function renderEllipse(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    ctx.globalAlpha = (d.fillOpacity ?? 0.1) * (d.opacity ?? 1);
    ctx.fillStyle = d.fillColor || d.color;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = d.opacity ?? 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    if (isSelected) {
      drawAnchor(ctx, x1, y1, d.color, true);
      drawAnchor(ctx, x2, y2, d.color, true);
    }
  }

  function renderTriangle(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const coords = d.points.map(p => ({
      x: timeScale.timeToCoordinate(p.time as any),
      y: series.priceToCoordinate(p.price),
    }));
    if (coords.some(c => c.x === null || c.y === null)) return;
    ctx.globalAlpha = (d.fillOpacity ?? 0.1) * (d.opacity ?? 1);
    ctx.fillStyle = d.fillColor || d.color;
    ctx.beginPath();
    ctx.moveTo(coords[0].x!, coords[0].y!);
    ctx.lineTo(coords[1].x!, coords[1].y!);
    ctx.lineTo(coords[2].x!, coords[2].y!);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = d.opacity ?? 1;
    ctx.stroke();
    if (isSelected) {
      coords.forEach(c => drawAnchor(ctx, c.x!, c.y!, d.color, true));
    }
  }

  function renderFibonacci(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, width: number, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const levels = d.fibLevels || DEFAULT_FIB_LEVELS;
    const priceDiff = d.points[1].price - d.points[0].price;
    ctx.font = '10px JetBrains Mono, monospace';
    const fibColors = ['#d4a54a', '#c47d2e', '#a0855c', '#8b6914', '#d4a54a', '#c47d2e', '#a0855c'];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const price = d.points[0].price + priceDiff * level;
      const y = series.priceToCoordinate(price);
      if (y !== null) {
        ctx.strokeStyle = fibColors[i % fibColors.length];
        ctx.globalAlpha = 0.6 * (d.opacity ?? 1);
        ctx.setLineDash(level === 0 || level === 1 ? [] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), y);
        ctx.lineTo(Math.max(x1, x2) + 60, y);
        ctx.stroke();
        ctx.globalAlpha = d.opacity ?? 1;
        ctx.setLineDash([]);
        ctx.fillStyle = fibColors[i % fibColors.length];
        ctx.fillText(`${(level * 100).toFixed(1)}% — ${price.toFixed(4)}`, Math.max(x1, x2) + 8, y + 4);
      }
    }
    for (let i = 0; i < levels.length - 1; i++) {
      const p1 = d.points[0].price + priceDiff * levels[i];
      const p2 = d.points[0].price + priceDiff * levels[i + 1];
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
      drawAnchor(ctx, x1, y1, d.color, true);
      drawAnchor(ctx, x2, y2, d.color, true);
    }
  }

  function renderFibExtension(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, width: number, isSelected: boolean) {
    if (d.points.length < 3) return;
    const coords = d.points.map(p => ({
      x: timeScale.timeToCoordinate(p.time as any),
      y: series.priceToCoordinate(p.price),
    }));
    if (coords.some(c => c.x === null || c.y === null)) return;

    // Draw the ABC segments
    ctx.strokeStyle = d.color;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(coords[0].x!, coords[0].y!);
    ctx.lineTo(coords[1].x!, coords[1].y!);
    ctx.lineTo(coords[2].x!, coords[2].y!);
    ctx.stroke();

    // Extension levels from point C
    const levels = d.fibLevels || DEFAULT_FIB_EXT_LEVELS;
    const priceDiff = d.points[1].price - d.points[0].price;
    ctx.font = '10px JetBrains Mono, monospace';
    const fibColors = ['#d4a54a', '#c47d2e', '#a0855c', '#8b6914', '#d4a54a', '#c47d2e', '#a0855c'];

    for (let i = 0; i < levels.length; i++) {
      const price = d.points[2].price + priceDiff * levels[i];
      const y = series.priceToCoordinate(price);
      if (y !== null) {
        ctx.strokeStyle = fibColors[i % fibColors.length];
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(coords[2].x!, y);
        ctx.lineTo(coords[2].x! + 300, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = fibColors[i % fibColors.length];
        ctx.fillText(`${(levels[i] * 100).toFixed(1)}% — ${price.toFixed(4)}`, coords[2].x! + 310, y + 4);
      }
    }

    if (isSelected) {
      coords.forEach(c => drawAnchor(ctx, c.x!, c.y!, d.color, true));
    }
  }

  function renderPitchfork(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean, width: number) {
    if (d.points.length < 3) return;
    const coords = d.points.map(p => ({
      x: timeScale.timeToCoordinate(p.time as any) as number,
      y: series.priceToCoordinate(p.price) as number,
    }));
    if (coords.some(c => c.x === null || c.y === null)) return;

    // Median point between B and C
    const midX = (coords[1].x + coords[2].x) / 2;
    const midY = (coords[1].y + coords[2].y) / 2;

    // Median line from A through midpoint
    const dx = midX - coords[0].x;
    const dy = midY - coords[0].y;
    const t = dx !== 0 ? (width - coords[0].x) / dx : 5;
    const extX = coords[0].x + dx * t;
    const extY = coords[0].y + dy * t;

    ctx.beginPath(); ctx.moveTo(coords[0].x, coords[0].y); ctx.lineTo(extX, extY); ctx.stroke();

    // Upper and lower prongs
    const halfW = Math.hypot(coords[2].x - coords[1].x, coords[2].y - coords[1].y) / 2;
    const perpX = -(coords[2].y - coords[1].y) / (halfW * 2) * halfW;
    const perpY = (coords[2].x - coords[1].x) / (halfW * 2) * halfW;

    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.5;
    // Upper
    ctx.beginPath();
    ctx.moveTo(coords[1].x, coords[1].y);
    ctx.lineTo(coords[1].x + dx * t, coords[1].y + dy * t);
    ctx.stroke();
    // Lower
    ctx.beginPath();
    ctx.moveTo(coords[2].x, coords[2].y);
    ctx.lineTo(coords[2].x + dx * t, coords[2].y + dy * t);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Connect B-C
    ctx.beginPath();
    ctx.moveTo(coords[1].x, coords[1].y);
    ctx.lineTo(coords[2].x, coords[2].y);
    ctx.stroke();

    if (isSelected) {
      coords.forEach(c => drawAnchor(ctx, c.x, c.y, d.color, true));
    }
  }

  function renderPosition(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, width: number, isSelected: boolean) {
    const entryPrice = d.entryPrice!;
    const slPrice = d.stopLoss!;
    const tpPrice = d.takeProfit!;
    const isLong = d.type === 'position_long';
    const entryY = series.priceToCoordinate(entryPrice);
    const slY = series.priceToCoordinate(slPrice);
    const tpY = series.priceToCoordinate(tpPrice);
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    if (entryY === null || slY === null || tpY === null || x1 === null) return;

    const boxWidth = 280;

    // TP zone gradient
    const tpGrad = ctx.createLinearGradient(x1, Math.min(entryY, tpY), x1, Math.max(entryY, tpY));
    tpGrad.addColorStop(0, NUBIAN_LONG + '18');
    tpGrad.addColorStop(1, NUBIAN_LONG + '05');
    ctx.fillStyle = tpGrad;
    ctx.fillRect(x1, Math.min(entryY, tpY), boxWidth, Math.abs(tpY - entryY));
    ctx.strokeStyle = NUBIAN_LONG;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(x1, tpY); ctx.lineTo(x1 + boxWidth, tpY); ctx.stroke();

    // SL zone gradient
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

    // Direction arrow
    ctx.fillStyle = isLong ? NUBIAN_LONG : NUBIAN_SHORT;
    const arrowX = x1 + boxWidth - 20;
    ctx.beginPath();
    if (isLong) {
      ctx.moveTo(arrowX, entryY - 15); ctx.lineTo(arrowX - 6, entryY - 5); ctx.lineTo(arrowX + 6, entryY - 5);
    } else {
      ctx.moveTo(arrowX, entryY + 15); ctx.lineTo(arrowX - 6, entryY + 5); ctx.lineTo(arrowX + 6, entryY + 5);
    }
    ctx.fill();

    // Labels
    ctx.font = '10px JetBrains Mono, monospace';
    const rr = d.riskRewardRatio || 0;

    // TP label
    const tpText = `TP ${tpPrice.toFixed(5)}  +${Math.abs(tpPrice - entryPrice).toFixed(5)}`;
    const tpTw = ctx.measureText(tpText).width;
    ctx.fillStyle = NUBIAN_LONG + '20';
    ctx.beginPath(); ctx.roundRect(x1 + 4, tpY + (tpY < entryY ? -18 : 4), tpTw + 10, 16, 3); ctx.fill();
    ctx.fillStyle = NUBIAN_LONG;
    ctx.fillText(tpText, x1 + 9, tpY + (tpY < entryY ? -6 : 16));

    // SL label
    const slText = `SL ${slPrice.toFixed(5)}  -${Math.abs(entryPrice - slPrice).toFixed(5)}`;
    const slTw = ctx.measureText(slText).width;
    ctx.fillStyle = NUBIAN_SHORT + '20';
    ctx.beginPath(); ctx.roundRect(x1 + 4, slY + (slY > entryY ? 4 : -18), slTw + 10, 16, 3); ctx.fill();
    ctx.fillStyle = NUBIAN_SHORT;
    ctx.fillText(slText, x1 + 9, slY + (slY > entryY ? 16 : -6));

    // Entry label
    const entryText = `${isLong ? '▲ LONG' : '▼ SHORT'} @ ${entryPrice.toFixed(5)}  R:R 1:${rr.toFixed(1)}`;
    const entryTw = ctx.measureText(entryText).width;
    ctx.fillStyle = NUBIAN_GOLD + '20';
    ctx.beginPath(); ctx.roundRect(x1 + 4, entryY - 20, entryTw + 10, 16, 3); ctx.fill();
    ctx.fillStyle = NUBIAN_GOLD;
    ctx.fillText(entryText, x1 + 9, entryY - 8);

    // Pips
    const risk = Math.abs(entryPrice - slPrice);
    const reward = Math.abs(tpPrice - entryPrice);
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = NUBIAN_LONG + '80';
    ctx.fillText(`+${(reward * 10000).toFixed(0)}p`, x1 + boxWidth + 4, (entryY + tpY) / 2 + 3);
    ctx.fillStyle = NUBIAN_SHORT + '80';
    ctx.fillText(`-${(risk * 10000).toFixed(0)}p`, x1 + boxWidth + 4, (entryY + slY) / 2 + 3);

    if (isSelected) {
      drawAnchor(ctx, x1, entryY, NUBIAN_GOLD, true);
      drawAnchor(ctx, x1 + boxWidth, entryY, NUBIAN_GOLD, true);
      drawAnchor(ctx, x1, slY, NUBIAN_SHORT, true);
      drawAnchor(ctx, x1 + boxWidth, slY, NUBIAN_SHORT, true);
      drawAnchor(ctx, x1, tpY, NUBIAN_LONG, true);
      drawAnchor(ctx, x1 + boxWidth, tpY, NUBIAN_LONG, true);
    }
  }

  function renderMeasure(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;

    // Dashed line
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);

    // Measurement box
    const priceDiff = d.points[1].price - d.points[0].price;
    const pips = Math.abs(priceDiff) * (d.points[0].price > 10 ? 100 : 10000);
    const timeDiff = Math.abs(d.points[1].time - d.points[0].time);
    const bars = Math.round(timeDiff / 60);
    const percent = ((priceDiff / d.points[0].price) * 100).toFixed(2);

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    ctx.font = '10px JetBrains Mono, monospace';
    const lines = [
      `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(5)}`,
      `${pips.toFixed(0)} pips (${percent}%)`,
      `${bars} bars`,
    ];
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const boxH = lines.length * 14 + 8;
    const boxX = midX - maxW / 2 - 8;
    const boxY = midY - boxH / 2;

    ctx.fillStyle = '#1a1510e0';
    ctx.beginPath(); ctx.roundRect(boxX, boxY, maxW + 16, boxH, 5); ctx.fill();
    ctx.strokeStyle = d.color + '40';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(boxX, boxY, maxW + 16, boxH, 5); ctx.stroke();

    ctx.fillStyle = priceDiff >= 0 ? NUBIAN_LONG : NUBIAN_SHORT;
    ctx.fillText(lines[0], boxX + 8, boxY + 16);
    ctx.fillStyle = '#a0855c';
    ctx.fillText(lines[1], boxX + 8, boxY + 30);
    ctx.fillText(lines[2], boxX + 8, boxY + 44);

    drawAnchor(ctx, x1, y1, d.color, isSelected);
    drawAnchor(ctx, x2, y2, d.color, isSelected);
  }

  function renderPriceRange(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const x1 = timeScale.timeToCoordinate(d.points[0].time as any);
    const y1 = series.priceToCoordinate(d.points[0].price);
    const x2 = timeScale.timeToCoordinate(d.points[1].time as any);
    const y2 = series.priceToCoordinate(d.points[1].price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;

    const rx = Math.min(x1, x2), rw = Math.abs(x2 - x1);
    const ry = Math.min(y1, y2), rh = Math.abs(y2 - y1);
    const priceDiff = d.points[1].price - d.points[0].price;
    const color = priceDiff >= 0 ? NUBIAN_LONG : NUBIAN_SHORT;

    ctx.fillStyle = color + '12';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = color + '60';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Arrow
    const midX = rx + rw / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(midX, y1); ctx.lineTo(midX, y2); ctx.stroke();
    // Arrow head
    const dir = y2 < y1 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(midX, y2);
    ctx.lineTo(midX - 5, y2 - dir * 8);
    ctx.lineTo(midX + 5, y2 - dir * 8);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Label
    const pips = Math.abs(priceDiff) * (d.points[0].price > 10 ? 100 : 10000);
    ctx.font = '10px JetBrains Mono, monospace';
    const text = `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(5)} (${pips.toFixed(0)}p)`;
    ctx.fillStyle = color;
    ctx.fillText(text, midX + 10, (y1 + y2) / 2 + 4);

    drawAnchor(ctx, x1, y1, d.color, isSelected);
    drawAnchor(ctx, x2, y2, d.color, isSelected);
  }

  function renderText(ctx: CanvasRenderingContext2D, d: Drawing, series: any, timeScale: any, isSelected: boolean) {
    const x = timeScale.timeToCoordinate(d.points[0].time as any);
    const y = series.priceToCoordinate(d.points[0].price);
    if (x === null || y === null) return;

    const text = d.text || d.label || 'Note';
    ctx.font = `${12 + d.lineWidth}px Outfit, sans-serif`;
    const tw = ctx.measureText(text).width;

    ctx.fillStyle = '#1a1510cc';
    ctx.beginPath(); ctx.roundRect(x - 4, y - 14, tw + 8, 20, 4); ctx.fill();
    ctx.fillStyle = d.color;
    ctx.fillText(text, x, y);

    if (isSelected) {
      ctx.strokeStyle = d.color + '60';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - 6, y - 16, tw + 12, 24);
      ctx.setLineDash([]);
      drawAnchor(ctx, x - 4, y - 4, d.color, true);
    }
  }

  function renderBrush(ctx: CanvasRenderingContext2D, d: Drawing) {
    if (!d.brushPoints || d.brushPoints.length < 2) return;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(d.brushPoints[0].x, d.brushPoints[0].y);
    for (let i = 1; i < d.brushPoints.length; i++) {
      ctx.lineTo(d.brushPoints[i].x, d.brushPoints[i].y);
    }
    ctx.stroke();
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
            ctx.fillText(pt.price.toFixed(5), 60, y - 4);
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
            ctx.fillText(snapPrice(mousePrice).toFixed(5), 60, mouseRef.current.y - 4);
          }
        }
        // Step indicator
        ctx.setLineDash([]);
        ctx.font = '11px Outfit, sans-serif';
        const labels = ['① Entry', '② Stop Loss', '③ Take Profit'];
        const bgText = labels[pts.length] || '';
        const tw = ctx.measureText(bgText).width;
        ctx.fillStyle = '#1a1510e0';
        ctx.beginPath(); ctx.roundRect(54, 6, tw + 16, 22, 5); ctx.fill();
        ctx.fillStyle = NUBIAN_GOLD;
        ctx.fillText(bgText, 62, 21);
      } else {
        const x1 = timeScale.timeToCoordinate(pts[0].time as any);
        const y1 = series.priceToCoordinate(pts[0].price);
        if (x1 !== null && y1 !== null) {
          ctx.beginPath();
          if (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'price_range') {
            const rx = Math.min(x1, mouseRef.current.x);
            const ry = Math.min(y1, mouseRef.current.y);
            ctx.strokeRect(rx, ry, Math.abs(mouseRef.current.x - x1), Math.abs(mouseRef.current.y - y1));
          } else {
            ctx.moveTo(x1, y1);
            ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
            ctx.stroke();
          }
          // For 3-click tools with 1 or 2 points placed
          if (pts.length >= 1 && (activeTool === 'triangle' || activeTool === 'pitchfork' || activeTool === 'fib_extension')) {
            for (const pt of pts) {
              const px = timeScale.timeToCoordinate(pt.time as any);
              const py = series.priceToCoordinate(pt.price);
              if (px !== null && py !== null) {
                drawAnchor(ctx, px, py, DEFAULT_COLORS[activeTool], true);
              }
            }
          }
        }
      }
      ctx.setLineDash([]);
    }

    // Step hint for position tools (no points yet)
    if ((activeTool === 'position_long' || activeTool === 'position_short') && pendingPointsRef.current.length === 0) {
      ctx.font = '11px Outfit, sans-serif';
      const bgText = '① Click to set Entry Price';
      const tw = ctx.measureText(bgText).width;
      ctx.fillStyle = '#1a1510e0';
      ctx.beginPath(); ctx.roundRect(54, 6, tw + 16, 22, 5); ctx.fill();
      ctx.fillStyle = NUBIAN_GOLD;
      ctx.fillText(bgText, 62, 21);
    }

    // Crosshair snap for other tools
    if (activeTool && !['position_long', 'position_short', 'brush'].includes(activeTool) && pendingPointsRef.current.length === 0 && mouseRef.current) {
      const mousePrice = series.coordinateToPrice(mouseRef.current.y);
      if (mousePrice !== null) {
        ctx.strokeStyle = NUBIAN_AMBER + '40';
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, mouseRef.current.y); ctx.lineTo(width, mouseRef.current.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = NUBIAN_AMBER;
        ctx.fillText(snapPrice(mousePrice).toFixed(5), mouseRef.current.x + 10, mouseRef.current.y - 6);
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

      {/* Floating toolbar */}
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

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute z-50 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
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
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/10 text-primary flex items-center gap-2 transition-colors"
                    onClick={() => handlePlaceOrderFromDrawing(d.id)}
                  >
                    📋 Place as Pending Order
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary text-foreground flex items-center gap-2 transition-colors"
                  onClick={() => { handleUpdateDrawing({ ...d, locked: !d.locked }); setContextMenu(null); }}
                >
                  {d.locked ? '🔓 Unlock' : '🔒 Lock'}
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary text-foreground flex items-center gap-2 transition-colors"
                  onClick={() => { handleUpdateDrawing({ ...d, visible: d.visible === false ? true : false }); setContextMenu(null); }}
                >
                  {d.visible === false ? '👁️ Show' : '🙈 Hide'}
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary text-foreground flex items-center gap-2 transition-colors"
                  onClick={() => handleDuplicateDrawing(d.id)}
                >
                  📄 Duplicate
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
                  onClick={() => handleDeleteDrawing(d.id)}
                >
                  🗑️ Delete
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-destructive/10 text-destructive/60 flex items-center gap-2 transition-colors"
                  onClick={() => {
                    onDrawingsChange(drawings.filter(dd => dd.type !== d.type));
                    setContextMenu(null);
                    setSelectedDrawingId(null);
                  }}
                >
                  🗑️ Remove all {d.type.replace('_', ' ')}s
                </button>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
