import { useState } from 'react';
import { ArrowLeft, Check, Loader2, AlertTriangle, StickyNote, X } from 'lucide-react';
import type { SaveStatus } from '@/hooks/useSessionAutosave';

interface SessionBarProps {
  name: string;
  onNameChange: (name: string) => void;
  symbol: string;
  saveStatus: SaveStatus;
  notes: string;
  onNotesChange: (notes: string) => void;
  onBack: () => void;
}

const STATUS = {
  saved: { icon: <Check size={11} />, text: 'Saved', cls: 'text-muted-foreground' },
  saving: { icon: <Loader2 size={11} className="animate-spin" />, text: 'Saving…', cls: 'text-muted-foreground' },
  error: { icon: <AlertTriangle size={11} />, text: 'Not saved', cls: 'text-destructive' },
} as const;

export function SessionBar({ name, onNameChange, symbol, saveStatus, notes, onNotesChange, onBack }: SessionBarProps) {
  const [showNotes, setShowNotes] = useState(false);
  const status = STATUS[saveStatus];

  return (
    <div className="relative flex items-center gap-2 shrink-0">
      <button className="toolbar-btn text-xs gap-1" onClick={onBack} title="Back to sessions">
        <ArrowLeft size={13} />
        <span className="hidden md:inline">Sessions</span>
      </button>

      <div className="flex flex-col min-w-0 leading-tight">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="bg-transparent text-sm font-semibold text-foreground font-mono w-40 truncate rounded px-1 -mx-1 hover:bg-secondary focus:bg-secondary focus:outline-none"
          aria-label="Session name"
          maxLength={80}
        />
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-muted-foreground truncate">{symbol}</span>
          <span className={`flex items-center gap-0.5 ${status.cls}`} role="status">{status.icon}{status.text}</span>
        </div>
      </div>

      <button
        className={`toolbar-btn text-xs gap-1 ${showNotes ? 'toolbar-btn-active' : ''} ${notes ? 'text-primary' : ''}`}
        onClick={() => setShowNotes((s) => !s)}
        title="Session notes"
      >
        <StickyNote size={12} />
      </button>

      {showNotes && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Session notes</span>
            <button onClick={() => setShowNotes(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close notes">
              <X size={14} />
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="What are you practising? Rules, mistakes, observations…"
            className="w-full h-40 resize-none bg-background p-3 text-xs text-foreground focus:outline-none"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
