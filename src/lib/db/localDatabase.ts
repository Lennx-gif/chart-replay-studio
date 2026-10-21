import type { OHLCVBar } from '../csvParser';
import type { Drawing } from '../drawings';
import type { Order } from '../tradeEngine';

export interface StoredDataset {
  id: string;
  name: string;
  symbol: string;
  baseTimeframe: number; // in minutes
  barCount: number;
  startTime: number; // unix timestamp seconds
  endTime: number; // unix timestamp seconds
  bars: OHLCVBar[];
  source: 'upload' | 'sample';
  createdAt: number;
  updatedAt: number;
}

export interface DateFilterConfig {
  mode: 'all' | 'years' | 'months' | 'custom';
  startYear?: number;
  endYear?: number;
  months?: number[]; // 0-11
  customStart?: number; // unix timestamp seconds
  customEnd?: number; // unix timestamp seconds
  blindWindowDays?: number; // for random blind testing
}

export interface BacktestSession {
  id: string;
  name: string;
  datasetId: string;
  symbol: string;
  timeframe: number;
  currentTimestamp: number;
  speed: number;
  stepMode: 'bar' | 'time';
  stepMinutes: number;
  dateFilter: DateFilterConfig;
  drawings: Drawing[];
  orders: Order[];
  startingBalance: number;
  leverage?: number; // account leverage e.g. 1 (1:1), 30 (1:30), 100 (1:100)
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  id: 'current';
  displayName: string;
  startingBalance: number;
  riskPercentage: number;
  currency: string;
  favoriteTools: string[];
  theme: string;
}

export interface ChartSettings {
  id: 'global';
  chartStyle: 'candles' | 'bars' | 'line' | 'area';
  candleUpColor: string;
  candleDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  gridVisible: boolean;
  gridColor: string;
  gridOpacity?: number;
  watermarkVisible: boolean;
  watermarkOpacity?: number;
  activeIndicators: {
    sma: { enabled: boolean; period: number; color: string };
    ema: { enabled: boolean; period: number; color: string };
    bb: { enabled: boolean; period: number; stdDev: number };
    rsi: { enabled: boolean; period: number };
    sessions: { enabled: boolean };
  };
}

const DB_NAME = 'ReplayStudioDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('datasets')) {
        const dsStore = db.createObjectStore('datasets', { keyPath: 'id' });
        dsStore.createIndex('symbol', 'symbol', { unique: false });
        dsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('sessions')) {
        const sessStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessStore.createIndex('datasetId', 'datasetId', { unique: false });
        sessStore.createIndex('symbol', 'symbol', { unique: false });
        sessStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('chart_settings')) {
        db.createObjectStore('chart_settings', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// ---------------- Dataset CRUD ----------------

export async function saveDataset(dataset: StoredDataset): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    const req = store.put(dataset);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getDataset(id: string): Promise<StoredDataset | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listDatasets(): Promise<StoredDataset[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result as StoredDataset[]) || [];
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDataset(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'sessions'], 'readwrite');
    tx.objectStore('datasets').delete(id);
    
    // Also remove associated sessions or uncouple them
    const sessStore = tx.objectStore('sessions');
    const index = sessStore.index('datasetId');
    const req = index.getAllKeys(id);
    req.onsuccess = () => {
      for (const k of req.result) {
        sessStore.delete(k);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- Session CRUD ----------------

export async function saveSession(session: BacktestSession): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    const req = store.put({ ...session, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getSession(id: string): Promise<BacktestSession | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listSessions(datasetId?: string): Promise<BacktestSession[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const req = datasetId ? store.index('datasetId').getAll(datasetId) : store.getAll();
    req.onsuccess = () => {
      const list = (req.result as BacktestSession[]) || [];
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------- User Profile ----------------

const DEFAULT_PROFILE: UserProfile = {
  id: 'current',
  displayName: 'Local Trader',
  startingBalance: 10000,
  riskPercentage: 1,
  currency: 'USD',
  favoriteTools: ['trendline', 'horizontal', 'fibonacci', 'position_long', 'position_short', 'measure'],
  theme: 'dark',
};

export async function getProfile(): Promise<UserProfile> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('profile', 'readonly');
      const store = tx.objectStore('profile');
      const req = store.get('current');
      req.onsuccess = () => resolve(req.result || DEFAULT_PROFILE);
      req.onerror = () => resolve(DEFAULT_PROFILE);
    });
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function updateProfile(partial: Partial<UserProfile>): Promise<UserProfile> {
  const current = await getProfile();
  const updated: UserProfile = { ...current, ...partial, id: 'current' };
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profile', 'readwrite');
    const store = tx.objectStore('profile');
    const req = store.put(updated);
    req.onsuccess = () => resolve(updated);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- Chart Settings ----------------

const DEFAULT_CHART_SETTINGS: ChartSettings = {
  id: 'global',
  chartStyle: 'candles',
  candleUpColor: '#4caf50',
  candleDownColor: '#e05347',
  wickUpColor: '#4caf50',
  wickDownColor: '#e05347',
  gridVisible: false,
  gridColor: '#2a221830',
  gridOpacity: 0.15,
  watermarkVisible: true,
  watermarkOpacity: 0.10,
  activeIndicators: {
    sma: { enabled: false, period: 20, color: '#2196f3' },
    ema: { enabled: false, period: 50, color: '#ff9800' },
    bb: { enabled: false, period: 20, stdDev: 2 },
    rsi: { enabled: false, period: 14 },
    sessions: { enabled: false },
  },
};

export async function getChartSettings(): Promise<ChartSettings> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('chart_settings', 'readonly');
      const store = tx.objectStore('chart_settings');
      const req = store.get('global');
      req.onsuccess = () => resolve(req.result || DEFAULT_CHART_SETTINGS);
      req.onerror = () => resolve(DEFAULT_CHART_SETTINGS);
    });
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
}

export async function saveChartSettings(partial: Partial<ChartSettings>): Promise<ChartSettings> {
  const current = await getChartSettings();
  const updated: ChartSettings = { ...current, ...partial, id: 'global' };
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chart_settings', 'readwrite');
    const store = tx.objectStore('chart_settings');
    const req = store.put(updated);
    req.onsuccess = () => resolve(updated);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- Full Backup / Export / Import ----------------

export async function exportFullBackup(): Promise<string> {
  const datasets = await listDatasets();
  const sessions = await listSessions();
  const profile = await getProfile();
  const chartSettings = await getChartSettings();

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    datasets,
    sessions,
    profile,
    chartSettings,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importFullBackup(jsonString: string): Promise<{ datasets: number; sessions: number }> {
  const data = JSON.parse(jsonString);
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file');

  const db = await getDB();
  let datasetCount = 0;
  let sessionCount = 0;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['datasets', 'sessions', 'profile', 'chart_settings'], 'readwrite');

    if (Array.isArray(data.datasets)) {
      const dsStore = tx.objectStore('datasets');
      for (const ds of data.datasets) {
        if (ds && ds.id) {
          dsStore.put(ds);
          datasetCount++;
        }
      }
    }

    if (Array.isArray(data.sessions)) {
      const sessStore = tx.objectStore('sessions');
      for (const s of data.sessions) {
        if (s && s.id) {
          sessStore.put(s);
          sessionCount++;
        }
      }
    }

    if (data.profile) {
      tx.objectStore('profile').put({ ...data.profile, id: 'current' });
    }

    if (data.chartSettings) {
      tx.objectStore('chart_settings').put({ ...data.chartSettings, id: 'global' });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { datasets: datasetCount, sessions: sessionCount };
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
