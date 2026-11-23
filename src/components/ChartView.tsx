import { useEffect, useRef, useCallback, useMemo, useState, memo } from 'react';
import {
  createChart, ColorType, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type Time,
} from 'lightweight-charts';
import { detectBaseTimeframe, type OHLCVBar } from '@/lib/csvParser';
import type { Drawing, DrawingType } from '@/lib/drawings';
import type { ChartStyle, SessionRecord } from '@/lib/db';
import { calculateStats, getPositionPnl, calculateSessionLedger, partialCloseOrder, setBreakEven } from '@/lib/tradeEngine';
import {
  SPEEDS,
  buildTimeframeIndex,
  detectPricePrecision,
  generateBlankChartWhitespace,
  visibleCandles,
} from '@/lib/replay';
import { getNewYorkOffset } from '@/lib/timezone';
import { useReplayEngine } from '@/hooks/useReplayEngine';
import { useSessionAutosave } from '@/hooks/useSessionAutosave';
import { useWorkspaceShortcuts } from '@/hooks/useWorkspaceShortcuts';
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
import { AccountEquityPopover } from './AccountEquityPopover';
import { SessionDashboardModal } from './SessionDashboardModal';
import { Globe, BarChart3, BookOpen, Columns, Eye, EyeOff, CandlestickChart, LineChart, BarChart, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';

interface ChartViewProps {
  session: SessionRecord;
  rawBars: OHLCVBar[];
  onExit: () => void;
}

const HIGHER_TFS = [15, 60, 240, 1440, 10080];

const tfLabel = (m: number) => (m >= 10080 ? `${m / 10080}W` : m >= 1440 ? `${m / 1440}D` : m >= 60 ? `${m / 60}H` : `${m}m`);
const fmtPrice = (p: number) => (p > 10 ? p.toFixed(2) : p.toFixed(5));

/** A higher-timeframe chart built only from bars revealed so far — nothing from the future. */
const MiniChart = memo(function MiniChart({
  raw,
  minutes,
  position,
  tzOffset,
}: {
  raw: OHLCVBar[];
  minutes: number;
  position: number;
  tzOffset: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const renderedLen = useRef<number>(-1);
  const lastTimeRef = useRef<number>(-1);
  const renderedTzOffset = useRef(tzOffset);

  const index = useMemo(() => buildTimeframeIndex(raw, minutes), [raw, minutes]);
  const candles = useMemo(() => visibleCandles(raw, index, position), [raw, index, position]);
  const tzSec = tzOffset * 3600;

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
    renderedLen.current = -1;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) chart.applyOptions({ width, height });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const len = candles.length;
    if (len === 0) {
      series.setData([]);
      renderedLen.current = 0;
      return;
    }
    const last = candles[len - 1];
    const pt = { time: (last.time + tzSec) as Time, open: last.open, high: last.high, low: last.low, close: last.close };
    const lastTime = last.time + tzSec;

    if (
      renderedLen.current > 0 &&
      len >= renderedLen.current &&
      len <= renderedLen.current + 50 &&
      lastTime >= lastTimeRef.current &&
      renderedTzOffset.current === tzOffset
    ) {
      if (len === renderedLen.current) {
        series.update(pt);
      } else {
        for (let i = Math.max(0, renderedLen.current - 1); i < len; i++) {
          const b = candles[i];
          series.update({ time: (b.time + tzSec) as Time, open: b.open, high: b.high, low: b.low, close: b.close });
        }
      }
    } else {
      series.setData(candles.map((b) => ({ time: (b.time + tzSec) as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
      chart.timeScale().scrollToPosition(-2, false);
    }
    renderedLen.current = len;
    lastTimeRef.current = lastTime;
    renderedTzOffset.current = tzOffset;
  }, [candles, tzOffset, tzSec]);

  const last = candles[candles.length - 1];
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
});

export function ChartView({ session, rawBars, onExit }: ChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [chartApi, setChartApi] = useState<IChartApi | null>(null);
  // The main series type varies with the chart style (candles/bars/line/area).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<any> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const timelineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const timelineDataRef = useRef<{ bars: OHLCVBar[]; tzOffset: number } | null>(null);
  /** What the series currently holds, so playback can append instead of resetting. */
  const rendered = useRef<{
    len: number;
    first: number;
    timeframe: number;
    tzOffset: number;
    bars: OHLCVBar[];
  } | null>(null);
  /** True once the chart is removed; touching its series afterwards queues a repaint on a dead canvas. */
  const chartDisposed = useRef(true);
  const prevMarkersRef = useRef<string>('');

  const engine = useReplayEngine(rawBars, session);
  const {
    position, total, candles, orders, timeframe, stepUnit, speed, isPlaying, pauseOnTradeEvents, bookmarks, startPosition,
  } = engine;

  const [name, setName] = useState(session.name);
  const [notes, setNotes] = useState(session.notes);
  const [tzOffset, setTzOffset] = useState(() => session.tzOffset ?? getNewYorkOffset());
  const [chartStyle, setChartStyle] = useState<ChartStyle>(session.chartStyle);
  const [startingBalance, setStartingBalance] = useState(session.startingBalance);
  const [drawings, setDrawings] = useState<Drawing[]>(session.drawings);
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const changeTimezone = (offset: number) => {
    const shift = (offset - tzOffset) * 3600;
    setDrawings((current) => current.map((drawing) => ({
      ...drawing,
      points: drawing.points.map((point) => ({ ...point, time: point.time + shift })),
    })));
    setActiveTool(null);
    setTzOffset(offset);
  };
  const [favorites, setFavorites] = useState<(DrawingType | null)[]>(() => {
    try {
      const stored = localStorage.getItem('repla_tool_favorites');
      return stored ? JSON.parse(stored) : ['trendline', 'horizontal', 'fibonacci', 'position_long', 'position_short', 'measure'];
    } catch {
      return ['trendline', 'horizontal', 'fibonacci', 'position_long', 'position_short', 'measure'];
    }
  });
  const [showJournal, setShowJournal] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showMultiChart, setShowMultiChart] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);
  const [tradePanelTab, setTradePanelTab] = useState<'trade' | 'positions' | 'news' | 'analytics'>('trade');
  const [tradePanelCollapsed, setTradePanelCollapsed] = useState(false);

  const baseTimeframe = useMemo(() => detectBaseTimeframe(rawBars), [rawBars]);
  const precision = useMemo(() => detectPricePrecision(rawBars), [rawBars]);

  // Auto-default to intra-bar sub-timeframe streaming on higher timeframes (15m+)
  useEffect(() => {
    if (timeframe >= 15 && baseTimeframe <= 1 && stepUnit === 'candle') {
      engine.setStepUnit('1m');
    }
  }, [timeframe, baseTimeframe, stepUnit, engine]);

  // ------------------------------------------------------------ derived data
  const lastRaw = rawBars[position - 1];
  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastRaw?.close ?? 0;
  const stats = useMemo(() => calculateStats(orders, startingBalance), [orders, startingBalance]);
  const ledger = useMemo(
    () => calculateSessionLedger(startingBalance, orders, currentPrice, session.leverage ?? 100, session.symbol),
    [startingBalance, orders, currentPrice, session.leverage, session.symbol]
  );
  const tzSec = tzOffset * 3600;

  const handlePartialClose = useCallback((orderId: string, ratio: number) => {
    const o = orders.find((ord) => ord.id === orderId);
    const bar = rawBars[position - 1];
    if (!o || !bar) return;
    const res = partialCloseOrder(o, ratio, bar.close, bar.time, session.symbol);
    if (res) {
      engine.setOrders((prev) => prev.map((item) => (item.id === orderId ? res.remainingOrder : item)).concat(res.closedSlice));
      toast.success(`Closed ${(ratio * 100).toFixed(0)}% of position`);
    }
  }, [orders, rawBars, position, session.symbol, engine]);

  const handleSetBreakEven = useCallback((orderId: string) => {
    const o = orders.find((ord) => ord.id === orderId);
    if (!o || o.fillPrice == null) return;
    engine.updateOrder(orderId, { stopLoss: o.fillPrice });
    toast.success('Stop Loss moved to Break-Even');
  }, [orders, engine]);

  const openOrders = orders.filter((o) => o.status === 'filled').map((o) => {
    return {
      id: o.id,
      side: o.side,
      fillPrice: o.fillPrice,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      size: o.size,
      unrealizedPnl: getPositionPnl(o, currentPrice, session.symbol).pnl,
    };
  });
  const pendingOrders = orders.filter((o) => o.status === 'pending');

  // ---------------------------------------------------------------- autosave
  const { status: saveStatus, saveNow } = useSessionAutosave(session.id, {
    name, notes, position, startPosition, speed, stepUnit, timeframe, tzOffset, chartStyle, pauseOnTradeEvents,
    bookmarks, startingBalance, orders, drawings, totalBars: total, closedTrades: ledger.closedTradesCount, realizedPnl: ledger.realizedPnl,
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
    const timeline = chart.addLineSeries({
      lineVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    volumeRef.current = volume;
    timelineRef.current = timeline;
    timelineDataRef.current = null;
    rendered.current = null; // fresh series: force a full setData
    chartDisposed.current = false;
    setChartApi(chart);
    setSeriesApi(main);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartDisposed.current = true;
      chart.remove();
      volumeRef.current = null;
      timelineRef.current = null;
      setChartApi(null);
      setSeriesApi(null);
    };
  }, [chartStyle, precision]);

  // Keep future timestamps in a whitespace-only series so revealed candles can
  // still be appended to their own series during playback.
  useEffect(() => {
    const series = seriesApi;
    const volume = volumeRef.current;
    const timeline = timelineRef.current;
    if (!series || !volume || !timeline || !chartApi) return;
    const isOHLC = chartStyle === 'candles' || chartStyle === 'bars';
    const toPoint = (b: OHLCVBar) => (isOHLC
      ? { time: (b.time + tzSec) as Time, open: b.open, high: b.high, low: b.low, close: b.close }
      : { time: (b.time + tzSec) as Time, value: b.close });
    const toVolume = (b: OHLCVBar) => ({
      time: (b.time + tzSec) as Time, value: b.volume,
      color: b.close >= b.open ? 'rgba(76, 175, 80, 0.25)' : 'rgba(224, 83, 71, 0.25)',
    });

    const prev = rendered.current;
    const len = candles.length;
    const first = (candles[0]?.time ?? 0) + tzSec;
    const last = candles[len - 1];

    const previousTimeline = timelineDataRef.current;
    if (!previousTimeline || previousTimeline.bars !== engine.index.bars || previousTimeline.tzOffset !== tzOffset) {
      const timelineData = engine.index.bars.length > 0
        ? engine.index.bars.map((bar) => ({ time: (bar.time + tzSec) as Time }))
        : generateBlankChartWhitespace(timeframe, 120, tzOffset).map((bar) => ({ time: bar.time as Time }));
      timeline.setData(timelineData);
      timelineDataRef.current = { bars: engine.index.bars, tzOffset };
    }

    if (
      prev &&
      prev.first === first &&
      prev.timeframe === timeframe &&
      prev.tzOffset === tzOffset &&
      prev.bars === engine.index.bars &&
      len >= prev.len &&
      len <= prev.len + 2000 &&
      last
    ) {
      if (len === prev.len) {
        series.update(toPoint(last));
        volume.update(toVolume(last));
      } else {
        for (let i = Math.max(0, prev.len - 1); i < len; i++) {
          series.update(toPoint(candles[i]));
          volume.update(toVolume(candles[i]));
        }
      }
    } else {
      series.setData(candles.map(toPoint));
      volume.setData(candles.map(toVolume));
      const range = chartApi.timeScale().getVisibleLogicalRange();
      if (!isPlaying && len > 0 && (!range || range.to < len - 1 || range.from > len - 1)) {
        chartApi.timeScale().scrollToPosition(8, false);
      }
    }
    rendered.current = { len, first, timeframe, tzOffset, bars: engine.index.bars };
  }, [candles, chartStyle, seriesApi, chartApi, engine.index.bars, timeframe, tzOffset, tzSec, isPlaying]);

  // Trade markers (entries and exits) on the main series.
  const lastDisplayTime = candles.length > 0 ? candles[candles.length - 1].time + tzSec : undefined;
  useEffect(() => {
    if (!seriesApi) return;
    if (!showTradeMarkers) {
      if (prevMarkersRef.current !== 'empty') {
        prevMarkersRef.current = 'empty';
        seriesApi.setMarkers([]);
      }
      return;
    }
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
    const key = visible.map((m) => `${m.time}:${m.text}:${m.color}`).join('|');
    if (key !== prevMarkersRef.current) {
      prevMarkersRef.current = key;
      seriesApi.setMarkers(visible);
    }
  }, [orders, seriesApi, timeframe, tzOffset, lastDisplayTime, showTradeMarkers]);

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

  useWorkspaceShortcuts({
    onSelectTool: setActiveTool,
    onTogglePlay: engine.togglePlay,
    onStep: engine.step,
    onChangeSpeed: changeSpeed,
    onToggleJournal: () => setShowJournal((p) => !p),
    onToggleDashboard: () => setShowDashboard((p) => !p),
    onAddBookmark: engine.addBookmark,
    onJumpBookmark: engine.jumpBookmark,
  });

  // Multi-timeframe sidebar: the next three timeframes above the one on the chart.
  const multiTFs = useMemo(() => {
    const above = HIGHER_TFS.filter((m) => m > timeframe && m >= baseTimeframe);
    return (above.length >= 3 ? above : HIGHER_TFS.filter((m) => m >= baseTimeframe)).slice(0, 3);
  }, [timeframe, baseTimeframe]);

  return (
    <div className="flex flex-col h-screen w-screen max-w-full overflow-hidden bg-background relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card gap-2 overflow-x-auto no-scrollbar shrink-0 select-none min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
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
            {[
              { style: 'candles' as ChartStyle, icon: <CandlestickChart size={14} />, label: 'Candles' },
              { style: 'bars' as ChartStyle, icon: <BarChart size={14} />, label: 'Bars' },
              { style: 'line' as ChartStyle, icon: <LineChart size={14} />, label: 'Line' },
              { style: 'area' as ChartStyle, icon: <BarChart3 size={14} />, label: 'Area' },
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
          <TimeframeSelector baseTimeframe={baseTimeframe} currentTimeframe={timeframe} onTimeframeChange={engine.setTimeframe} />
          <div className="w-px h-5 bg-border" />
          <GoToDate raw={rawBars} position={position} tzOffset={tzOffset} onSeek={engine.seek} onSeekTime={engine.seekToTime} />
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {stats.totalTrades > 0 && (
            <button
              onClick={() => {
                setTradePanelTab('analytics');
                setTradePanelCollapsed(false);
              }}
              className="flex items-center gap-2 text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/40 hover:bg-secondary/70 border border-border/50 hover:border-primary/40 cursor-pointer transition-all active:scale-95"
              title="Click to view detailed Session Analytics"
            >
              <span className={stats.totalPnl >= 0 ? 'text-long font-semibold' : 'text-short font-semibold'}>
                {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">WR {stats.winRate.toFixed(0)}%</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{stats.totalTrades}T</span>
            </button>
          )}

          {lastCandle && (
            <div className="hidden xl:flex items-center gap-2.5 text-xs font-mono">
              <span className="text-muted-foreground">O</span><span className="text-foreground">{lastCandle.open.toFixed(precision)}</span>
              <span className="text-muted-foreground">H</span><span className="text-foreground">{lastCandle.high.toFixed(precision)}</span>
              <span className="text-muted-foreground">L</span><span className="text-foreground">{lastCandle.low.toFixed(precision)}</span>
              <span className="text-muted-foreground">C</span>
              <span className={lastCandle.close >= lastCandle.open ? 'text-long' : 'text-short'}>{lastCandle.close.toFixed(precision)}</span>
            </div>
          )}
          <div className="w-px h-5 bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <Globe size={13} className="text-muted-foreground" />
            <TimezoneSelector offset={tzOffset} onOffsetChange={changeTimezone} />
          </div>

          <div className="flex items-center gap-1">
            <button className={`toolbar-btn text-xs gap-1 ${showTradeMarkers ? 'toolbar-btn-active' : ''}`} onClick={() => setShowTradeMarkers((p) => !p)} title="Toggle historical trade markers on chart">
              <ArrowRightLeft size={12} />
              <span className="hidden lg:inline">Markers</span>
            </button>
            <button className={`toolbar-btn text-xs gap-1 ${showSessions ? 'toolbar-btn-active' : ''}`} onClick={() => setShowSessions((p) => !p)} title="Toggle market sessions">
              {showSessions ? <Eye size={12} /> : <EyeOff size={12} />}
              <span className="hidden xl:inline">Sessions</span>
            </button>
            <button className={`toolbar-btn text-xs gap-1 ${showMultiChart ? 'toolbar-btn-active' : ''}`} onClick={() => setShowMultiChart((p) => !p)} title="Multi-timeframe">
              <Columns size={12} />
              <span className="hidden lg:inline">Multi-TF</span>
            </button>
            <button className={`toolbar-btn text-xs gap-1 ${showJournal ? 'toolbar-btn-active' : ''}`} onClick={() => setShowJournal((p) => !p)} title="Trade journal (J)">
              <BookOpen size={12} />
              <span className="hidden lg:inline">Journal</span>
            </button>
            <button
              className={`toolbar-btn text-xs gap-1 ${showDashboard ? 'toolbar-btn-active text-primary border-primary/50' : ''}`}
              onClick={() => setShowDashboard((p) => !p)}
              title="Session telemetry & strategy dashboard (D)"
            >
              <BarChart3 size={12} />
              <span className="hidden lg:inline">Dashboard</span>
            </button>
          </div>

          <AccountEquityPopover ledger={ledger} onBalanceChange={setStartingBalance} />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative min-w-0">
        {showMultiChart && (
          <div className="w-72 border-r border-border flex flex-col overflow-hidden bg-background shrink-0">
            {multiTFs.map((m) => (
              <MiniChart key={m} raw={rawBars} minutes={m} position={position} tzOffset={tzOffset} />
            ))}
          </div>
        )}

        <div className="flex-1 relative min-w-0 overflow-hidden" style={{ cursor: activeTool ? 'crosshair' : 'default' }}>
          <div ref={containerRef} className="absolute inset-0" />
          <SessionOverlay chart={chartApi} containerRef={containerRef} visibleBars={candles} showSessions={showSessions} tzOffset={tzOffset} />
          <DrawingOverlay
            key={tzOffset}
            symbol={session.symbol}
            precision={precision}
            chart={chartApi}
            series={seriesApi}
            activeTool={activeTool}
            onToolChange={setActiveTool}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            containerRef={containerRef}
            timeframe={timeframe}
            orders={orders}
            onUpdateOrder={engine.updateOrder}
            onPlacePendingOrder={(side, price, sl, tp) => engine.placePending(side, price, sl, tp)}
          />
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

        <TradePanel
          onOffsetChange={changeTimezone}
          currentPrice={currentPrice}
          symbol={session.symbol}
          tzOffset={tzOffset}
          activeTab={tradePanelTab}
          onTabChange={setTradePanelTab}
          collapsed={tradePanelCollapsed}
          onToggleCollapse={setTradePanelCollapsed}
          onPlaceOrder={engine.placeMarket}
          onPlacePending={(side, price, sl, tp, size) => engine.placePending(side, price, sl, tp, size ?? 1)}
          onCloseOrder={engine.closeOrder}
          onPartialClose={handlePartialClose}
          onSetBreakEven={handleSetBreakEven}
          onUpdateOrder={engine.updateOrder}
          onCloseAll={engine.closeAll}
          onCancelOrder={engine.cancelOrder}
          orders={orders}
          ledger={ledger}
          startingBalance={startingBalance}
          currentReplayTime={lastRaw?.time}
          onSeekTime={engine.seekToTime}
        />

        {showJournal && <TradeJournal orders={orders} onClose={() => setShowJournal(false)} startingBalance={startingBalance} tzOffset={tzOffset} onOffsetChange={changeTimezone} />}

        <SessionDashboardModal
          open={showDashboard}
          onClose={() => setShowDashboard(false)}
          session={session}
          stats={stats}
          currentPrice={currentPrice}
          orders={orders}
          notes={notes}
          onNotesChange={setNotes}
          startingBalance={startingBalance}
          position={position}
          total={total}
        />
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
        timeframe={timeframe}
        baseTimeframe={baseTimeframe}
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
