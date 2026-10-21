import {
  saveSession,
  getSession,
  listSessions,
  deleteSession,
  generateUUID,
  type BacktestSession,
} from './db/localDatabase';
import type { Drawing } from './drawings';

export interface SavedProject {
  id: string;
  name: string;
  savedAt: number;
  fileName: string;
  timeframe: number;
  tzOffset: number;
  currentBarIndex: number;
  speed: number;
  drawings: Drawing[];
  csvData: string;
}

export async function listProjects(): Promise<SavedProject[]> {
  try {
    const sessions = await listSessions();
    return sessions.map((s) => ({
      id: s.id,
      name: s.name,
      savedAt: s.updatedAt,
      fileName: s.symbol || '',
      timeframe: s.timeframe || 60,
      tzOffset: 0,
      currentBarIndex: 50,
      speed: s.speed || 1,
      drawings: s.drawings || [],
      csvData: '',
    }));
  } catch (e) {
    console.error('Failed to list local projects:', e);
    return [];
  }
}

export async function saveProject(project: SavedProject): Promise<void> {
  const session: BacktestSession = {
    id: project.id || generateUUID(),
    name: project.name,
    datasetId: project.id,
    symbol: project.fileName,
    timeframe: project.timeframe,
    currentTimestamp: Math.floor(Date.now() / 1000),
    speed: project.speed,
    stepMode: 'bar',
    stepMinutes: project.timeframe,
    dateFilter: { mode: 'all' },
    drawings: project.drawings,
    orders: [],
    startingBalance: 10000,
    notes: '',
    createdAt: project.savedAt || Date.now(),
    updatedAt: Date.now(),
  };

  await saveSession(session);
}

export async function deleteProject(id: string): Promise<void> {
  await deleteSession(id);
}

export function generateProjectId(): string {
  return generateUUID();
}
