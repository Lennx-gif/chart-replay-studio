import { useEffect } from 'react';
import { isDesktopApp } from '@/services/nativeDialogs';

/**
 * Prevents default browser shortcuts that break desktop immersion
 * (such as Ctrl+P print dialog, Ctrl+S save webpage, or accidental backspace navigation)
 * while strictly preserving all TradingView chart shortcuts.
 */
export function useDesktopImmersion() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      // Prevent Print dialog (Ctrl+P / Cmd+P)
      if (isCmdOrCtrl && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        return;
      }

      // Prevent Save Webpage (Ctrl+S / Cmd+S)
      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        return;
      }

      // Prevent accidental Backspace history navigation when not focused in an editable field
      if (e.key === 'Backspace') {
        const target = e.target as HTMLElement | null;
        const isEditable =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.isContentEditable;

        if (!isEditable) {
          // Do not prevent default if inside an input, but prevent standard browser back-navigation
          // Note: TradingView chart shortcuts use 'Delete' or explicit keys, not backspace navigation
          e.preventDefault();
        }
      }
    };

    // When running inside Tauri, disable default right-click context menu (which would show web reload/inspect in production)
    const handleContextMenu = (e: MouseEvent) => {
      if (isDesktopApp() && process.env.NODE_ENV === 'production') {
        // Prevent default browser context menu in production desktop mode
        // unless custom context menu components handle it
        const target = e.target as HTMLElement | null;
        if (!target?.closest('input, textarea')) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
}
