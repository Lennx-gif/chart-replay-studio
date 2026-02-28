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
  // Store raw CSV text so we can fully restore
  csvData: string;
}

const STORAGE_KEY = 'chart-replay-projects';

export function listProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProject(project: SavedProject): void {
  const projects = listProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.unshift(project);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function deleteProject(id: string): void {
  const projects = listProjects().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
