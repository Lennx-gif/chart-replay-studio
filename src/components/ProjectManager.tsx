import { useState, useEffect, useCallback } from 'react';
import { Save, FolderOpen, Trash2, X, Loader2 } from 'lucide-react';
import { listProjects, deleteProject, type SavedProject } from '@/lib/projectStorage';
import { toast } from 'sonner';

interface ProjectManagerProps {
  onSave: (name: string) => void;
  onLoad: (project: SavedProject) => void;
  currentProjectName?: string;
}

export function ProjectManager({ onSave, onLoad, currentProjectName }: ProjectManagerProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [saveName, setSaveName] = useState(currentProjectName || '');
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const list = await listProjects();
    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (showPanel) fetchProjects();
  }, [showPanel, fetchProjects]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) {
      toast.error('Enter a project name');
      return;
    }
    onSave(name);
    setShowPanel(false);
    toast.success(`Project "${name}" saved`);
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success(`Deleted "${name}"`);
    } catch {
      toast.error('Failed to delete project');
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          className="toolbar-btn text-xs flex items-center gap-1"
          onClick={() => { setSaveName(currentProjectName || ''); handleSave(); }}
          title="Quick save"
        >
          <Save size={13} />
          Save
        </button>
        <button
          className="toolbar-btn text-xs flex items-center gap-1"
          onClick={() => setShowPanel(!showPanel)}
          title="Projects"
        >
          <FolderOpen size={13} />
          Projects
        </button>
      </div>

      {showPanel && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Projects</span>
            <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>

          {/* Save as */}
          <div className="p-3 border-b border-border">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                placeholder="Project name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button className="toolbar-btn text-xs px-3" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="p-4 flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No saved projects</div>
            ) : (
              projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer group"
                  onClick={() => { onLoad(p); setShowPanel(false); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.fileName} · {new Date(p.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
