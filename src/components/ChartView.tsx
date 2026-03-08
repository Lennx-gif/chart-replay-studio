import { useEffect, useRef, useCallback, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType } from 'lightweight-charts';
import type { OHLCVBar } from '@/lib/csvParser';
import { resampleBars, applyTimezoneOffset, detectBaseTimeframe } from '@/lib/csvParser';
import type { Drawing, DrawingType } from '@/lib/drawings';
import type { Order, OrderSide } from '@/lib/tradeEngine';
import { createMarketOrder, processBar, calculateStats } from '@/lib/tradeEngine';
import { saveProject, generateProjectId, type SavedProject } from '@/lib/projectStorage';
import { ChartToolbar } from './ChartToolbar';
import { ReplayControls } from './ReplayControls';
import { TimeframeSelector } from './TimeframeSelector';
import { TimezoneSelector } from './TimezoneSelector';
import { DrawingOverlay } from './DrawingOverlay';
import { ProjectManager } from './ProjectManager';
import { TradePanel } from './TradePanel';
import { TradeJournal } from './TradeJournal';
import { GoToDate } from './GoToDate';
import { SessionOverlay } from './SessionOverlay';
import { BalanceSettings } from './BalanceSettings';
import { SymbolSwitcher } from './SymbolSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { Globe, BarChart3, BookOpen, Columns, Eye, EyeOff, CandlestickChart, LineChart, BarChart } from 'lucide-react';
import { toast } from 'sonner';

export type ChartStyle = 'candles' | 'line' | 'bars' | 'area';

interface ChartViewProps {
  rawBars: OHLCVBar[];
  fileName: string;
  csvText: string;
  loadedProject: SavedProject | null;
  onLoadProject: (project: SavedProject) => void;
  onSymbolChange: (symbol: string, timeframe: string) => void;
  onReset: () => void;
}

// Mini chart component for multi-timeframe
function MiniChart({ bars, timeframe, label }: { bars: OHLCVBar[]; timeframe: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#1a1510' }, textColor: '#a0855c', fontSize: 9 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderColor: '#2a2218', scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: '#2a2218', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: '#c47d2e', width: 1, style: 2 }, horzLine: { color: '#c47d2e', width: 1, style: 2 } },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#4caf50', downColor: '#e05347',
      borderDownColor: '#e05347', borderUpColor: '#4caf50',
      wickDownColor: '#e05347', wickUpColor: '#4caf50',
    });
    series.setData(bars.map(b => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close })));
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [bars]);

  // Update data when bars change
  useEffect(() => {
    if (!chartRef.current) return;
    const series = chartRef.current.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350',
      borderDownColor: '#ef5350', borderUpColor: '#26a69a',
      wickDownColor: '#ef5350', wickUpColor: '#26a69a',
    });
    series.setData(bars.map(b => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close })));
  }, [bars]);

  return (
    <div className="flex flex-col border border-border rounded overflow-hidden">
      <div className="px-2 py-1 bg-card border-b border-border text-[10px] font-mono text-muted-foreground">{label}</div>
      <div ref={containerRef} className="flex-1 min-h-[150px]" />
    </div>
  );
}

