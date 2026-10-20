import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  createChart, ColorType, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type Time,
} from 'lightweight-charts';
import { detectBaseTimeframe, type OHLCVBar } from '@/lib/csvParser';
import type { Drawing, DrawingType } from '@/lib/drawings';
import type { ChartStyle, SessionRecord } from '@/lib/db';
import { calculateStats } from '@/lib/tradeEngine';
import { SPEEDS, buildTimeframeIndex, detectPricePrecision, visibleCandles } from '@/lib/replay';
import { useReplayEngine } from '@/hooks/useReplayEngine';
import { useSessionAutosave } from '@/hooks/useSessionAutosave';
import { ChartToolbar } from './ChartToolbar';
import { ReplayControls } from './ReplayControls';
import { BookmarksMenu } from './BookmarksMenu';
import { TimeframeSelector } from './TimeframeSelector';
import { TimezoneSelector } from './TimezoneSelector';
import { DrawingOverlay } from './DrawingOverlay';
import { SessionBar } from './SessionBar';
import { TradePanel } from './TradePanel';
import { TradeJournal } from './TradeJournal';
import { GoToDate } from './GoToDate';
import { SessionOverlay } from './SessionOverlay';
import { BalanceSettings } from './BalanceSettings';
import { Globe, BarChart3, BookOpen, Columns, Eye, EyeOff, CandlestickChart, LineChart, BarChart } from 'lucide-react';

interface ChartViewProps {
  session: SessionRecord;
  rawBars: OHLCVBar[];
  onExit: () => void;
}

const HIGHER_TFS = [15, 60, 240, 1440, 10080];

const tfLabel = (m: number) => (m >= 10080 ? `${m / 10080}W` : m >= 1440 ? `${m / 1440}D` : m >= 60 ? `${m / 60}H` : `${m}m`);
const fmtPrice = (p: number) => (p > 10 ? p.toFixed(2) : p.toFixed(5));
const shift = (bars: OHLCVBar[], tzOffset: number): OHLCVBar[] =>
  tzOffset === 0 ? bars : bars.map((b) => ({ ...b, time: b.time + tzOffset * 3600 }));

