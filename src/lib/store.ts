import { db, type BarsRecord, type DatasetRecord, type SessionRecord, type StepUnit, type ChartStyle } from './db';
import type { OHLCVBar } from './csvParser';
import { detectBaseTimeframe } from './csvParser';
import { DEFAULT_SPEED, DEFAULT_START_POSITION, clampPosition } from './replay';

/**
 * Persistence layer for datasets, sessions and settings. Everything is stored
 * in IndexedDB on this machine (see db.ts) — there is no server or account.
 */

export const DEFAULT_STARTING_BALANCE = 10000;

// ---------------------------------------------------------------- datasets

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Cheap content fingerprint so re-importing the same file reuses the stored copy. */
export function fingerprintBars(bars: OHLCVBar[]): string {
  const n = bars.length;
  const parts: (string | number)[] = [n];
  const step = Math.max(1, Math.floor(n / 128));
  for (let i = 0; i < n; i += step) {
    const b = bars[i];
    parts.push(b.time, b.open, b.high, b.low, b.close);
  }
  if (n > 0) {
    const b = bars[n - 1];
    parts.push(b.time, b.open, b.high, b.low, b.close);
  }
  return `${n}-${fnv1a(parts.join('|'))}`;
}

function toColumns(bars: OHLCVBar[]): BarsRecord['columns'] {
  const n = bars.length;
  const columns = {
    time: new Float64Array(n),
    open: new Float64Array(n),
    high: new Float64Array(n),
    low: new Float64Array(n),
    close: new Float64Array(n),
    volume: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    columns.time[i] = b.time;
    columns.open[i] = b.open;
    columns.high[i] = b.high;
    columns.low[i] = b.low;
    columns.close[i] = b.close;
    columns.volume[i] = b.volume;
  }
  return columns;
}

function fromColumns(c: BarsRecord['columns']): OHLCVBar[] {
  const out: OHLCVBar[] = new Array(c.time.length);
  for (let i = 0; i < c.time.length; i++) {
    out[i] = { time: c.time[i], open: c.open[i], high: c.high[i], low: c.low[i], close: c.close[i], volume: c.volume[i] };
  }
  return out;
}

/** Store bars as a dataset, or return the existing one if identical data was imported before. */
export async function saveDataset(name: string, bars: OHLCVBar[]): Promise<DatasetRecord> {
  if (bars.length === 0) throw new Error('Cannot store an empty dataset');
  const fingerprint = fingerprintBars(bars);
  const existing = await db.datasets.where('fingerprint').equals(fingerprint).first();
  if (existing) return existing;

  const record: DatasetRecord = {
    id: crypto.randomUUID(),
    fingerprint,
    name,
    symbol: name,
    barCount: bars.length,
    firstTime: bars[0].time,
    lastTime: bars[bars.length - 1].time,
    baseTimeframe: detectBaseTimeframe(bars),
    createdAt: Date.now(),
  };
  await db.transaction('rw', db.datasets, db.bars, async () => {
    await db.datasets.add(record);
    await db.bars.add({ datasetId: record.id, columns: toColumns(bars) });
  });
  return record;
}

export async function listDatasets(): Promise<DatasetRecord[]> {
  return db.datasets.orderBy('createdAt').reverse().toArray();
}

export async function getDataset(id: string): Promise<DatasetRecord | undefined> {
  return db.datasets.get(id);
}

export async function loadBars(datasetId: string): Promise<OHLCVBar[]> {
  const rec = await db.bars.get(datasetId);
  if (!rec) throw new Error('Price data for this session is missing from local storage');
  return fromColumns(rec.columns);
}

export async function renameDataset(id: string, name: string): Promise<void> {
  await db.transaction('rw', db.datasets, db.sessions, async () => {
    await db.datasets.update(id, { name, symbol: name });
    await db.sessions.where('datasetId').equals(id).modify({ symbol: name });
  });
}

/** Datasets can only be removed when no session uses them. Returns false if still in use. */
export async function deleteDataset(id: string): Promise<boolean> {
  const inUse = await db.sessions.where('datasetId').equals(id).count();
  if (inUse > 0) return false;
  await db.transaction('rw', db.datasets, db.bars, async () => {
    await db.datasets.delete(id);
    await db.bars.delete(id);
  });
  return true;
}

// ---------------------------------------------------------------- sessions

export interface NewSessionOptions {
  name: string;
  dataset: DatasetRecord;
  startingBalance?: number;
  startPosition?: number;
  timeframe?: number;
}

