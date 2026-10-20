import { useState } from 'react';
import { Bookmark as BookmarkIcon, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import type { Bookmark } from '@/lib/db';
import { formatBarTime } from '@/lib/replay';

interface BookmarksMenuProps {
  bookmarks: Bookmark[];
  position: number;
  tzOffset: number;
  onAdd: (label?: string) => void;
  onGo: (position: number) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onJump: (dir: 1 | -1) => void;
}

export function BookmarksMenu({ bookmarks, position, tzOffset, onAdd, onGo, onRemove, onRename, onJump }: BookmarksMenuProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');

  return (
    <div className="relative flex items-center gap-1">
      <button className="control-btn" onClick={() => onJump(-1)} title="Previous bookmark ([)" disabled={bookmarks.length === 0}>
        <ChevronLeft size={14} />
      </button>
      <button
        className={`toolbar-btn text-xs gap-1 ${open ? 'toolbar-btn-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Bookmarks (K to add)"
      >
        <BookmarkIcon size={12} />
        <span>{bookmarks.length}</span>
      </button>
      <button className="control-btn" onClick={() => onJump(1)} title="Next bookmark (])" disabled={bookmarks.length === 0}>
        <ChevronRight size={14} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-50 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Bookmarks</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X size={14} />
            </button>
          </div>

          <form
            className="flex gap-2 p-3 border-b border-border"
            onSubmit={(e) => { e.preventDefault(); onAdd(label); setLabel(''); }}
          >
            <input
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              placeholder="Label for this moment…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
            />
            <button type="submit" className="toolbar-btn text-xs gap-1 px-2" title="Bookmark the current bar">
              <Plus size={12} /> Add
            </button>
          </form>

          <div className="max-h-56 overflow-y-auto">
            {bookmarks.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Bookmark interesting setups and jump back to them any time.
              </div>
            ) : (
              bookmarks.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/50 group ${b.position === position ? 'bg-primary/10' : ''}`}
                >
                  <button className="flex-1 min-w-0 text-left" onClick={() => onGo(b.position)}>
                    <input
                      className="w-full bg-transparent text-xs font-medium text-foreground truncate focus:outline-none focus:bg-background rounded px-0.5"
                      defaultValue={b.label}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { if (e.target.value !== b.label) onRename(b.id, e.target.value); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      aria-label="Bookmark label"
                    />
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {formatBarTime(b.time, tzOffset)} · bar {b.position.toLocaleString()}
                    </div>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                    onClick={() => onRemove(b.id)}
                    title="Delete bookmark"
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
