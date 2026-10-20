import { useCallback, useEffect, useRef, useState } from 'react';
import { updateSession, type SessionPatch } from '@/lib/store';

export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * Throttled autosave of a session to the local database. Pass the full set of
 * persisted fields on every render; a write is scheduled whenever they change
 * and flushed when the tab is hidden or the component unmounts, so closing the
 * window never loses recent progress.
 */
export function useSessionAutosave(sessionId: string, patch: SessionPatch, delayMs = 500) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latest = useRef(patch);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  latest.current = patch;

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      await updateSession(sessionId, latest.current);
      setStatus(dirty.current ? 'saving' : 'saved');
    } catch (err) {
      console.error('Autosave failed', err);
      dirty.current = true;
      setStatus('error');
    }
  }, [sessionId]);

  // Schedule a write whenever any persisted value changes (shallow compare).
  const signature = JSON.stringify(Object.values(patch).map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)));
  useEffect(() => {
    if (first.current) { first.current = false; return; } // nothing changed on mount
    dirty.current = true;
    // Trailing throttle (not debounce) so a long playback still saves regularly.
    if (!timer.current) timer.current = setTimeout(() => { void flush(); }, delayMs);
  }, [signature, delayMs, flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    const onUnload = () => { void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      void flush();
    };
  }, [flush]);

  return { status, saveNow: flush };
}
