import { useEffect } from 'react';
import type { DrawingType } from '@/lib/drawings';

export interface ShortcutHandlers {
  onSelectTool: (tool: DrawingType | null) => void;
  onDeleteSelectedDrawing?: () => void;
  onUndoDrawing?: () => void;
  onTogglePlay?: () => void;
  onStep?: (amount: number) => void;
  onChangeSpeed?: (dir: 1 | -1) => void;
  onToggleJournal?: () => void;
  onToggleDashboard?: () => void;
  onAddBookmark?: () => void;
  onJumpBookmark?: (dir: 1 | -1) => void;
}

export function useWorkspaceShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // 1. Undo: Ctrl+Z / Cmd+Z (without shift)
      if (cmdOrCtrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handlers.onUndoDrawing?.();
        return;
      }

      // 2. Alt + Key Combinations (TradingView standard tools)
      if (e.altKey && !cmdOrCtrl) {
        switch (e.key.toLowerCase()) {
          case 't': // Alt + T: Trend Line
            e.preventDefault();
            handlers.onSelectTool('trendline');
            return;
          case 'h': // Alt + H: Horizontal Line
            e.preventDefault();
            handlers.onSelectTool('horizontal');
            return;
          case 'v': // Alt + V: Vertical Line
            e.preventDefault();
            handlers.onSelectTool('vertical');
            return;
          case 'r': // Alt + R: Rectangle
            e.preventDefault();
            handlers.onSelectTool('rectangle');
            return;
          case 'f': // Alt + F: Fib Retracement
            e.preventDefault();
            handlers.onSelectTool('fibonacci');
            return;
          case 'm': // Alt + M: Measure
            e.preventDefault();
            handlers.onSelectTool('measure');
            return;
        }
      }

      // 3. Escape: Deselect / Cancel active drawing / Cursor
      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onSelectTool(null);
        return;
      }

      // 4. Delete / Backspace: Remove selected drawing
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!e.altKey && !cmdOrCtrl) {
          e.preventDefault();
          handlers.onDeleteSelectedDrawing?.();
          return;
        }
      }

      // 5. Standalone replay controls & navigation
      if (!cmdOrCtrl && !e.altKey) {
        const stepAmount = e.shiftKey ? 10 : 1;
        switch (e.key) {
          case ' ':
            e.preventDefault();
            handlers.onTogglePlay?.();
            break;
          case 'ArrowRight':
            e.preventDefault();
            handlers.onStep?.(stepAmount);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            handlers.onStep?.(-stepAmount);
            break;
          case '+':
          case '=':
            handlers.onChangeSpeed?.(1);
            break;
          case '-':
          case '_':
            handlers.onChangeSpeed?.(-1);
            break;
          case 'k':
          case 'K':
            handlers.onAddBookmark?.();
            break;
          case ']':
            handlers.onJumpBookmark?.(1);
            break;
          case '[':
            handlers.onJumpBookmark?.(-1);
            break;
          case 'j':
          case 'J':
            handlers.onToggleJournal?.();
            break;
          case 'd':
          case 'D':
            handlers.onToggleDashboard?.();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
