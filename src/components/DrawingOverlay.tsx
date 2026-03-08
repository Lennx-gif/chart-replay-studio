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

// Nubian theme colors for positions
const NUBIAN_LONG = '#4caf50';
const NUBIAN_SHORT = '#e05347';
const NUBIAN_GOLD = '#d4a54a';
const NUBIAN_AMBER = '#c47d2e';

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

  // Snap price to nearest 0.5 pip for forex, 0.01 for stocks
  const snapPrice = useCallback((price: number) => {
    if (price > 10) return Math.round(price * 100) / 100;
    return Math.round(price * 10000) / 10000;
  }, []);

  const handleClick = useCallback((e: MouseEvent) => {
    if (!activeTool) {
      const point = getBarAndPrice(e);
      if (point) {
        let nearest: Drawing | null = null;
        let minDist = Infinity;
        for (const d of drawings) {
          if (d.locked) continue;
          for (const p of d.points) {
            const dist = Math.abs(p.price - point.price);
            if (dist < minDist) { minDist = dist; nearest = d; }
          }
        }
        if (nearest && series) {
          setSelectedDrawingId(nearest.id);
        } else {
          setSelectedDrawingId(null);
        }
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
  }, [activeTool, drawings, onDrawingsChange, getBarAndPrice, series, snapPrice]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, [containerRef]);

  // Right-click to cancel pending drawing
  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (pendingPointsRef.current.length > 0) {
      e.preventDefault();
      pendingPointsRef.current = [];
    }
  }, []);

  useEffect(() => {
    pendingPointsRef.current = [];
  }, [activeTool]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('click', handleClick);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('contextmenu', handleContextMenu);
    return () => {
      el.removeEventListener('click', handleClick);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleClick, handleMouseMove, handleContextMenu, containerRef]);

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
          ctx.shadowBlur = 8;
        }

        if (drawing.locked) {
          ctx.globalAlpha = 0.6;
        }

        if (drawing.type === 'horizontal' && drawing.points[0]) {
          const y = series.priceToCoordinate(drawing.points[0].price);
          if (y !== null) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            // Label with background
            ctx.setLineDash([]);
            ctx.font = '10px JetBrains Mono, monospace';
            const text = drawing.label || drawing.points[0].price.toFixed(4);
            const tw = ctx.measureText(text).width;
            // Pill-style label
            const lx = width - tw - 16;
            const ly = y - 10;
            ctx.fillStyle = drawing.color + '25';
            ctx.beginPath();
            ctx.roundRect(lx, ly, tw + 12, 20, 3);
            ctx.fill();
            ctx.fillStyle = drawing.color;
            ctx.fillText(text, lx + 6, y + 4);
            // Anchor dots when selected
            if (isSelected) {
              ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(width / 2, y, 4, 0, Math.PI * 2); ctx.fill();
            }
          }
        } else if (drawing.type === 'vertical' && drawing.points[0]) {
          const x = timeScale.timeToCoordinate(drawing.points[0].time as any);
          if (x !== null) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            // Time label at bottom
            if (isSelected) {
              ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(x, height / 2, 4, 0, Math.PI * 2); ctx.fill();
            }
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
            // Angle label
            const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            ctx.setLineDash([]);
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillStyle = drawing.color + '90';
            ctx.fillText(`${angle.toFixed(1)}°`, midX + 6, midY - 6);
            // Anchor dots
            ctx.fillStyle = drawing.color;
            ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x2, y2, 4, 0, Math.PI * 2); ctx.fill();
          }
        } else if (drawing.type === 'ray' && drawing.points.length === 2) {
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);
          const y1 = series.priceToCoordinate(drawing.points[0].price);
          const x2 = timeScale.timeToCoordinate(drawing.points[1].time as any);
          const y2 = series.priceToCoordinate(drawing.points[1].price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
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
            ctx.fillStyle = drawing.color;
            ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill();
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
            // Dimension label
            if (isSelected && series) {
              const priceDiff = Math.abs(drawing.points[1].price - drawing.points[0].price);
              ctx.setLineDash([]);
              ctx.font = '9px JetBrains Mono, monospace';
              ctx.fillStyle = drawing.color + '90';
              ctx.fillText(`Δ ${priceDiff.toFixed(4)}`, rx + 4, ry + 12);
            }
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
            
            // Fib zone colors for Nubian theme
            const fibColors = ['#d4a54a', '#c47d2e', '#a0855c', '#8b6914', '#d4a54a', '#c47d2e', '#a0855c'];
            
            for (let i = 0; i < levels.length; i++) {
              const level = levels[i];
              const price = drawing.points[0].price + priceDiff * level;
              const y = series.priceToCoordinate(price);
              if (y !== null) {
                ctx.strokeStyle = fibColors[i % fibColors.length] || drawing.color;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.setLineDash(level === 0 || level === 1 ? [] : [4, 4]);
                ctx.moveTo(Math.min(x1, x2), y);
                ctx.lineTo(Math.max(x1, x2) + 60, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.setLineDash([]);
                const text = `${(level * 100).toFixed(1)}% — ${price.toFixed(4)}`;
                ctx.fillStyle = fibColors[i % fibColors.length] || drawing.color;
                ctx.fillText(text, Math.max(x1, x2) + 8, y + 4);
              }
            }
            // Shaded zones between levels
            for (let i = 0; i < levels.length - 1; i++) {
              const p1 = drawing.points[0].price + priceDiff * levels[i];
              const p2 = drawing.points[0].price + priceDiff * levels[i + 1];
              const cy1 = series.priceToCoordinate(p1);
              const cy2 = series.priceToCoordinate(p2);
              if (cy1 !== null && cy2 !== null) {
                ctx.fillStyle = fibColors[i % fibColors.length] || drawing.color;
                ctx.globalAlpha = 0.04 + (i * 0.012);
                ctx.fillRect(Math.min(x1, x2), Math.min(cy1, cy2), Math.abs(x2 - x1) + 60, Math.abs(cy2 - cy1));
                ctx.globalAlpha = 1;
              }
            }
          }
        } else if ((drawing.type === 'position_long' || drawing.type === 'position_short') && drawing.points.length >= 3) {
          const entryPrice = drawing.entryPrice!;
          const slPrice = drawing.stopLoss!;
          const tpPrice = drawing.takeProfit!;
          const isLong = drawing.type === 'position_long';

          const entryY = series.priceToCoordinate(entryPrice);
          const slY = series.priceToCoordinate(slPrice);
          const tpY = series.priceToCoordinate(tpPrice);
          const x1 = timeScale.timeToCoordinate(drawing.points[0].time as any);

          if (entryY !== null && slY !== null && tpY !== null && x1 !== null) {
            const boxWidth = 260;

            // TP zone - green gradient
            const tpGrad = ctx.createLinearGradient(x1, Math.min(entryY, tpY), x1, Math.max(entryY, tpY));
            tpGrad.addColorStop(0, NUBIAN_LONG + '18');
            tpGrad.addColorStop(1, NUBIAN_LONG + '05');
            ctx.fillStyle = tpGrad;
            ctx.fillRect(x1, Math.min(entryY, tpY), boxWidth, Math.abs(tpY - entryY));
            
            // TP border
            ctx.strokeStyle = NUBIAN_LONG;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.beginPath(); ctx.moveTo(x1, tpY); ctx.lineTo(x1 + boxWidth, tpY); ctx.stroke();
            ctx.setLineDash([]);

            // SL zone - red gradient
            const slGrad = ctx.createLinearGradient(x1, Math.min(entryY, slY), x1, Math.max(entryY, slY));
            slGrad.addColorStop(0, NUBIAN_SHORT + '05');
            slGrad.addColorStop(1, NUBIAN_SHORT + '18');
            ctx.fillStyle = slGrad;
            ctx.fillRect(x1, Math.min(entryY, slY), boxWidth, Math.abs(slY - entryY));
            
            // SL border
            ctx.strokeStyle = NUBIAN_SHORT;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.beginPath(); ctx.moveTo(x1, slY); ctx.lineTo(x1 + boxWidth, slY); ctx.stroke();
            ctx.setLineDash([]);

            // Entry line - bold gold
            ctx.strokeStyle = NUBIAN_GOLD;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x1, entryY); ctx.lineTo(x1 + boxWidth, entryY); ctx.stroke();

            // Direction arrow
            const arrowX = x1 + boxWidth - 20;
            ctx.fillStyle = isLong ? NUBIAN_LONG : NUBIAN_SHORT;
            ctx.beginPath();
            if (isLong) {
              const arrowY = entryY - 15;
              ctx.moveTo(arrowX, arrowY);
              ctx.lineTo(arrowX - 6, arrowY + 10);
              ctx.lineTo(arrowX + 6, arrowY + 10);
            } else {
              const arrowY = entryY + 15;
              ctx.moveTo(arrowX, arrowY);
              ctx.lineTo(arrowX - 6, arrowY - 10);
              ctx.lineTo(arrowX + 6, arrowY - 10);
            }
            ctx.fill();

            // Labels with pill backgrounds
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

            // P&L potential labels on the right
            const risk = Math.abs(entryPrice - slPrice);
            const reward = Math.abs(tpPrice - entryPrice);
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillStyle = NUBIAN_LONG + '80';
            ctx.fillText(`+${(reward * 10000).toFixed(0)} pips`, x1 + boxWidth + 4, (entryY + tpY) / 2 + 3);
            ctx.fillStyle = NUBIAN_SHORT + '80';
            ctx.fillText(`-${(risk * 10000).toFixed(0)} pips`, x1 + boxWidth + 4, (entryY + slY) / 2 + 3);
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
          for (const pt of pts) {
            const y = series.priceToCoordinate(pt.price);
            if (y !== null) {
              ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
              // Price tag
              ctx.setLineDash([]);
              ctx.font = '10px JetBrains Mono, monospace';
              ctx.fillStyle = NUBIAN_GOLD;
              ctx.fillText(pt.price.toFixed(4), 10, y - 4);
              ctx.setLineDash([3, 3]);
            }
          }
          // Mouse preview line
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
          ctx.fillStyle = NUBIAN_GOLD;
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

      // Position hint for initial state
      if (activeTool && (activeTool === 'position_long' || activeTool === 'position_short') && pendingPointsRef.current.length === 0) {
        ctx.font = '12px Outfit, sans-serif';
        const bgText = '① Click to set Entry Price';
        const tw = ctx.measureText(bgText).width;
        ctx.fillStyle = '#1a1510e0';
        ctx.beginPath(); ctx.roundRect(8, 6, tw + 16, 24, 6); ctx.fill();
        ctx.fillStyle = NUBIAN_GOLD;
        ctx.fillText(bgText, 16, 22);
      }

      // Crosshair price snap preview for any tool
      if (activeTool && mouseRef.current && !(activeTool === 'position_long' || activeTool === 'position_short') && pendingPointsRef.current.length === 0) {
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
    };

    render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 80);
    return () => { clearInterval(interval); };
  }, [chart, series, drawings, activeTool, containerRef, selectedDrawingId, snapPrice]);

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
