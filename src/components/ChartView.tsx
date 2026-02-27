import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType } from 'lightweight-charts';
import type { OHLCVBar } from '@/lib/csvParser';
import { resampleBars, applyTimezoneOffset, detectBaseTimeframe } from '@/lib/csvParser';
import type { Drawing, DrawingType } from '@/lib/drawings';
import { ChartToolbar } from './ChartToolbar';
import { ReplayControls } from './ReplayControls';
import { TimeframeSelector } from './TimeframeSelector';
import { TimezoneSelector } from './TimezoneSelector';
import { DrawingOverlay } from './DrawingOverlay';
import { Globe, BarChart3 } from 'lucide-react';

interface ChartViewProps {
  rawBars: OHLCVBar[];
  fileName: string;
  onReset: () => void;
}

export function ChartView({ rawBars, fileName, onReset }: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseTimeframe = detectBaseTimeframe(rawBars);
  const [timeframe, setTimeframe] = useState(baseTimeframe);
  const [tzOffset, setTzOffset] = useState(0);
  const [currentBarIndex, setCurrentBarIndex] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  // Compute displayed bars
  const allBars = applyTimezoneOffset(
    timeframe === baseTimeframe ? rawBars : resampleBars(rawBars, timeframe),
    tzOffset
  );
  const totalBars = allBars.length;
  const visibleBars = allBars.slice(0, Math.min(currentBarIndex, totalBars));

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#171c24' },
        textColor: '#8a919e',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e2530' },
        horzLines: { color: '#1e2530' },
      },
      crosshair: {
        vertLine: { color: '#3a8f9f', width: 1, style: 2, labelBackgroundColor: '#1a6b7a' },
        horzLine: { color: '#3a8f9f', width: 1, style: 2, labelBackgroundColor: '#1a6b7a' },
      },
      rightPriceScale: {
        borderColor: '#2a3040',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#2a3040',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update series data when bars change
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;

    const candleData = visibleBars.map(b => ({
      time: b.time as any,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumeData = visibleBars.map(b => ({
      time: b.time as any,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)',
    }));

    seriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, [visibleBars]);

  // Playback
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && currentBarIndex < totalBars) {
      const ms = Math.max(50, 800 / speed);
      intervalRef.current = setInterval(() => {
        setCurrentBarIndex(prev => {
          if (prev >= totalBars) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, ms);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, totalBars, currentBarIndex]);

  const handlePlayPause = useCallback(() => {
    if (currentBarIndex >= totalBars) {
      setCurrentBarIndex(50);
      setIsPlaying(true);
    } else {
      setIsPlaying(p => !p);
    }
  }, [currentBarIndex, totalBars]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentBarIndex(Math.min(50, totalBars));
  }, [totalBars]);

  const handleSeek = useCallback((bar: number) => {
    setCurrentBarIndex(bar);
  }, []);

  const handleTimeframeChange = useCallback((tf: number) => {
    setTimeframe(tf);
    setCurrentBarIndex(50);
    setIsPlaying(false);
  }, []);

  const lastBar = visibleBars[visibleBars.length - 1];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">{fileName}</span>
          </div>
          <div className="w-px h-5 bg-border" />
          <TimeframeSelector
            baseTimeframe={baseTimeframe}
            currentTimeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
          />
        </div>

        <div className="flex items-center gap-3">
          {lastBar && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-muted-foreground">O</span>
              <span className="text-foreground">{lastBar.open.toFixed(4)}</span>
              <span className="text-muted-foreground">H</span>
              <span className="text-foreground">{lastBar.high.toFixed(4)}</span>
              <span className="text-muted-foreground">L</span>
              <span className="text-foreground">{lastBar.low.toFixed(4)}</span>
              <span className="text-muted-foreground">C</span>
              <span className={lastBar.close >= lastBar.open ? 'text-long' : 'text-short'}>
                {lastBar.close.toFixed(4)}
              </span>
            </div>
          )}
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5">
            <Globe size={13} className="text-muted-foreground" />
            <TimezoneSelector offset={tzOffset} onOffsetChange={setTzOffset} />
          </div>
          <button
            className="toolbar-btn text-xs"
            onClick={onReset}
          >
            New File
          </button>
        </div>
      </div>

      {/* Drawing toolbar */}
      <ChartToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onClearDrawings={() => setDrawings([])}
        drawingCount={drawings.length}
      />

      {/* Chart area */}
      <div className="flex-1 relative" style={{ cursor: activeTool ? 'crosshair' : 'default' }}>
        <div ref={containerRef} className="absolute inset-0" />
        <DrawingOverlay
          chart={chartRef.current}
          series={seriesRef.current}
          activeTool={activeTool}
          drawings={drawings}
          onDrawingsChange={setDrawings}
          containerRef={containerRef}
        />
      </div>

      {/* Replay controls */}
      <ReplayControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onStepForward={() => setCurrentBarIndex(prev => Math.min(prev + 1, totalBars))}
        onStepBack={() => setCurrentBarIndex(prev => Math.max(prev - 1, 1))}
        onReset={handleReset}
        speed={speed}
        onSpeedChange={setSpeed}
        currentBar={currentBarIndex}
        totalBars={totalBars}
        onSeek={handleSeek}
      />
    </div>
  );
}