/** A higher-timeframe chart built only from bars revealed so far — nothing from the future. */
function MiniChart({ raw, minutes, position, tzOffset }: { raw: OHLCVBar[]; minutes: number; position: number; tzOffset: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const index = useMemo(() => buildTimeframeIndex(raw, minutes), [raw, minutes]);
  const bars = useMemo(() => shift(visibleCandles(raw, index, position), tzOffset), [raw, index, position, tzOffset]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#1a1510' }, textColor: '#a0855c', fontSize: 9 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#2a221830' } },
      rightPriceScale: { borderColor: '#2a2218', scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: '#2a2218', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: '#c47d2e', width: 1, style: 2 }, horzLine: { color: '#c47d2e', width: 1, style: 2 } },
    });
    seriesRef.current = chart.addCandlestickSeries({
      upColor: '#4caf50', downColor: '#e05347',
      borderDownColor: '#e05347', borderUpColor: '#4caf50',
      wickDownColor: '#e05347', wickUpColor: '#4caf50',
    });
    chartRef.current = chart;
    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    seriesRef.current.setData(bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    chartRef.current.timeScale().scrollToPosition(-2, false);
  }, [bars]);

  const last = bars[bars.length - 1];
  return (
    <div className="flex flex-col border-b border-border overflow-hidden flex-1">
      <div className="px-2 py-1 bg-card border-b border-border flex items-center justify-between">
        <span className="text-[10px] font-mono text-primary font-semibold">{tfLabel(minutes)}</span>
        {last && (
          <span className={`text-[9px] font-mono ${last.close >= last.open ? 'text-long' : 'text-short'}`}>{fmtPrice(last.close)}</span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-[140px]" />
    </div>
  );
}

export function ChartView({ session, rawBars, onExit }: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  // The main series type varies with the chart style (candles/bars/line/area).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<any> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  /** What the series currently holds, so playback can append instead of resetting. */
  const rendered = useRef<{ len: number; first: number } | null>(null);
  /** True once the chart is removed; touching its series afterwards queues a repaint on a dead canvas. */
  const chartDisposed = useRef(true);

  const engine = useReplayEngine(rawBars, session);
  const {
    position, total, candles, orders, timeframe, stepUnit, speed, isPlaying, pauseOnTradeEvents, bookmarks, startPosition,
  } = engine;

  const [name, setName] = useState(session.name);
  const [notes, setNotes] = useState(session.notes);
  const [tzOffset, setTzOffset] = useState(session.tzOffset);
  const [chartStyle, setChartStyle] = useState<ChartStyle>(session.chartStyle);
  const [startingBalance, setStartingBalance] = useState(session.startingBalance);
  const [drawings, setDrawings] = useState<Drawing[]>(session.drawings);
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const [favorites, setFavorites] = useState<(DrawingType | null)[]>(() => {
    try {
      const stored = localStorage.getItem('repla_tool_favorites');
      return stored ? JSON.parse(stored) : ['trendline', 'horizontal', 'fibonacci'];
    } catch { return ['trendline', 'horizontal', 'fibonacci']; }
  });
  const [showJournal, setShowJournal] = useState(false);
  const [showMultiChart, setShowMultiChart] = useState(false);
  const [showSessions, setShowSessions] = useState(false);

  const baseTimeframe = useMemo(() => detectBaseTimeframe(rawBars), [rawBars]);
  const precision = useMemo(() => detectPricePrecision(rawBars), [rawBars]);

  // ------------------------------------------------------------ derived data
  const lastRaw = rawBars[position - 1];
  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastRaw?.close ?? 0;
  const stats = useMemo(() => calculateStats(orders, startingBalance), [orders, startingBalance]);
  const displayCandles = useMemo(() => shift(candles, tzOffset), [candles, tzOffset]);

  const openOrders = orders.filter((o) => o.status === 'filled').map((o) => ({
    id: o.id, side: o.side, fillPrice: o.fillPrice, stopLoss: o.stopLoss, takeProfit: o.takeProfit, size: o.size,
    unrealizedPnl: (o.side === 'buy' ? currentPrice - (o.fillPrice || 0) : (o.fillPrice || 0) - currentPrice) * o.size,
  }));
  const pendingOrders = orders.filter((o) => o.status === 'pending');

  // ---------------------------------------------------------------- autosave
  const { status: saveStatus, saveNow } = useSessionAutosave(session.id, {
    name, notes, position, startPosition, speed, stepUnit, timeframe, tzOffset, chartStyle, pauseOnTradeEvents,
    bookmarks, startingBalance, orders, drawings, totalBars: total, closedTrades: stats.totalTrades, realizedPnl: stats.totalPnl,
  });

  // ------------------------------------------------------------------- chart
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

    const priceFormat = { type: 'price' as const, precision, minMove: 1 / 10 ** precision };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let main: ISeriesApi<any>;
    if (chartStyle === 'line') {
      main = chart.addLineSeries({ color: '#d4a54a', lineWidth: 2, priceFormat });
    } else if (chartStyle === 'area') {
      main = chart.addAreaSeries({ topColor: 'rgba(212, 165, 74, 0.35)', bottomColor: 'rgba(212, 165, 74, 0.0)', lineColor: '#d4a54a', lineWidth: 2, priceFormat });
    } else if (chartStyle === 'bars') {
      main = chart.addBarSeries({ upColor: '#4caf50', downColor: '#e05347', priceFormat });
    } else {
      main = chart.addCandlestickSeries({
        upColor: '#4caf50', downColor: '#e05347',
        borderDownColor: '#e05347', borderUpColor: '#4caf50',
        wickDownColor: '#e05347', wickUpColor: '#4caf50', priceFormat,
      });
    }

    const volume = chart.addHistogramSeries({ color: '#d4a54a', priceFormat: { type: 'volume' }, priceScaleId: '' });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    volumeRef.current = volume;
    rendered.current = null; // fresh series: force a full setData
    chartDisposed.current = false;
    setChartApi(chart);
    setSeriesApi(main);

    const onResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chartDisposed.current = true;
      chart.remove();
      volumeRef.current = null;
      setChartApi(null);
      setSeriesApi(null);
    };
  }, [chartStyle, precision]);

  // Push candles to the chart. During playback only the newest candle changes,
  // so append/replace it instead of re-sending the whole history.
  useEffect(() => {
    const series = seriesApi;
    const volume = volumeRef.current;
    if (!series || !volume || !chartApi) return;
    const isOHLC = chartStyle === 'candles' || chartStyle === 'bars';
    const toPoint = (b: OHLCVBar) => (isOHLC
      ? { time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close }
      : { time: b.time as Time, value: b.close });
    const toVolume = (b: OHLCVBar) => ({
      time: b.time as Time, value: b.volume,
      color: b.close >= b.open ? 'rgba(76, 175, 80, 0.25)' : 'rgba(224, 83, 71, 0.25)',
    });

    const prev = rendered.current;
    const len = displayCandles.length;
    const first = displayCandles[0]?.time ?? 0;
    const last = displayCandles[len - 1];

    if (prev && len > 0 && prev.first === first && (len === prev.len || len === prev.len + 1)) {
      series.update(toPoint(last));
      volume.update(toVolume(last));
    } else {
      series.setData(displayCandles.map(toPoint));
      volume.setData(displayCandles.map(toVolume));
      const range = chartApi.timeScale().getVisibleLogicalRange();
      if (len > 0 && (!range || range.to < len - 1 || range.from > len - 1)) chartApi.timeScale().scrollToPosition(8, false);
    }
    rendered.current = { len, first };
  }, [displayCandles, chartStyle, seriesApi, chartApi]);

  // Trade markers (entries and exits) on the main series.
  const lastDisplayTime = displayCandles[displayCandles.length - 1]?.time;
  useEffect(() => {
    if (!seriesApi) return;
    const secs = Math.max(1, Math.round(timeframe * 60));
    const toCandleTime = (t: number) => (Math.floor(t / secs) * secs + tzOffset * 3600) as Time;
    const markers: SeriesMarker<Time>[] = [];
    for (const o of orders) {
      if (o.fillTime != null && (o.status === 'filled' || o.status === 'closed')) {
        markers.push({
          time: toCandleTime(o.fillTime), position: o.side === 'buy' ? 'belowBar' : 'aboveBar',
          color: o.side === 'buy' ? '#4caf50' : '#e05347', shape: o.side === 'buy' ? 'arrowUp' : 'arrowDown',
          text: o.side === 'buy' ? 'B' : 'S',
        });
      }
      if (o.status === 'closed' && o.closeTime != null) {
        const pnl = o.pnl ?? 0;
        markers.push({
          time: toCandleTime(o.closeTime), position: o.side === 'buy' ? 'aboveBar' : 'belowBar',
          color: pnl >= 0 ? '#4caf50' : '#e05347', shape: 'circle',
          text: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`,
        });
      }
    }
    const visible = markers.filter((m) => lastDisplayTime == null || (m.time as number) <= lastDisplayTime).sort((a, b) => (a.time as number) - (b.time as number));
    seriesApi.setMarkers(visible);
  }, [orders, seriesApi, timeframe, tzOffset, lastDisplayTime]);

  // Entry / SL / TP price lines for live orders.
  useEffect(() => {
    if (!seriesApi) return;
    const lines: IPriceLine[] = [];
    const add = (price: number | undefined, color: string, title: string, style: LineStyle = LineStyle.Dashed) => {
      if (price == null) return;
      lines.push(seriesApi.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    };
    for (const o of orders) {
      if (o.status === 'filled') {
        add(o.fillPrice, '#a0855c', `${o.side === 'buy' ? '▲' : '▼'} ${o.size}`);
        add(o.stopLoss, '#e05347', 'SL');
        add(o.takeProfit, '#4caf50', 'TP');
      } else if (o.status === 'pending') {
        add(o.limitPrice, '#5b9bd5', `${o.side.toUpperCase()} LMT`, LineStyle.Dotted);
        add(o.stopLoss, '#e05347', 'SL', LineStyle.Dotted);
        add(o.takeProfit, '#4caf50', 'TP', LineStyle.Dotted);
      }
    }
    return () => {
      if (chartDisposed.current) return; // the chart (and its lines) are already gone
      lines.forEach((l) => seriesApi.removePriceLine(l));
    };
  }, [orders, seriesApi]);

  // --------------------------------------------------------------- shortcuts
  const handleToggleFavorite = useCallback((type: DrawingType | null) => {
    setFavorites((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type].slice(0, 8);
      try { localStorage.setItem('repla_tool_favorites', JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const changeSpeed = useCallback((dir: 1 | -1) => {
    const i = SPEEDS.findIndex((s) => s >= speed);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i === -1 ? SPEEDS.length - 1 : i) + dir))];
    engine.setSpeed(next);
  }, [speed, engine]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const amount = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case ' ': e.preventDefault(); engine.togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); engine.step(amount); break;
        case 'ArrowLeft': e.preventDefault(); engine.step(-amount); break;
        case 'Home': e.preventDefault(); engine.restart(); break;
        case 'End': e.preventDefault(); engine.seek(total); break;
        case '+': case '=': changeSpeed(1); break;
        case '-': case '_': changeSpeed(-1); break;
        case 'k': case 'K': engine.addBookmark(); break;
        case ']': engine.jumpBookmark(1); break;
        case '[': engine.jumpBookmark(-1); break;
        case 'Escape': setActiveTool(null); break;
        case 'h': case 'H': setActiveTool('horizontal'); break;
        case 't': case 'T': setActiveTool('trendline'); break;
        case 'f': case 'F': setActiveTool('fibonacci'); break;
        case 'r': case 'R': setActiveTool('ray'); break;
        case 'v': setActiveTool('vertical'); break;
        case 'b': case 'B': setActiveTool('brush'); break;
        case 'l': setActiveTool('position_long'); break;
        case 's': setActiveTool('position_short'); break;
        case 'm': setActiveTool('measure'); break;
        case 'j': case 'J': setShowJournal((p) => !p); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engine, total, changeSpeed]);

  // Multi-timeframe sidebar: the next three timeframes above the one on the chart.
  const multiTFs = useMemo(() => {
    const above = HIGHER_TFS.filter((m) => m > timeframe && m >= baseTimeframe);
    return (above.length >= 3 ? above : HIGHER_TFS.filter((m) => m >= baseTimeframe)).slice(0, 3);
  }, [timeframe, baseTimeframe]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card gap-x-3 gap-y-2 flex-wrap">
        <div className="flex items-center gap-3">
          <SessionBar
            name={name}
            onNameChange={setName}
            symbol={session.symbol}
            saveStatus={saveStatus}
            notes={notes}
            onNotesChange={setNotes}
            onBack={async () => { await saveNow(); onExit(); }}
          />
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-0.5">
            {([
              { style: 'candles' as ChartStyle, icon: <CandlestickChart size={14} />, label: 'Candles' },
              { style: 'bars' as ChartStyle, icon: <BarChart size={14} />, label: 'Bars' },
              { style: 'line' as ChartStyle, icon: <LineChart size={14} />, label: 'Line' },
              { style: 'area' as ChartStyle, icon: <BarChart3 size={14} />, label: 'Area' },
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
          <TimeframeSelector baseTimeframe={baseTimeframe} currentTimeframe={timeframe} onTimeframeChange={engine.setTimeframe} />
          <div className="w-px h-5 bg-border" />
          <GoToDate raw={rawBars} position={position} tzOffset={tzOffset} onSeek={engine.seek} onSeekTime={engine.seekToTime} />
        </div>

        <div className="flex items-center gap-3">
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

          {lastCandle && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-muted-foreground">O</span><span className="text-foreground">{lastCandle.open.toFixed(precision)}</span>
              <span className="text-muted-foreground">H</span><span className="text-foreground">{lastCandle.high.toFixed(precision)}</span>
              <span className="text-muted-foreground">L</span><span className="text-foreground">{lastCandle.low.toFixed(precision)}</span>
              <span className="text-muted-foreground">C</span>
              <span className={lastCandle.close >= lastCandle.open ? 'text-long' : 'text-short'}>{lastCandle.close.toFixed(precision)}</span>
            </div>
          )}
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5">
            <Globe size={13} className="text-muted-foreground" />
            <TimezoneSelector offset={tzOffset} onOffsetChange={setTzOffset} />
          </div>

          <div className="flex items-center gap-1">
            <button className={`toolbar-btn text-xs gap-1 ${showSessions ? 'toolbar-btn-active' : ''}`} onClick={() => setShowSessions((p) => !p)} title="Toggle market sessions">
              {showSessions ? <Eye size={12} /> : <EyeOff size={12} />}
              <span className="hidden lg:inline">Sessions</span>
            </button>
            <button className={`toolbar-btn text-xs gap-1 ${showMultiChart ? 'toolbar-btn-active' : ''}`} onClick={() => setShowMultiChart((p) => !p)} title="Multi-timeframe">
              <Columns size={12} />
              <span className="hidden lg:inline">Multi-TF</span>
            </button>
            <button className={`toolbar-btn text-xs gap-1 ${showJournal ? 'toolbar-btn-active' : ''}`} onClick={() => setShowJournal((p) => !p)} title="Trade journal (J)">
              <BookOpen size={12} />
              <span className="hidden lg:inline">Journal</span>
            </button>
          </div>

          <BalanceSettings balance={startingBalance} onBalanceChange={setStartingBalance} />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {showMultiChart && (
          <div className="w-72 border-r border-border flex flex-col overflow-hidden bg-background">
            {multiTFs.map((m) => (
              <MiniChart key={m} raw={rawBars} minutes={m} position={position} tzOffset={tzOffset} />
            ))}
          </div>
        )}

        <div className="flex-1 relative" style={{ cursor: activeTool ? 'crosshair' : 'default' }}>
          <div ref={containerRef} className="absolute inset-0" />
          <SessionOverlay chart={chartApi} containerRef={containerRef} visibleBars={displayCandles} showSessions={showSessions} />
          <DrawingOverlay
            chart={chartApi}
            series={seriesApi}
            activeTool={activeTool}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            containerRef={containerRef}
            onPlacePendingOrder={(side, price, sl, tp) => engine.placePending(side, price, sl, tp)}
          />
          <ChartToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onClearDrawings={() => setDrawings([])}
            drawingCount={drawings.length}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        </div>

        <TradePanel
          currentPrice={currentPrice}
          onPlaceOrder={engine.placeMarket}
          onCloseOrder={engine.closeOrder}
          onCloseAll={engine.closeAll}
          onCancelOrder={engine.cancelOrder}
          openOrders={openOrders}
          pendingOrders={pendingOrders}
          startingBalance={startingBalance}
        />

        {showJournal && <TradeJournal orders={orders} onClose={() => setShowJournal(false)} startingBalance={startingBalance} />}
      </div>

      <ReplayControls
        isPlaying={isPlaying}
        onPlayPause={engine.togglePlay}
        onStep={engine.step}
        onRestart={engine.restart}
        speed={speed}
        onSpeedChange={engine.setSpeed}
        stepUnit={stepUnit}
        onStepUnitChange={engine.setStepUnit}
        pauseOnTradeEvents={pauseOnTradeEvents}
        onPauseOnTradeEventsChange={engine.setPauseOnTradeEvents}
        position={position}
        total={total}
        currentTime={lastRaw?.time}
        tzOffset={tzOffset}
        onSeek={engine.seek}
        startPosition={startPosition}
        onSetStart={() => engine.setStartPosition(position)}
        bookmarks={
          <BookmarksMenu
            bookmarks={bookmarks}
            position={position}
            tzOffset={tzOffset}
            onAdd={engine.addBookmark}
            onGo={engine.seek}
            onRemove={engine.removeBookmark}
            onRename={engine.renameBookmark}
            onJump={engine.jumpBookmark}
          />
        }
      />
    </div>
  );
}
