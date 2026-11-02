import { useEffect, useRef } from 'react';
import type { IChartApi } from 'lightweight-charts';
import type { OHLCVBar } from '@/lib/csvParser';
import { MARKET_SESSIONS, isSessionActive, getActiveMarketSessions } from '@/lib/timezone';

interface SessionOverlayProps {
  chart: IChartApi | null;
  containerRef: React.RefObject<HTMLDivElement>;
  visibleBars: OHLCVBar[];
  showSessions: boolean;
  tzOffset?: number;
}

export function SessionOverlay({ chart, containerRef, visibleBars, showSessions, tzOffset = 0 }: SessionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const visibleBarsRef = useRef(visibleBars);
  const tzOffsetRef = useRef(tzOffset);
  const scheduleRenderRef = useRef<() => void>(() => {});
  visibleBarsRef.current = visibleBars;
  tzOffsetRef.current = tzOffset;

  useEffect(() => {
    if (!chart || !canvasRef.current || !containerRef.current || !showSessions) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    let rafId: number | null = null;

    // Fast resize observer that only resets canvas bitmap when physical layout dimensions change
    const updateCanvasSize = (w: number, h: number) => {
      const dpr = window.devicePixelRatio || 1;
      if (w <= 0 || h <= 0) return;
      if (sizeRef.current.width !== w || sizeRef.current.height !== h || sizeRef.current.dpr !== dpr) {
        sizeRef.current = { width: w, height: h, dpr };
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
    };

    const initialRect = container.getBoundingClientRect();
    updateCanvasSize(initialRect.width, initialRect.height);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          updateCanvasSize(width, height);
          scheduleRender();
        }
      }
    });
    ro.observe(container);
    const handleWindowResize = () => {
      const rect = container.getBoundingClientRect();
      updateCanvasSize(rect.width, rect.height);
      scheduleRender();
    };
    window.addEventListener('resize', handleWindowResize);

    const render = () => {
      const { width, height, dpr } = sizeRef.current;
      if (width <= 0 || height <= 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const timeScale = chart.timeScale();
      const visibleBars = visibleBarsRef.current;
      const len = visibleBars.length;
      if (len === 0) return;

      // Restrict iteration strictly to visible on-screen bars to prevent processing thousands of off-screen candles
      const range = timeScale.getVisibleLogicalRange();
      const fromIdx = range ? Math.max(0, Math.floor(range.from) - 20) : Math.max(0, len - 300);
      const toIdx = range ? Math.min(len, Math.ceil(range.to) + 20) : len;

      if (fromIdx >= toIdx) return;

      const tzSec = tzOffsetRef.current * 3600;

      // Draw background bands for each market session taking into account DST
      for (let sIdx = 0; sIdx < MARKET_SESSIONS.length; sIdx++) {
        const session = MARKET_SESSIONS[sIdx];
        let inSession = false;
        let sessionStart: number | null = null;

        for (let i = fromIdx; i < toIdx; i++) {
          const bar = visibleBars[i];
          const realUtc = bar.time;
          const active = isSessionActive(session, realUtc);

          if (active && !inSession) {
            sessionStart = bar.time + tzSec;
            inSession = true;
          } else if (!active && inSession && sessionStart !== null) {
            const x1 = timeScale.timeToCoordinate(sessionStart as any);
            const x2 = timeScale.timeToCoordinate((bar.time + tzSec) as any);

            if (x1 !== null && x2 !== null) {
              const rectX = Math.min(x1, x2);
              const rectW = Math.max(2, Math.abs(x2 - x1));

              // Fill session tint
              ctx.fillStyle = session.color;
              ctx.fillRect(rectX, 0, rectW, height);

              // Session open boundary line
              ctx.strokeStyle = session.borderColor;
              ctx.lineWidth = 1;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(rectX, 0);
              ctx.lineTo(rectX, height);
              ctx.stroke();
              ctx.setLineDash([]);

              // Session label badge
              ctx.font = '10px JetBrains Mono, monospace';
              const labelText = `${session.name} Open`;
              const textWidth = ctx.measureText(labelText).width;

              ctx.fillStyle = 'rgba(24, 19, 14, 0.85)';
              ctx.beginPath();
              ctx.roundRect(rectX + 4, 8, textWidth + 10, 18, 4);
              ctx.fill();

              ctx.strokeStyle = session.borderColor;
              ctx.lineWidth = 1;
              ctx.stroke();

              ctx.fillStyle = session.borderColor;
              ctx.fillText(labelText, rectX + 9, 21);
            }

            inSession = false;
            sessionStart = null;
          }
        }

        // If session is still active at the newest candle in this window
        if (inSession && sessionStart !== null) {
          const x1 = timeScale.timeToCoordinate(sessionStart as any);
          const lastBar = visibleBars[toIdx - 1] || visibleBars[len - 1];
          const x2 = timeScale.timeToCoordinate((lastBar.time + tzSec) as any);

          if (x1 !== null && x2 !== null) {
            const rectX = Math.min(x1, x2);
            const rectW = Math.max(2, Math.abs(x2 - x1) + 20);

            ctx.fillStyle = session.color;
            ctx.fillRect(rectX, 0, rectW, height);

            ctx.strokeStyle = session.borderColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(rectX, 0);
            ctx.lineTo(rectX, height);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // Render currently active sessions banner badge in the top right
      const lastBar = visibleBars[len - 1];
      if (lastBar) {
        const activeSessions = getActiveMarketSessions(lastBar.time);

        if (activeSessions.length > 0) {
          const badgeY = 12;
          ctx.font = '10px JetBrains Mono, monospace';
          const sessionNames = activeSessions.map((s) => s.name).join(' · ');
          const label = `● ${sessionNames} Session`;
          const textW = ctx.measureText(label).width;

          ctx.fillStyle = 'rgba(24, 19, 14, 0.88)';
          ctx.beginPath();
          ctx.roundRect(width - textW - 24, badgeY, textW + 16, 20, 6);
          ctx.fill();

          ctx.strokeStyle = 'rgba(212, 165, 74, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#d4a54a';
          ctx.fillText(label, width - textW - 16, badgeY + 14);
        }
      }
    };

    const scheduleRender = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        render();
      });
    };

    scheduleRenderRef.current = scheduleRender;
    scheduleRender();
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRender);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      scheduleRenderRef.current = () => {};
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRender);
      ro.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [chart, containerRef, showSessions]);

  useEffect(() => {
    scheduleRenderRef.current();
  }, [visibleBars, tzOffset]);

  if (!showSessions) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 4 }}
    />
  );
}
