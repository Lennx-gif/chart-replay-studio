import Dexie, { type Table } from 'dexie';
import type { Drawing } from './drawings';
import type { Order } from './tradeEngine';

/**
 * Local-only database (IndexedDB via Dexie). Everything the app persists lives
 * here, in the browser profile on this machine — there is no account or server.
 */

/** Dataset metadata. Cheap to list; the price columns live in `BarsRecord`. */
export interface DatasetRecord {
  id: string;
  /** Natural key used to avoid storing the same data twice. */
  fingerprint: string;
  name: string;
  symbol: string;
  barCount: number;
  firstTime: number;
  lastTime: number;
  /** Detected base timeframe in minutes. */
  baseTimeframe: number;
  createdAt: number;
}

/** Price history, stored column-wise so large files stay compact. */
export interface BarsRecord {
  datasetId: string;
  columns: {
    time: Float64Array;
    open: Float64Array;
    high: Float64Array;
    low: Float64Array;
    close: Float64Array;
    volume: Float64Array;
  };
}

export type StepUnit = 'bar' | 'candle' | '1m' | '5m' | '15m';
export type ChartStyle = 'candles' | 'line' | 'bars' | 'area';
export type DateRangeMode = 'daily' | 'monthly' | 'yearly' | 'all';

export interface Bookmark {
  id: string;
  /** Replay position (number of base bars revealed) the bookmark points at. */
  position: number;
  /** Bar time (unix seconds, UTC) at that position — used for display. */
  time: number;
  label: string;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  name: string;
  datasetId: string;
  /** Denormalised so the session list renders without loading bars. */
  symbol: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;

  // Replay state
  position: number;
  startPosition: number;
  speed: number;
  stepUnit: StepUnit;
  timeframe: number;
  tzOffset: number;
  chartStyle: ChartStyle;
  pauseOnTradeEvents: boolean;
  bookmarks: Bookmark[];

  // Trading + analysis state
  startingBalance: number;
  leverage?: number;
  orders: Order[];
  drawings: Drawing[];
  notes: string;

  // Date range management ("Data Times")
  dateRangeMode?: DateRangeMode;
  startDate?: string;
  endDate?: string;

  // Denormalised progress for the session list
  totalBars: number;
  closedTrades: number;
  realizedPnl: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export type NewsImpact = 'high' | 'medium' | 'low';

export interface NewsEventRecord {
  id: string;
  time: number; // unix seconds (UTC)
  currency: string; // e.g. "USD", "EUR"
  title: string;
  impact: NewsImpact;
  actual?: string;
  forecast?: string;
  previous?: string;
  source?: string;
}

class ReplayDatabase extends Dexie {
  datasets!: Table<DatasetRecord, string>;
  bars!: Table<BarsRecord, string>;
  sessions!: Table<SessionRecord, string>;
  settings!: Table<SettingRecord, string>;
  newsEvents!: Table<NewsEventRecord, string>;

  constructor(name = 'chart-replay-studio') {
    super(name);
    this.version(1).stores({
      datasets: 'id, &fingerprint, symbol, createdAt',
      bars: 'datasetId',
      sessions: 'id, datasetId, updatedAt, lastOpenedAt',
      settings: 'key',
    });
    this.version(2).stores({
      datasets: 'id, &fingerprint, symbol, createdAt',
      bars: 'datasetId',
      sessions: 'id, datasetId, updatedAt, lastOpenedAt',
      settings: 'key',
      newsEvents: 'id, time, currency, impact',
    });
  }
}

export const db = new ReplayDatabase();
