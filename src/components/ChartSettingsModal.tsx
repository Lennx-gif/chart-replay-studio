import { useState } from 'react';
import type { ChartSettings } from '@/lib/db/localDatabase';
import { X, Sliders, Palette, Activity, Check } from 'lucide-react';

interface ChartSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: ChartSettings;
  onSaveSettings: (settings: Partial<ChartSettings>) => void;
}

export function ChartSettingsModal({
  open,
  onClose,
  settings,
  onSaveSettings,
}: ChartSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'indicators'>('appearance');

  // Appearance state
  const [candleUpColor, setCandleUpColor] = useState(settings.candleUpColor);
  const [candleDownColor, setCandleDownColor] = useState(settings.candleDownColor);
  const [wickUpColor, setWickUpColor] = useState(settings.wickUpColor);
  const [wickDownColor, setWickDownColor] = useState(settings.wickDownColor);
  const [gridVisible, setGridVisible] = useState(settings.gridVisible);
  const [gridOpacity, setGridOpacity] = useState(settings.gridOpacity ?? 0.15);
  const [watermarkVisible, setWatermarkVisible] = useState(settings.watermarkVisible);
  const [watermarkOpacity, setWatermarkOpacity] = useState(settings.watermarkOpacity ?? 0.10);

  // Indicators state
  const [smaEnabled, setSmaEnabled] = useState(settings.activeIndicators.sma.enabled);
  const [smaPeriod, setSmaPeriod] = useState(settings.activeIndicators.sma.period);
  const [smaColor, setSmaColor] = useState(settings.activeIndicators.sma.color);

  const [emaEnabled, setEmaEnabled] = useState(settings.activeIndicators.ema.enabled);
  const [emaPeriod, setEmaPeriod] = useState(settings.activeIndicators.ema.period);
  const [emaColor, setEmaColor] = useState(settings.activeIndicators.ema.color);

  const [bbEnabled, setBbEnabled] = useState(settings.activeIndicators.bb.enabled);
  const [bbPeriod, setBbPeriod] = useState(settings.activeIndicators.bb.period);

  const [rsiEnabled, setRsiEnabled] = useState(settings.activeIndicators.rsi.enabled);
  const [rsiPeriod, setRsiPeriod] = useState(settings.activeIndicators.rsi.period);

  if (!open) return null;

  const handleApply = () => {
    onSaveSettings({
      candleUpColor,
      candleDownColor,
      wickUpColor,
      wickDownColor,
      gridVisible,
      gridOpacity,
      watermarkVisible,
      watermarkOpacity,
      activeIndicators: {
        sma: { enabled: smaEnabled, period: Number(smaPeriod) || 20, color: smaColor },
        ema: { enabled: emaEnabled, period: Number(emaPeriod) || 50, color: emaColor },
        bb: { enabled: bbEnabled, period: Number(bbPeriod) || 20, stdDev: 2 },
        rsi: { enabled: rsiEnabled, period: Number(rsiPeriod) || 14 },
        sessions: { enabled: settings.activeIndicators.sessions.enabled },
      },
    });
    onClose();
  };

  const handleResetDefaults = () => {
    setCandleUpColor('#4caf50');
    setCandleDownColor('#e05347');
    setWickUpColor('#4caf50');
    setWickDownColor('#e05347');
    setGridVisible(false);
    setGridOpacity(0.15);
    setWatermarkVisible(true);
    setWatermarkOpacity(0.10);
    setSmaEnabled(false);
    setEmaEnabled(false);
    setBbEnabled(false);
    setRsiEnabled(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-primary" />
            <span className="text-xs font-semibold text-foreground">Chart Customization & Settings</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-secondary/30 px-3 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`pb-2 px-3 font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'appearance'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Palette size={13} />
            Appearance & Colors
          </button>
          <button
            onClick={() => setActiveTab('indicators')}
            className={`pb-2 px-3 font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'indicators'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity size={13} />
            Technical Indicators
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'appearance' ? (
            <div className="space-y-4">
              {/* Candlestick Colors */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-2">
                  Candlestick Palette
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-secondary/40 p-2 rounded-lg border border-border">
                    <span className="text-xs text-foreground">Bullish Candle</span>
                    <input
                      type="color"
                      value={candleUpColor}
                      onChange={(e) => {
                        setCandleUpColor(e.target.value);
                        setWickUpColor(e.target.value);
                      }}
                      className="w-7 h-7 rounded border border-border bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-secondary/40 p-2 rounded-lg border border-border">
                    <span className="text-xs text-foreground">Bearish Candle</span>
                    <input
                      type="color"
                      value={candleDownColor}
                      onChange={(e) => {
                        setCandleDownColor(e.target.value);
                        setWickDownColor(e.target.value);
                      }}
                      className="w-7 h-7 rounded border border-border bg-transparent cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Grid & Overlays */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-2">
                  Canvas Display & Opacity
                </span>
                <div className="space-y-2">
                  <div className="space-y-1.5 bg-secondary/40 p-2.5 rounded-lg border border-border">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-foreground font-medium">Grid Lines</span>
                      <input
                        type="checkbox"
                        checked={gridVisible}
                        onChange={(e) => setGridVisible(e.target.checked)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                    </label>
                    {gridVisible && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                        <span className="text-muted-foreground text-[11px]">Grid Opacity</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.05}
                            max={0.5}
                            step={0.05}
                            value={gridOpacity}
                            onChange={(e) => setGridOpacity(Number(e.target.value))}
                            className="w-20 h-1 accent-primary cursor-pointer"
                          />
                          <span className="font-mono text-[10px] text-foreground font-semibold w-8 text-right">
                            {Math.round(gridOpacity * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 bg-secondary/40 p-2.5 rounded-lg border border-border">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-foreground font-medium">Symbol Watermark</span>
                      <input
                        type="checkbox"
                        checked={watermarkVisible}
                        onChange={(e) => setWatermarkVisible(e.target.checked)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                    </label>
                    {watermarkVisible && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                        <span className="text-muted-foreground text-[11px]">Watermark Opacity</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.02}
                            max={0.4}
                            step={0.02}
                            value={watermarkOpacity}
                            onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                            className="w-20 h-1 accent-primary cursor-pointer"
                          />
                          <span className="font-mono text-[10px] text-foreground font-semibold w-8 text-right">
                            {Math.round(watermarkOpacity * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Indicators Tab */
            <div className="space-y-3">
              {/* SMA */}
              <div className="p-3 bg-secondary/40 rounded-lg border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smaEnabled}
                      onChange={(e) => setSmaEnabled(e.target.checked)}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    <span className="text-xs font-semibold text-foreground">SMA (Simple Moving Average)</span>
                  </label>
                  <input
                    type="color"
                    value={smaColor}
                    onChange={(e) => setSmaColor(e.target.value)}
                    className="w-6 h-6 rounded bg-transparent cursor-pointer"
                  />
                </div>
                {smaEnabled && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Period:</span>
                    <input
                      type="number"
                      min={2}
                      max={500}
                      value={smaPeriod}
                      onChange={(e) => setSmaPeriod(Number(e.target.value))}
                      className="w-20 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
                    />
                  </div>
                )}
              </div>

              {/* EMA */}
              <div className="p-3 bg-secondary/40 rounded-lg border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emaEnabled}
                      onChange={(e) => setEmaEnabled(e.target.checked)}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    <span className="text-xs font-semibold text-foreground">EMA (Exponential Moving Average)</span>
                  </label>
                  <input
                    type="color"
                    value={emaColor}
                    onChange={(e) => setEmaColor(e.target.value)}
                    className="w-6 h-6 rounded bg-transparent cursor-pointer"
                  />
                </div>
                {emaEnabled && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Period:</span>
                    <input
                      type="number"
                      min={2}
                      max={500}
                      value={emaPeriod}
                      onChange={(e) => setEmaPeriod(Number(e.target.value))}
                      className="w-20 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
                    />
                  </div>
                )}
              </div>

              {/* Bollinger Bands */}
              <div className="p-3 bg-secondary/40 rounded-lg border border-border space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bbEnabled}
                    onChange={(e) => setBbEnabled(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span className="text-xs font-semibold text-foreground">Bollinger Bands (20, 2)</span>
                </label>
                {bbEnabled && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Period:</span>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={bbPeriod}
                      onChange={(e) => setBbPeriod(Number(e.target.value))}
                      className="w-20 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
                    />
                  </div>
                )}
              </div>

              {/* RSI */}
              <div className="p-3 bg-secondary/40 rounded-lg border border-border space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rsiEnabled}
                    onChange={(e) => setRsiEnabled(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span className="text-xs font-semibold text-foreground">RSI (Relative Strength Index)</span>
                </label>
                {rsiEnabled && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">Period:</span>
                    <input
                      type="number"
                      min={2}
                      max={50}
                      value={rsiPeriod}
                      onChange={(e) => setRsiPeriod(Number(e.target.value))}
                      className="w-20 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-card">
          <button
            onClick={handleResetDefaults}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 flex items-center gap-1.5 transition-colors"
            >
              <Check size={14} />
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
