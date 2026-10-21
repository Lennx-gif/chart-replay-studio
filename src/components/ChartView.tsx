import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType } from 'lightweight-charts';
import type { OHLCVBar } from '@/lib/csvParser';
import { detectBaseTimeframe, applyTimezoneOffset } from '@/lib/csvParser';
import { resolveBarsForTimeframe, findBarIndexForTimestamp, timeframeToLabel } from '@/lib/timeframeEngine';
import type { Drawing, DrawingType } from '@/lib/drawings';
import type { Order, OrderSide } from '@/lib/tradeEngine';
import { createMarketOrder, createLimitOrder, processBar, calculateStats } from '@/lib/tradeEngine';
import {
  saveSession,
  getChartSettings,
  saveChartSettings,
  type BacktestSession,
  type ChartSettings,
  type StoredDataset,
} from '@/lib/db/localDatabase';
import { ChartToolbar } from './ChartToolbar';
import { ReplayControls, type StepMode } from './ReplayControls';
import { TimeframeSelector } from './TimeframeSelector';
import { TimezoneSelector } from './TimezoneSelector';
import { DrawingOverlay } from './DrawingOverlay';
import { FavoritesFloatingBar } from './FavoritesFloatingBar';
import { SessionHeaderBadge } from './SessionHeaderBadge';
import { SessionManagerModal } from './SessionManagerModal';
import { ChartSettingsModal } from './ChartSettingsModal';
import { CreateSessionModal } from './CreateSessionModal';
import { DashboardModal } from './DashboardModal';
import { TradePanel } from './TradePanel';
import { TradeJournal } from './TradeJournal';
import { GoToDate } from './GoToDate';
import { SessionOverlay } from './SessionOverlay';
import { BalanceSettings } from './BalanceSettings';
import { SymbolSwitcher } from './SymbolSwitcher';
import { useProfile } from '@/contexts/ProfileContext';
import {
  Globe,
  Columns,
  Eye,
  EyeOff,
  CandlestickChart,
  LineChart,
  BarChart,
  Sliders,
  FolderOpen,
  LayoutDashboard,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';

export type ChartStyle = 'candles' | 'line' | 'bars' | 'area';

interface ChartViewProps {
  rawBars: OHLCVBar[];
  fileName: string;
  csvText: string;
  dataset?: StoredDataset | null;
  initialSession?: BacktestSession | null;
  initialOpenCreateSession?: boolean;
  onSymbolChange: (symbol: string, timeframe: string) => void;
  onReset: () => void;
}

// Simple moving average calculation
function calculateSMA(bars: OHLCVBar[], period: number) {
  const result: { time: any; value: number }[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += bars[i - j].close;
    result.push({ time: bars[i].time as any, value: sum / period });
  }
  return result;
}

// Exponential moving average calculation
function calculateEMA(bars: OHLCVBar[], period: number) {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: any; value: number }[] = [];
  let prevEMA = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period;
  result.push({ time: bars[period - 1].time as any, value: prevEMA });

  for (let i = period; i < bars.length; i++) {
    const currentEMA = bars[i].close * k + prevEMA * (1 - k);
    result.push({ time: bars[i].time as any, value: currentEMA });
    prevEMA = currentEMA;
  }
  return result;
}

