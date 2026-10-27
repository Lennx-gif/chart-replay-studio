import { useCallback, useEffect, useRef, useState } from 'react';
import { updateSession, type SessionPatch } from '@/lib/store';

export type SaveStatus = 'saved' | 'saving' | 'error';

/**
 * High-performance autosave of a session to the local IndexedDB database.
 * Eliminates recursive JSON.stringify on complex drawing/order trees during replay ticks.
 * Uses shallow / reference equality and throttles writes during fast playback.
 */
export function useSessionAutosave(sessionId: string, patch: SessionPatch, delayMs = 1500) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latest = useRef(patch);
  const prevPatch = useRef<SessionPatch | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  latest.current = patch;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
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

  // Fast shallow comparison avoiding recursive JSON.stringify
  const hasChanged = useCallback((cur: SessionPatch, prev: SessionPatch | null): boolean => {
    if (!prev) return true;
    const curKeys = Object.keys(cur) as (keyof SessionPatch)[];
    for (const key of curKeys) {
      if (cur[key] !== prev[key]) {
        return true;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      prevPatch.current = patch;
      return;
    }

    if (hasChanged(patch, prevPatch.current)) {
      prevPatch.current = patch;
      dirty.current = true;

      // Trailing throttle so long continuous playback saves periodically without locking disk I/O
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          void flush();
        }, delayMs);
      }
    }
  }, [patch, delayMs, flush, hasChanged]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onUnload = () => {
      void flush();
    };
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