export function ChartView({ rawBars, fileName, csvText, loadedProject, onLoadProject, onSymbolChange, onReset }: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [projectId, setProjectId] = useState(loadedProject?.id || generateProjectId());
  const [projectName, setProjectName] = useState(loadedProject?.name || fileName);
  const { profile } = useAuth();
  const startingBalance = profile?.starting_balance || 10000;

  const baseTimeframe = detectBaseTimeframe(rawBars);
  const [timeframe, setTimeframe] = useState(loadedProject?.timeframe || baseTimeframe);
  const [tzOffset, setTzOffset] = useState(loadedProject?.tzOffset || 0);
  const [currentBarIndex, setCurrentBarIndex] = useState(loadedProject?.currentBarIndex || 50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(loadedProject?.speed || 1);
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>(loadedProject?.drawings || []);
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');

  // Trading state
  const [orders, setOrders] = useState<Order[]>([]);
  const [showTradePanel, setShowTradePanel] = useState(true);
  const [showJournal, setShowJournal] = useState(false);
  const [showMultiChart, setShowMultiChart] = useState(false);
  const [showSessions, setShowSessions] = useState(false);

  const handleSaveProject = useCallback(async (name: string) => {
    setProjectName(name);
    try {
      await saveProject({
        id: projectId,
        name,
        savedAt: Date.now(),
        fileName,
        timeframe,
        tzOffset,
        currentBarIndex,
        speed,
        drawings,
        csvData: csvText,
      });
    } catch (err: any) {
      toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    }
  }, [projectId, fileName, timeframe, tzOffset, currentBarIndex, speed, drawings, csvText]);

  // Compute displayed bars
  const allBars = applyTimezoneOffset(
    timeframe === baseTimeframe ? rawBars : resampleBars(rawBars, timeframe),
    tzOffset
  );
  const totalBars = allBars.length;
  const visibleBars = allBars.slice(0, Math.min(currentBarIndex, totalBars));

  // Multi-timeframe bars
  const multiTFBars = showMultiChart ? {
    tf1: applyTimezoneOffset(resampleBars(rawBars, Math.max(baseTimeframe, 15)), tzOffset).slice(0, Math.min(currentBarIndex * 3, allBars.length)),
    tf2: applyTimezoneOffset(resampleBars(rawBars, Math.max(baseTimeframe * 4, 60)), tzOffset).slice(0, Math.min(currentBarIndex, allBars.length)),
    tf3: applyTimezoneOffset(resampleBars(rawBars, Math.max(baseTimeframe * 16, 240)), tzOffset).slice(0, Math.min(currentBarIndex, allBars.length)),
  } : null;

  const lastBar = visibleBars[visibleBars.length - 1];
  const currentPrice = lastBar?.close || 0;

  // Process orders each bar update
  useEffect(() => {
    if (!lastBar || orders.length === 0) return;
    const updated = processBar(lastBar, orders);
    // Check if any order status changed
    const changed = updated.some((o, i) => o.status !== orders[i].status);
    if (changed) {
      setOrders(updated);
      // Notify on fills/closes
      updated.forEach((o, i) => {
        if (o.status !== orders[i].status) {
          if (o.status === 'closed') {
            const pnlStr = (o.pnl || 0) >= 0 ? `+${(o.pnl || 0).toFixed(2)}` : (o.pnl || 0).toFixed(2);
            toast[o.closeReason === 'tp' ? 'success' : 'error'](
              `${o.side.toUpperCase()} closed by ${o.closeReason?.toUpperCase()}: ${pnlStr}`
            );
          }
        }
      });
    }
  }, [lastBar?.time]);

  // Place order
  const handlePlaceOrder = useCallback((side: OrderSide, size: number, sl?: number, tp?: number) => {
    if (!lastBar) return;
    const order = createMarketOrder(side, lastBar.close, lastBar.time, size, sl, tp);
    setOrders(prev => [...prev, order]);
    toast.success(`${side.toUpperCase()} order placed @ ${lastBar.close.toFixed(5)}`);
  }, [lastBar]);

  // Close order manually
  const handleCloseOrder = useCallback((orderId: string) => {
    if (!lastBar) return;
    setOrders(prev => prev.map(o => {
      if (o.id === orderId && o.status === 'filled') {
        const entry = o.fillPrice || 0;
        const pnl = o.side === 'buy'
          ? (lastBar.close - entry) * o.size
          : (entry - lastBar.close) * o.size;
        const pnlPips = o.side === 'buy'
          ? (lastBar.close - entry) * 10000
          : (entry - lastBar.close) * 10000;
        return { ...o, status: 'closed' as const, closePrice: lastBar.close, closeTime: lastBar.time, closeReason: 'manual' as const, pnl, pnlPips };
      }
      return o;
    }));
  }, [lastBar]);

  // Open orders with unrealized P&L
  const openOrders = orders
    .filter(o => o.status === 'filled')
    .map(o => ({
      id: o.id,
      side: o.side,
      fillPrice: o.fillPrice,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      size: o.size,
      unrealizedPnl: o.side === 'buy'
        ? (currentPrice - (o.fillPrice || 0)) * o.size
        : ((o.fillPrice || 0) - currentPrice) * o.size,
    }));

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1510' },
        textColor: '#a0855c',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        vertLine: { color: '#c47d2e', width: 1, style: 2, labelBackgroundColor: '#8b5e14' },
        horzLine: { color: '#c47d2e', width: 1, style: 2, labelBackgroundColor: '#8b5e14' },
      },
      rightPriceScale: { borderColor: '#2a2218', scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderColor: '#2a2218', timeVisible: true, secondsVisible: false },
    });

    let mainSeries: ISeriesApi<any>;
    if (chartStyle === 'line') {
      mainSeries = chart.addLineSeries({ color: '#d4a54a', lineWidth: 2 });
    } else if (chartStyle === 'area') {
      mainSeries = chart.addAreaSeries({
        topColor: 'rgba(212, 165, 74, 0.35)', bottomColor: 'rgba(212, 165, 74, 0.0)',
        lineColor: '#d4a54a', lineWidth: 2,
      });
    } else if (chartStyle === 'bars') {
      mainSeries = chart.addBarSeries({
        upColor: '#4caf50', downColor: '#e05347',
      });
    } else {
      mainSeries = chart.addCandlestickSeries({
        upColor: '#4caf50', downColor: '#e05347',
        borderDownColor: '#e05347', borderUpColor: '#4caf50',
        wickDownColor: '#e05347', wickUpColor: '#4caf50',
      });
    }

    const volumeSeries = chart.addHistogramSeries({
      color: '#d4a54a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => { window.removeEventListener('resize', handleResize); chart.remove(); chartRef.current = null; };
  }, [chartStyle]);

  // Update series data
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;
    const isOHLC = chartStyle === 'candles' || chartStyle === 'bars';
    if (isOHLC) {
      seriesRef.current.setData(visibleBars.map(b => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close })));
    } else {
      seriesRef.current.setData(visibleBars.map(b => ({ time: b.time as any, value: b.close })));
    }
    volumeSeriesRef.current.setData(visibleBars.map(b => ({
      time: b.time as any, value: b.volume,
      color: b.close >= b.open ? 'rgba(76, 175, 80, 0.25)' : 'rgba(224, 83, 71, 0.25)',
    })));

    // Add markers for open orders (entry lines via price lines)
    // We'll handle this via the canvas overlay approach in DrawingOverlay
  }, [visibleBars]);

  // Playback
  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (isPlaying && currentBarIndex < totalBars) {
      const ms = Math.max(50, 800 / speed);
      intervalRef.current = setInterval(() => {
        setCurrentBarIndex(prev => {
          if (prev >= totalBars) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, ms);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, totalBars, currentBarIndex]);

  const handlePlayPause = useCallback(() => {
    if (currentBarIndex >= totalBars) { setCurrentBarIndex(50); setIsPlaying(true); }
    else setIsPlaying(p => !p);
  }, [currentBarIndex, totalBars]);

  const handleResetReplay = useCallback(() => {
    setIsPlaying(false);
    setCurrentBarIndex(Math.min(50, totalBars));
  }, [totalBars]);

  const handleSeek = useCallback((bar: number) => setCurrentBarIndex(bar), []);

  const handleTimeframeChange = useCallback((tf: number) => {
    setTimeframe(tf);
    setCurrentBarIndex(50);
    setIsPlaying(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case ' ': e.preventDefault(); handlePlayPause(); break;
        case 'ArrowRight': e.preventDefault(); setCurrentBarIndex(prev => Math.min(prev + 1, totalBars)); break;
        case 'ArrowLeft': e.preventDefault(); setCurrentBarIndex(prev => Math.max(prev - 1, 1)); break;
        case 'Escape': setActiveTool(null); break;
        case 'h': case 'H': setActiveTool('horizontal'); break;
        case 't': case 'T': setActiveTool('trendline'); break;
        case 'f': case 'F': setActiveTool('fibonacci'); break;
        case 'j': case 'J': setShowJournal(p => !p); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePlayPause, totalBars]);

  const stats = calculateStats(orders, startingBalance);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <SymbolSwitcher currentSymbol={fileName} onSymbolChange={onSymbolChange} />
          <div className="w-px h-5 bg-border" />
          {/* Chart style selector */}
          <div className="flex items-center gap-0.5">
            {([
              { style: 'candles' as ChartStyle, icon: <CandlestickChart size={14} />, label: 'Candles' },
              { style: 'bars' as ChartStyle, icon: <BarChart size={14} />, label: 'Bars' },
              { style: 'line' as ChartStyle, icon: <LineChart size={14} />, label: 'Line' },
              { style: 'area' as ChartStyle, icon: <LineChart size={14} />, label: 'Area' },
            ]).map(({ style, icon, label }) => (
              <button
                key={style}
                className={`toolbar-btn text-xs gap-1 ${chartStyle === style ? 'toolbar-btn-active' : ''}`}
                onClick={() => setChartStyle(style)}
                title={label}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border" />
          <TimeframeSelector baseTimeframe={baseTimeframe} currentTimeframe={timeframe} onTimeframeChange={handleTimeframeChange} />
          <div className="w-px h-5 bg-border" />
          <GoToDate bars={allBars} currentBarIndex={currentBarIndex} onSeek={handleSeek} />
        </div>

        <div className="flex items-center gap-3">
          {/* Live stats strip */}
          {stats.totalTrades > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className={stats.totalPnl >= 0 ? 'text-long' : 'text-short'}>
                P&L: {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(2)}
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">WR: {stats.winRate.toFixed(0)}%</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">Trades: {stats.totalTrades}</span>
            </div>
          )}

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

          {/* Toggle buttons */}
          <div className="flex items-center gap-1">
            <button
              className={`toolbar-btn text-xs gap-1 ${showSessions ? 'toolbar-btn-active' : ''}`}
              onClick={() => setShowSessions(p => !p)}
              title="Toggle sessions"
            >
              {showSessions ? <Eye size={12} /> : <EyeOff size={12} />}
              <span className="hidden lg:inline">Sessions</span>
            </button>
            <button
              className={`toolbar-btn text-xs gap-1 ${showMultiChart ? 'toolbar-btn-active' : ''}`}
              onClick={() => setShowMultiChart(p => !p)}
              title="Multi-timeframe"
            >
              <Columns size={12} />
              <span className="hidden lg:inline">Multi-TF</span>
            </button>
            <button
              className={`toolbar-btn text-xs gap-1 ${showJournal ? 'toolbar-btn-active' : ''}`}
              onClick={() => setShowJournal(p => !p)}
              title="Trade journal (J)"
            >
              <BookOpen size={12} />
              <span className="hidden lg:inline">Journal</span>
            </button>
          </div>

          <BalanceSettings />
          <ProjectManager onSave={handleSaveProject} onLoad={onLoadProject} currentProjectName={projectName} />
          <button className="toolbar-btn text-xs" onClick={onReset}>New File</button>
        </div>
      </div>

      {/* Drawing toolbar */}
      <ChartToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onClearDrawings={() => setDrawings([])}
        drawingCount={drawings.length}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Multi-TF side panel */}
        {showMultiChart && multiTFBars && (
          <div className="w-64 border-r border-border flex flex-col gap-0 overflow-y-auto bg-background">
            <MiniChart bars={multiTFBars.tf1} timeframe={Math.max(baseTimeframe, 15)} label={`${Math.max(baseTimeframe, 15)}m`} />
            <MiniChart bars={multiTFBars.tf2} timeframe={Math.max(baseTimeframe * 4, 60)} label={`${Math.max(baseTimeframe * 4, 60) >= 60 ? Math.max(baseTimeframe * 4, 60) / 60 + 'H' : Math.max(baseTimeframe * 4, 60) + 'm'}`} />
            <MiniChart bars={multiTFBars.tf3} timeframe={Math.max(baseTimeframe * 16, 240)} label={`${Math.max(baseTimeframe * 16, 240) / 60}H`} />
          </div>
        )}

        {/* Chart area */}
        <div className="flex-1 relative" style={{ cursor: activeTool ? 'crosshair' : 'default' }}>
          <div ref={containerRef} className="absolute inset-0" />
          <SessionOverlay chart={chartRef.current} containerRef={containerRef} visibleBars={visibleBars} showSessions={showSessions} />
          <DrawingOverlay
            chart={chartRef.current}
            series={seriesRef.current}
            activeTool={activeTool}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            containerRef={containerRef}
          />
        </div>

        {/* Trade panel */}
        {showTradePanel && (
          <TradePanel
            currentPrice={currentPrice}
            onPlaceOrder={handlePlaceOrder}
            onCloseOrder={handleCloseOrder}
            openOrders={openOrders}
            startingBalance={startingBalance}
          />
        )}

        {/* Journal overlay */}
        {showJournal && (
          <TradeJournal orders={orders} onClose={() => setShowJournal(false)} startingBalance={startingBalance} />
        )}
      </div>

      {/* Replay controls */}
      <ReplayControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onStepForward={() => setCurrentBarIndex(prev => Math.min(prev + 1, totalBars))}
        onStepBack={() => setCurrentBarIndex(prev => Math.max(prev - 1, 1))}
        onReset={handleResetReplay}
        speed={speed}
        onSpeedChange={setSpeed}
        currentBar={currentBarIndex}
        totalBars={totalBars}
        onSeek={handleSeek}
      />
    </div>
  );
}