export function defaultSessionName(dataset: DatasetRecord): string {
  const d = new Date();
  return `${dataset.name} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export async function createSession(opts: NewSessionOptions): Promise<SessionRecord> {
  const { dataset } = opts;
  const now = Date.now();
  const start = clampPosition(opts.startPosition ?? DEFAULT_START_POSITION, dataset.barCount);
  const balance = opts.startingBalance ?? (await getSetting<number>('defaultStartingBalance', DEFAULT_STARTING_BALANCE));
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    name: opts.name.trim() || defaultSessionName(dataset),
    datasetId: dataset.id,
    symbol: dataset.symbol,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    position: start,
    startPosition: start,
    speed: DEFAULT_SPEED,
    stepUnit: 'bar' as StepUnit,
    timeframe: opts.timeframe ?? dataset.baseTimeframe,
    tzOffset: 0,
    chartStyle: 'candles' as ChartStyle,
    pauseOnTradeEvents: true,
    bookmarks: [],
    startingBalance: balance,
    orders: [],
    drawings: [],
    notes: '',
    totalBars: dataset.barCount,
    closedTrades: 0,
    realizedPnl: 0,
  };
  await db.sessions.add(session);
  return session;
}

export async function listSessions(): Promise<SessionRecord[]> {
  return db.sessions.orderBy('lastOpenedAt').reverse().toArray();
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db.sessions.get(id);
}

export async function touchSession(id: string): Promise<void> {
  await db.sessions.update(id, { lastOpenedAt: Date.now() });
}

export type SessionPatch = Partial<Omit<SessionRecord, 'id' | 'createdAt' | 'datasetId'>>;

export async function updateSession(id: string, patch: SessionPatch): Promise<void> {
  await db.sessions.update(id, { ...patch, updatedAt: Date.now() });
}

export async function renameSession(id: string, name: string): Promise<void> {
  await updateSession(id, { name: name.trim() || 'Untitled session' });
}

export async function duplicateSession(id: string): Promise<SessionRecord | undefined> {
  const src = await db.sessions.get(id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: SessionRecord = {
    ...structuredClone(src),
    id: crypto.randomUUID(),
    name: `${src.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  await db.sessions.add(copy);
  return copy;
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

// ---------------------------------------------------------------- settings

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rec = await db.settings.get(key);
  return rec ? (rec.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------------------------------------------------------------- storage

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported or denied */
  }
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ---------------------------------------------------------------- backup

interface BackupDataset {
  meta: DatasetRecord;
  bars: Record<keyof BarsRecord['columns'], number[]>;
}

export interface BackupFile {
  format: 'chart-replay-studio-backup';
  version: 1;
  exportedAt: number;
  datasets: BackupDataset[];
  sessions: SessionRecord[];
  settings: { key: string; value: unknown }[];
}

/** Everything in the local database as one JSON-serialisable object. */
export async function exportBackup(): Promise<BackupFile> {
  const [datasets, bars, sessions, settings] = await Promise.all([
    db.datasets.toArray(),
    db.bars.toArray(),
    db.sessions.toArray(),
    db.settings.toArray(),
  ]);
  const barsById = new Map(bars.map((b) => [b.datasetId, b.columns]));
  return {
    format: 'chart-replay-studio-backup',
    version: 1,
    exportedAt: Date.now(),
    datasets: datasets.flatMap((meta) => {
      const c = barsById.get(meta.id);
      if (!c) return [];
      return [{
        meta,
        bars: {
          time: Array.from(c.time), open: Array.from(c.open), high: Array.from(c.high),
          low: Array.from(c.low), close: Array.from(c.close), volume: Array.from(c.volume),
        },
      }];
    }),
    sessions,
    settings,
  };
}

export interface ImportSummary {
  datasets: number;
  sessions: number;
}

function isBackup(x: unknown): x is BackupFile {
  const b = x as BackupFile;
  return !!b && b.format === 'chart-replay-studio-backup' && b.version === 1 && Array.isArray(b.datasets) && Array.isArray(b.sessions);
}

/**
 * Merge a backup into the local database. Existing data is never overwritten:
 * identical datasets are reused and sessions whose id already exists get a new id.
 */
export async function importBackup(json: unknown): Promise<ImportSummary> {
  if (!isBackup(json)) throw new Error('This file is not a Chart Replay Studio backup');

  const idMap = new Map<string, string>();
  let datasets = 0;
  let sessions = 0;

  await db.transaction('rw', db.datasets, db.bars, db.sessions, async () => {
    for (const { meta, bars } of json.datasets) {
      const existing = await db.datasets.where('fingerprint').equals(meta.fingerprint).first();
      if (existing) {
        idMap.set(meta.id, existing.id);
        continue;
      }
      const id = (await db.datasets.get(meta.id)) ? crypto.randomUUID() : meta.id;
      idMap.set(meta.id, id);
      await db.datasets.add({ ...meta, id });
      await db.bars.add({
        datasetId: id,
        columns: {
          time: Float64Array.from(bars.time), open: Float64Array.from(bars.open), high: Float64Array.from(bars.high),
          low: Float64Array.from(bars.low), close: Float64Array.from(bars.close), volume: Float64Array.from(bars.volume),
        },
      });
      datasets++;
    }

    for (const s of json.sessions) {
      const datasetId = idMap.get(s.datasetId);
      if (!datasetId) continue; // its price data was not in the backup
      const id = (await db.sessions.get(s.id)) ? crypto.randomUUID() : s.id;
      await db.sessions.add({ ...s, id, datasetId });
      sessions++;
    }
  });

  return { datasets, sessions };
}
