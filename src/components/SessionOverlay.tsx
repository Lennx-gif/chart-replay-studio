import { useEffect, useRef } from 'react';
import type { IChartApi } from 'lightweight-charts';
import type { OHLCVBar } from '@/lib/csvParser';

interface SessionOverlayProps {
  chart: IChartApi | null;
  containerRef: React.RefObject<HTMLDivElement>;
  visibleBars: OHLCVBar[];
  showSessions: boolean;
}

const SESSIONS = [
  { name: 'London', startHour: 7, endHour: 16, color: 'rgba(255, 213, 79, 0.04)', borderColor: 'rgba(255, 213, 79, 0.15)' },
  { name: 'New York', startHour: 13, endHour: 22, color: 'rgba(76, 175, 80, 0.04)', borderColor: 'rgba(76, 175, 80, 0.15)' },
  { name: 'Tokyo', startHour: 0, endHour: 9, color: 'rgba(156, 39, 176, 0.04)', borderColor: 'rgba(156, 39, 176, 0.15)' },
];

export function SessionOverlay({ chart, containerRef, visibleBars, showSessions }: SessionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!chart || !canvasRef.current || !containerRef.current || !showSessions) return;

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

      for (const session of SESSIONS) {
        // Find session boundaries in visible bars
        let inSession = false;
        let sessionStart: number | null = null;

        for (const bar of visibleBars) {
          const hour = new Date(bar.time * 1000).getUTCHours();
          const isInSession = session.startHour < session.endHour
            ? hour >= session.startHour && hour < session.endHour
            : hour >= session.startHour || hour < session.endHour;

          if (isInSession && !inSession) {
            sessionStart = bar.time;
            inSession = true;
          } else if (!isInSession && inSession && sessionStart !== null) {
            // Draw session block
            const x1 = timeScale.timeToCoordinate(sessionStart as any);
            const x2 = timeScale.timeToCoordinate(bar.time as any);
            if (x1 !== null && x2 !== null) {
              ctx.fillStyle = session.color;
              ctx.fillRect(x1, 0, x2 - x1, height);
              ctx.strokeStyle = session.borderColor;
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(x1, 0);
              ctx.lineTo(x1, height);
              ctx.stroke();
              ctx.setLineDash([]);
              // Label
              ctx.font = '9px JetBrains Mono, monospace';
              ctx.fillStyle = session.borderColor;
              ctx.fillText(session.name, x1 + 4, 12);
            }
            inSession = false;
            sessionStart = null;
          }
        }
      }
    };

    render();
    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    const interval = setInterval(render, 200);
    return () => { clearInterval(interval); };
  }, [chart, containerRef, visibleBars, showSessions]);

  if (!showSessions) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  );
}
