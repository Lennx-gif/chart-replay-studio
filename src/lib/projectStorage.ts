import { supabase } from '@/integrations/supabase/client';
import type { Drawing } from './drawings';
import type { Json } from '@/integrations/supabase/types';

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
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to list projects:', error);
    return [];
  }

  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    savedAt: new Date(p.updated_at).getTime(),
    fileName: p.symbol || '',
    timeframe: parseInt(p.timeframe || '60', 10),
    tzOffset: p.timezone_offset || 0,
    currentBarIndex: p.replay_index || 0,
    speed: p.replay_speed || 1,
    drawings: (p.drawings as unknown as Drawing[]) || [],
    csvData: ((p.settings as any)?.csvData as string) || '',
  }));
}

export async function saveProject(project: SavedProject): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row = {
    id: project.id,
    user_id: user.id,
    name: project.name,
    symbol: project.fileName,
    timeframe: String(project.timeframe),
    timezone_offset: project.tzOffset,
    replay_index: project.currentBarIndex,
    replay_speed: project.speed,
    drawings: project.drawings as unknown as Json,
    settings: { csvData: project.csvData } as unknown as Json,
  };

  const { error } = await supabase
    .from('projects')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error('Failed to save project:', error);
    throw error;
  }
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete project:', error);
    throw error;
  }
}

export function generateProjectId(): string {
  return crypto.randomUUID();
}
