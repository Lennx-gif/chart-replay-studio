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

  useEffect(() => {
    if (!chart || !canvasRef.current || !containerRef.current || !showSessions) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const timeScale = chart.timeScale();
      if (visibleBars.length === 0) return;

      // Draw background bands for each market session taking into account DST
      for (const session of MARKET_SESSIONS) {
        let inSession = false;
        let sessionStart: number | null = null;

        for (let i = 0; i < visibleBars.length; i++) {
          const bar = visibleBars[i];
          // Recover real UTC seconds for exact local DST evaluation
          const realUtc = bar.time - tzOffset * 3600;
          const active = isSessionActive(session, realUtc);

          if (active && !inSession) {
            sessionStart = bar.time;
            inSession = true;
          } else if (!active && inSession && sessionStart !== null) {
            const x1 = timeScale.timeToCoordinate(sessionStart as any);
            const x2 = timeScale.timeToCoordinate(bar.time as any);

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

        // If session is still active at the newest candle
        if (inSession && sessionStart !== null) {
          const x1 = timeScale.timeToCoordinate(sessionStart as any);
          const lastBar = visibleBars[visibleBars.length - 1];
          const x2 = timeScale.timeToCoordinate(lastBar.time as any);

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
      const lastBar = visibleBars[visibleBars.length - 1];
      if (lastBar) {
        const currentUtc = lastBar.time - tzOffset * 3600;
        const activeSessions = getActiveMarketSessions(currentUtc);

        if (activeSessions.length > 0) {
          const badgeX = width - 180;
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

    render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 150);
    return () => {
      clearInterval(interval);
    };
  }, [chart, containerRef, visibleBars, showSessions, tzOffset]);

  if (!showSessions) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 4 }}
    />
  );
}
