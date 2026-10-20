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

export type StepUnit = 'bar' | 'candle';
export type ChartStyle = 'candles' | 'line' | 'bars' | 'area';

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
  orders: Order[];
  drawings: Drawing[];
  notes: string;

  // Denormalised progress for the session list
  totalBars: number;
  closedTrades: number;
  realizedPnl: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

class ReplayDatabase extends Dexie {
  datasets!: Table<DatasetRecord, string>;
  bars!: Table<BarsRecord, string>;
  sessions!: Table<SessionRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor(name = 'chart-replay-studio') {
    super(name);
    this.version(1).stores({
      datasets: 'id, &fingerprint, symbol, createdAt',
      bars: 'datasetId',
      sessions: 'id, datasetId, updatedAt, lastOpenedAt',
      settings: 'key',
    });
  }
}

export const db = new ReplayDatabase();