export function ChartView({
  rawBars,
  fileName,
  dataset = null,
  initialSession = null,
  initialOpenCreateSession = false,
  onSymbolChange,
  onReset,
}: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { profile } = useProfile();
  const startingBalance = profile?.startingBalance || 10000;

  // Active session state
  const [activeSession, setActiveSession] = useState<BacktestSession | null>(initialSession);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(Boolean(initialOpenCreateSession));

  // Timeframe and base resolution
  const baseTimeframe = detectBaseTimeframe(rawBars);
  const [timeframe, setTimeframe] = useState<number>(initialSession?.timeframe || baseTimeframe);
  const [tzOffset, setTzOffset] = useState<number>(0);

  // Chart settings
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    id: 'global',
    chartStyle: 'candles',
    candleUpColor: '#4caf50',
    candleDownColor: '#e05347',
    wickUpColor: '#4caf50',
    wickDownColor: '#e05347',
    gridVisible: false,
    gridColor: '#2a221830',
    watermarkVisible: true,
    activeIndicators: {
      sma: { enabled: false, period: 20, color: '#2196f3' },
      ema: { enabled: false, period: 50, color: '#ff9800' },
      bb: { enabled: false, period: 20, stdDev: 2 },
      rsi: { enabled: false, period: 14 },
      sessions: { enabled: false },
    },
  });

  // Replay & Stepping state
  const [isPlaying, setIsPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState(initialSession?.speed ? 800 / initialSession.speed : 800);
  const [stepMode, setStepMode] = useState<StepMode>(initialSession?.stepMode || 'bar');
  const [stepMinutes, setStepMinutes] = useState<number>(initialSession?.stepMinutes || 15);

  // Tools & Drawings
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>(initialSession?.drawings || []);
  const [magnetMode, setMagnetMode] = useState(false);
  const [lockAllDrawings, setLockAllDrawings] = useState(false);
  const [hideAllDrawings, setHideAllDrawings] = useState(false);
  const [favorites, setFavorites] = useState<(DrawingType | null)[]>(() => {
    try {
      const stored = localStorage.getItem('repla_tool_favorites');
      return stored ? JSON.parse(stored) : ['trendline', 'horizontal', 'fibonacci', 'position_long', 'position_short', 'measure'];
    } catch {
      return ['trendline', 'horizontal', 'fibonacci', 'position_long', 'position_short', 'measure'];
    }
  });

  // Orders & Trading
  const [orders, setOrders] = useState<Order[]>(initialSession?.orders || []);
  const [showTradePanel, setShowTradePanel] = useState(true);
  const [showJournal, setShowJournal] = useState(false);
  const [showSessions, setShowSessions] = useState(false);

  // Load persistent chart settings on mount
  useEffect(() => {
    getChartSettings().then((s) => setChartSettings(s)).catch(() => {});
  }, []);

  // Compute timezone-adjusted and timeframe-resolved bars
  const fullTimelineBars = useMemo(() => {
    const resolved = resolveBarsForTimeframe(rawBars, baseTimeframe, timeframe);
    return applyTimezoneOffset(resolved, tzOffset);
  }, [rawBars, baseTimeframe, timeframe, tzOffset]);

  // Apply session Data Times filter if active
  const filteredTimelineBars = useMemo(() => {
    if (!activeSession?.dateFilter || activeSession.dateFilter.mode === 'all') {
      return fullTimelineBars;
    }

    const { mode, startYear, endYear, months, customStart, customEnd } = activeSession.dateFilter;

    return fullTimelineBars.filter((bar) => {
      const d = new Date(bar.time * 1000);

      if (mode === 'years') {
        const y = d.getUTCFullYear();
        if (startYear && y < startYear) return false;
        if (endYear && y > endYear) return false;
        return true;
      }

      if (mode === 'months') {
        const m = d.getUTCMonth();
        return !months || months.length === 0 || months.includes(m);
      }

      if (mode === 'custom') {
        if (customStart && bar.time < customStart) return false;
        if (customEnd && bar.time > customEnd) return false;
        return true;
      }

      return true;
    });
  }, [fullTimelineBars, activeSession?.dateFilter]);

  const totalBars = filteredTimelineBars.length;

  // Track replay time by unix timestamp
  const [currentReplayTime, setCurrentReplayTime] = useState<number>(() => {
    if (initialSession?.currentTimestamp && filteredTimelineBars.some((b) => b.time >= initialSession.currentTimestamp)) {
      return initialSession.currentTimestamp;
    }
    const defaultIdx = Math.min(50, filteredTimelineBars.length - 1);
    return filteredTimelineBars[defaultIdx]?.time || Math.floor(Date.now() / 1000);
  });

  // Visible bars slice based on currentReplayTime
  const currentBarIndex = useMemo(() => {
    if (filteredTimelineBars.length === 0) return 0;
    return findBarIndexForTimestamp(filteredTimelineBars, currentReplayTime);
  }, [filteredTimelineBars, currentReplayTime]);

  const visibleBars = useMemo(() => {
    return filteredTimelineBars.slice(0, Math.min(currentBarIndex + 1, totalBars));
  }, [filteredTimelineBars, currentBarIndex, totalBars]);

  const lastBar = visibleBars[visibleBars.length - 1];
  const currentPrice = lastBar?.close || 0;

  // Auto-save session state locally on drawings/orders/replay changes
  useEffect(() => {
    if (!activeSession) return;
    const updatedSession: BacktestSession = {
      ...activeSession,
      timeframe,
      currentTimestamp: currentReplayTime,
      speed: Math.round(800 / intervalMs),
      stepMode,
      stepMinutes,
      drawings,
      orders,
      updatedAt: Date.now(),
    };
    saveSession(updatedSession).catch(() => {});
  }, [activeSession?.id, timeframe, currentReplayTime, intervalMs, stepMode, stepMinutes, drawings, orders]);

  // Order processing on bar advance
  useEffect(() => {
    if (!lastBar || orders.length === 0) return;
    const updated = processBar(lastBar, orders);
    const changed = updated.some((o, i) => o.status !== orders[i].status);
    if (changed) {
      setOrders(updated);
      updated.forEach((o, i) => {
        if (o.status !== orders[i].status && o.status === 'closed') {
          const pnlStr = (o.pnl || 0) >= 0 ? `+${(o.pnl || 0).toFixed(2)}` : (o.pnl || 0).toFixed(2);
          toast[o.closeReason === 'tp' ? 'success' : 'error'](
            `${o.side.toUpperCase()} closed by ${o.closeReason?.toUpperCase()}: ${pnlStr}`
          );
        }
      });
    }
  }, [lastBar?.time]);

  // Create & mount chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1510' },
        textColor: '#a0855c',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: chartSettings.gridVisible, color: `rgba(212, 165, 74, ${chartSettings.gridOpacity ?? 0.15})` },
        horzLines: { visible: chartSettings.gridVisible, color: `rgba(212, 165, 74, ${chartSettings.gridOpacity ?? 0.15})` },
      },
      crosshair: {
        vertLine: { color: '#c47d2e', width: 1, style: 2, labelBackgroundColor: '#8b5e14' },
        horzLine: { color: '#c47d2e', width: 1, style: 2, labelBackgroundColor: '#8b5e14' },
      },
      rightPriceScale: { borderColor: '#2a2218', scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderColor: '#2a2218', timeVisible: true, secondsVisible: false },
    });

    let mainSeries: ISeriesApi<any>;
    if (chartSettings.chartStyle === 'line') {
      mainSeries = chart.addLineSeries({ color: '#d4a54a', lineWidth: 2 });
    } else if (chartSettings.chartStyle === 'area') {
      mainSeries = chart.addAreaSeries({
        topColor: 'rgba(212, 165, 74, 0.35)',
        bottomColor: 'rgba(212, 165, 74, 0.0)',
        lineColor: '#d4a54a',
        lineWidth: 2,
      });
    } else if (chartSettings.chartStyle === 'bars') {
      mainSeries = chart.addBarSeries({
        upColor: chartSettings.candleUpColor,
        downColor: chartSettings.candleDownColor,
      });
    } else {
      mainSeries = chart.addCandlestickSeries({
        upColor: chartSettings.candleUpColor,
        downColor: chartSettings.candleDownColor,
        borderDownColor: chartSettings.candleDownColor,
        borderUpColor: chartSettings.candleUpColor,
        wickDownColor: chartSettings.wickDownColor,
        wickUpColor: chartSettings.wickUpColor,
      });
    }

    const volumeSeries = chart.addHistogramSeries({
      color: '#d4a54a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // Technical indicators
    let smaSeries: ISeriesApi<'Line'> | null = null;
    if (chartSettings.activeIndicators.sma.enabled) {
      smaSeries = chart.addLineSeries({
        color: chartSettings.activeIndicators.sma.color,
        lineWidth: 1.5,
        priceLineVisible: false,
      });
    }

    let emaSeries: ISeriesApi<'Line'> | null = null;
    if (chartSettings.activeIndicators.ema.enabled) {
      emaSeries = chart.addLineSeries({
        color: chartSettings.activeIndicators.ema.color,
        lineWidth: 1.5,
        priceLineVisible: false,
      });
    }

    chartRef.current = chart;
    seriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            chart.applyOptions({ width: Math.floor(width), height: Math.floor(height) });
          }
        }
      });
      ro.observe(containerRef.current);
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartSettings]);

  // Update chart series data on visibleBars update
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;
    const isOHLC = chartSettings.chartStyle === 'candles' || chartSettings.chartStyle === 'bars';

    if (isOHLC) {
      seriesRef.current.setData(
        visibleBars.map((b) => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close }))
      );
    } else {
      seriesRef.current.setData(visibleBars.map((b) => ({ time: b.time as any, value: b.close })));
    }

    volumeSeriesRef.current.setData(
      visibleBars.map((b) => ({
        time: b.time as any,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(76, 175, 80, 0.25)' : 'rgba(224, 83, 71, 0.25)',
      }))
    );

    // Update indicator series
    if (smaSeriesRef.current && chartSettings.activeIndicators.sma.enabled) {
      const smaData = calculateSMA(visibleBars, chartSettings.activeIndicators.sma.period);
      smaSeriesRef.current.setData(smaData);
    }
    if (emaSeriesRef.current && chartSettings.activeIndicators.ema.enabled) {
      const emaData = calculateEMA(visibleBars, chartSettings.activeIndicators.ema.period);
      emaSeriesRef.current.setData(emaData);
    }
  }, [visibleBars, chartSettings]);

  // Replay interval timer with timeframe-aligned stepping
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isPlaying && currentBarIndex < totalBars - 1) {
      intervalRef.current = setInterval(() => {
        setCurrentReplayTime((prevTime) => {
          if (stepMode === 'time') {
            // Advance by fixed time increment
            const nextTime = prevTime + stepMinutes * 60;
            const lastBarTime = filteredTimelineBars[filteredTimelineBars.length - 1]?.time || 0;
            if (nextTime >= lastBarTime) {
              setIsPlaying(false);
              return lastBarTime;
            }
            return nextTime;
          } else {
            // Advance by 1 bar
            const curIdx = findBarIndexForTimestamp(filteredTimelineBars, prevTime);
            if (curIdx >= filteredTimelineBars.length - 1) {
              setIsPlaying(false);
              return prevTime;
            }
            return filteredTimelineBars[curIdx + 1].time;
          }
        });
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, intervalMs, stepMode, stepMinutes, currentBarIndex, totalBars, filteredTimelineBars]);

  // Playback handlers
  const handlePlayPause = useCallback(() => {
    if (currentBarIndex >= totalBars - 1) {
      const firstTime = filteredTimelineBars[Math.min(50, totalBars - 1)]?.time || 0;
      setCurrentReplayTime(firstTime);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  }, [currentBarIndex, totalBars, filteredTimelineBars]);

  const handleStepForward = useCallback(() => {
    if (stepMode === 'time') {
      setCurrentReplayTime((p) => p + stepMinutes * 60);
    } else {
      const curIdx = findBarIndexForTimestamp(filteredTimelineBars, currentReplayTime);
      if (curIdx < filteredTimelineBars.length - 1) {
        setCurrentReplayTime(filteredTimelineBars[curIdx + 1].time);
      }
    }
  }, [stepMode, stepMinutes, filteredTimelineBars, currentReplayTime]);

  const handleStepBack = useCallback(() => {
    if (stepMode === 'time') {
      setCurrentReplayTime((p) => Math.max(filteredTimelineBars[0]?.time || 0, p - stepMinutes * 60));
    } else {
      const curIdx = findBarIndexForTimestamp(filteredTimelineBars, currentReplayTime);
      if (curIdx > 0) {
        setCurrentReplayTime(filteredTimelineBars[curIdx - 1].time);
      }
    }
  }, [stepMode, stepMinutes, filteredTimelineBars, currentReplayTime]);

  const handleResetReplay = useCallback(() => {
    setIsPlaying(false);
    const resetTime = filteredTimelineBars[Math.min(50, totalBars - 1)]?.time || filteredTimelineBars[0]?.time || 0;
    setCurrentReplayTime(resetTime);
  }, [filteredTimelineBars, totalBars]);

  const handleSeek = useCallback(
    (barNumber: number) => {
      const idx = Math.max(0, Math.min(barNumber - 1, totalBars - 1));
      if (filteredTimelineBars[idx]) {
        setCurrentReplayTime(filteredTimelineBars[idx].time);
      }
    },
    [totalBars, filteredTimelineBars]
  );

  const handleTimeframeChange = useCallback(
    (newTf: number) => {
      setTimeframe(newTf);
      setIsPlaying(false);
      toast.success(`Switched to ${timeframeToLabel(newTf)}`);
    },
    []
  );

  // Favorites handling
  const handleToggleFavorite = useCallback((type: DrawingType | null) => {
    setFavorites((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type].slice(0, 10);
      localStorage.setItem('repla_tool_favorites', JSON.stringify(next));
      return next;
    });
  }, []);

  // Trading Actions
  const handlePlaceOrder = useCallback(
    (side: OrderSide, size: number, sl?: number, tp?: number) => {
      if (!lastBar) return;
      const order = createMarketOrder(side, lastBar.close, lastBar.time, size, sl, tp);
      setOrders((prev) => [...prev, order]);
      toast.success(`${side.toUpperCase()} order filled @ ${lastBar.close.toFixed(5)}`);
    },
    [lastBar]
  );

  const handlePlacePendingOrder = useCallback((side: OrderSide, price: number, sl?: number, tp?: number) => {
    const order = createLimitOrder(side, price, 1, sl, tp);
    setOrders((prev) => [...prev, order]);
    toast.success(`Pending ${side.toUpperCase()} limit @ ${price.toFixed(5)}`);
  }, []);

  const handleCloseOrder = useCallback(
    (orderId: string) => {
      if (!lastBar) return;
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id === orderId && o.status === 'filled') {
            const entry = o.fillPrice || 0;
            const pnl = o.side === 'buy' ? (lastBar.close - entry) * o.size : (entry - lastBar.close) * o.size;
            const pnlPips = (pnl / (entry > 10 ? 0.01 : 0.0001));
            return {
              ...o,
              status: 'closed' as const,
              closePrice: lastBar.close,
              closeTime: lastBar.time,
              closeReason: 'manual' as const,
              pnl,
              pnlPips,
            };
          }
          return o;
        })
      );
    },
    [lastBar]
  );

  const openOrders = orders
    .filter((o) => o.status === 'filled')
    .map((o) => ({
      id: o.id,
      side: o.side,
      fillPrice: o.fillPrice,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      size: o.size,
      unrealizedPnl:
        o.side === 'buy'
          ? (currentPrice - (o.fillPrice || 0)) * o.size
          : ((o.fillPrice || 0) - currentPrice) * o.size,
    }));

  const stats = calculateStats(orders, startingBalance);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)
        return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleStepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleStepBack();
          break;
        case 'Escape':
          setActiveTool(null);
          break;
        case 'h':
        case 'H':
          setActiveTool('horizontal');
          break;
        case 't':
        case 'T':
          setActiveTool('trendline');
          break;
        case 'f':
        case 'F':
          setActiveTool('fibonacci');
          break;
        case 'r':
        case 'R':
          setActiveTool('ray');
          break;
        case 'b':
        case 'B':
          setActiveTool('brush');
          break;
        case 'l':
          setActiveTool('position_long');
          break;
        case 's':
          setActiveTool('position_short');
          break;
        case 'm':
          setActiveTool('measure');
          break;
        case 'j':
        case 'J':
          setShowJournal((p) => !p);
          break;
        case 'd':
        case 'D':
          setShowDashboard((p) => !p);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePlayPause, handleStepForward, handleStepBack]);

  const handleSaveSettings = async (partial: Partial<ChartSettings>) => {
    const updated = await saveChartSettings(partial);
    setChartSettings(updated);
    toast.success('Chart settings updated');
  };

  return (
    <div className="flex flex-col h-screen w-screen max-w-full overflow-hidden bg-background select-none">
      {/* Top Navbar */}
      <div className="w-full max-w-full flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-card overflow-x-auto no-scrollbar gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <SymbolSwitcher currentSymbol={fileName} onSymbolChange={onSymbolChange} />
          <div className="w-px h-5 bg-border" />

          {/* Session Header Badge with Direct + New Session Button */}
          <SessionHeaderBadge
            session={activeSession}
            onOpenSessionManager={() => setShowSessionModal(true)}
            onOpenCreateSession={() => setShowCreateSession(true)}
          />
          <div className="w-px h-5 bg-border" />

          {/* Timeframe Selector */}
          <TimeframeSelector
            baseTimeframe={baseTimeframe}
            currentTimeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
          />
          <div className="w-px h-5 bg-border" />

          {/* Chart Style */}
          <div className="flex items-center gap-0.5">
            {[
              { style: 'candles' as ChartStyle, icon: <CandlestickChart size={14} />, label: 'Candles' },
              { style: 'bars' as ChartStyle, icon: <BarChart size={14} />, label: 'Bars' },
              { style: 'line' as ChartStyle, icon: <LineChart size={14} />, label: 'Line' },
            ].map(({ style, icon, label }) => (
              <button
                key={style}
                className={`h-8 w-8 flex items-center justify-center rounded-md border text-xs transition-all ${
                  chartSettings.chartStyle === style
                    ? 'bg-primary/20 text-primary border-primary/50 font-bold'
                    : 'bg-secondary/70 hover:bg-primary/10 text-muted-foreground hover:text-foreground border-border'
                }`}
                onClick={() => handleSaveSettings({ chartStyle: style })}
                title={label}
              >
                {icon}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border" />
          <GoToDate bars={filteredTimelineBars} currentBarIndex={currentBarIndex + 1} onSeek={handleSeek} />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Dashboard Button with Live Telemetry Badge */}
          <button
            onClick={() => setShowDashboard(true)}
            className="h-8 px-2.5 rounded-md bg-secondary/80 hover:bg-primary/20 text-foreground hover:text-primary border border-border hover:border-primary/40 flex items-center gap-1.5 text-xs font-semibold transition-all shadow-sm group"
            title="Open Telemetry, Sessions, Trades & Journal Dashboard (D)"
          >
            <Activity size={13} className="text-primary group-hover:scale-110 transition-transform" />
            <span className="font-bold">Dashboard</span>
            {stats.totalTrades > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  stats.totalPnl >= 0 ? 'bg-long/20 text-long' : 'bg-short/20 text-short'
                }`}
              >
                {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(0)}
              </span>
            )}
          </button>

          {/* OHLC readout */}
          {lastBar && (
            <div className="hidden xl:flex items-center gap-2 text-xs font-mono bg-secondary/40 px-2 py-1 rounded border border-border/50">
              <span className="text-muted-foreground">O</span>
              <span className="text-foreground">{lastBar.open.toFixed(4)}</span>
              <span className="text-muted-foreground">H</span>
              <span className="text-foreground">{lastBar.high.toFixed(4)}</span>
              <span className="text-muted-foreground">L</span>
              <span className="text-foreground">{lastBar.low.toFixed(4)}</span>
              <span className="text-muted-foreground">C</span>
              <span className={lastBar.close >= lastBar.open ? 'text-long font-bold' : 'text-short font-bold'}>
                {lastBar.close.toFixed(4)}
              </span>
            </div>
          )}

          <div className="w-px h-5 bg-border hidden lg:block" />
          <div className="hidden lg:block">
            <TimezoneSelector offset={tzOffset} onOffsetChange={setTzOffset} />
          </div>

          {/* Toggle buttons */}
          <div className="flex items-center gap-1">
            <button
              className={`h-8 px-2.5 rounded-md border text-xs gap-1 flex items-center transition-all ${
                showSessions
                  ? 'bg-primary/20 text-primary border-primary/50'
                  : 'bg-secondary/70 hover:bg-primary/10 text-muted-foreground hover:text-foreground border-border'
              }`}
              onClick={() => setShowSessions((p) => !p)}
              title="Toggle Trading Sessions"
            >
              {showSessions ? <Eye size={12} /> : <EyeOff size={12} />}
              <span className="hidden xl:inline">Sessions</span>
            </button>
            <button
              className="h-8 px-2.5 rounded-md border text-xs gap-1 flex items-center bg-secondary/70 hover:bg-primary/10 text-muted-foreground hover:text-foreground border-border transition-all"
              onClick={() => setShowSettingsModal(true)}
              title="Chart Customization"
            >
              <Sliders size={12} />
              <span className="hidden xl:inline">Settings</span>
            </button>
          </div>

          <BalanceSettings />
          <button
            className="h-8 px-2.5 rounded-md bg-secondary/80 hover:bg-primary/20 text-foreground hover:text-primary border border-border text-xs flex items-center gap-1.5 transition-all shadow-sm font-semibold"
            onClick={onReset}
            title="Return to Studio Dashboard Home"
          >
            <LayoutDashboard size={13} className="text-primary" />
            <span className="hidden sm:inline">Dashboard Home</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 min-h-0 min-w-0 w-full flex overflow-hidden relative">
        {/* Chart Canvas & Overlays */}
        <div className="flex-1 min-h-0 min-w-0 relative h-full w-full" style={{ cursor: activeTool ? 'crosshair' : 'default' }}>
          <div ref={containerRef} className="absolute inset-0 w-full h-full" />

          {/* Watermark */}
          {chartSettings.watermarkVisible && (
            <div className="absolute left-16 top-6 pointer-events-none select-none z-0" style={{ opacity: chartSettings.watermarkOpacity ?? 0.10 }}>
              <div className="text-5xl font-black font-mono tracking-tighter text-foreground">{fileName}</div>
              <div className="text-2xl font-bold font-mono text-foreground">{timeframeToLabel(timeframe)}</div>
            </div>
          )}

          {/* Trading Sessions Overlay */}
          <SessionOverlay
            chart={chartRef.current}
            containerRef={containerRef}
            visibleBars={visibleBars}
            showSessions={showSessions}
          />

          {/* Drawing Canvas Overlay */}
          <DrawingOverlay
            chart={chartRef.current}
            series={seriesRef.current}
            activeTool={activeTool}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            containerRef={containerRef}
            onPlacePendingOrder={handlePlacePendingOrder}
            magnetMode={magnetMode}
            lockAllDrawings={lockAllDrawings}
            hideAllDrawings={hideAllDrawings}
            visibleBars={visibleBars}
          />

          {/* TradingView Left Drawing Sidebar */}
          <ChartToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onClearDrawings={() => setDrawings([])}
            drawingCount={drawings.length}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            magnetMode={magnetMode}
            onToggleMagnet={() => setMagnetMode((p) => !p)}
            lockAllDrawings={lockAllDrawings}
            onToggleLockAll={() => setLockAllDrawings((p) => !p)}
            hideAllDrawings={hideAllDrawings}
            onToggleHideAll={() => setHideAllDrawings((p) => !p)}
          />

          {/* Floating Favorites Toolbar */}
          <FavoritesFloatingBar
            favorites={favorites}
            activeTool={activeTool}
            onToolSelect={setActiveTool}
            onRemoveFavorite={handleToggleFavorite}
          />

          {/* Floating Bullet-Shaped Replay Controls */}
          <ReplayControls
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onStepForward={handleStepForward}
            onStepBack={handleStepBack}
            onReset={handleResetReplay}
            intervalMs={intervalMs}
            onIntervalChange={setIntervalMs}
            stepMode={stepMode}
            onStepModeChange={setStepMode}
            stepMinutes={stepMinutes}
            onStepMinutesChange={setStepMinutes}
            currentBar={currentBarIndex + 1}
            totalBars={totalBars}
            currentTime={currentReplayTime}
            onSeek={handleSeek}
          />
        </div>

        {/* Trade Execution Panel */}
        {showTradePanel && (
          <TradePanel
            currentPrice={currentPrice}
            onPlaceOrder={handlePlaceOrder}
            onCloseOrder={handleCloseOrder}
            openOrders={openOrders}
            startingBalance={startingBalance}
          />
        )}

        {/* Trade Journal Modal */}
        {showJournal && (
          <TradeJournal orders={orders} onClose={() => setShowJournal(false)} startingBalance={startingBalance} />
        )}
      </div>

      {/* Dedicated Telemetry, Sessions, Trades & Journal Dashboard */}
      <DashboardModal
        open={showDashboard}
        onClose={() => setShowDashboard(false)}
        dataset={dataset}
        currentBars={rawBars}
        activeSession={activeSession}
        orders={orders}
        currentPrice={currentPrice}
        startingBalance={startingBalance}
        onSelectSession={(sess) => {
          setActiveSession(sess);
          setDrawings(sess.drawings || []);
          setOrders(sess.orders || []);
          setTimeframe(sess.timeframe || baseTimeframe);
          setCurrentReplayTime(sess.currentTimestamp || rawBars[0]?.time || Math.floor(Date.now() / 1000));
        }}
        onOpenCreateSession={() => setShowCreateSession(true)}
        onCloseOrder={handleCloseOrder}
      />

      {/* Direct Create Session Modal */}
      <CreateSessionModal
        open={showCreateSession}
        onClose={() => setShowCreateSession(false)}
        dataset={dataset}
        currentBars={rawBars}
        defaultBalance={startingBalance}
        onSessionCreated={(sess) => {
          setActiveSession(sess);
          setDrawings(sess.drawings || []);
          setOrders(sess.orders || []);
          setTimeframe(sess.timeframe || baseTimeframe);
          setCurrentReplayTime(sess.currentTimestamp || rawBars[0]?.time || Math.floor(Date.now() / 1000));
        }}
      />

      {/* Session Manager & Data Times Modal */}
      <SessionManagerModal
        open={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        dataset={dataset}
        currentBars={rawBars}
        activeSession={activeSession}
        onSelectSession={(sess) => {
          setActiveSession(sess);
          setDrawings(sess.drawings || []);
          setOrders(sess.orders || []);
          setTimeframe(sess.timeframe || baseTimeframe);
          setCurrentReplayTime(sess.currentTimestamp || rawBars[0]?.time || Math.floor(Date.now() / 1000));
        }}
      />

      {/* Chart Customization Settings Modal */}
      <ChartSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={chartSettings}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
}
