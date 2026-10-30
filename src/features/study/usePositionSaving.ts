import { useCallback, useEffect, useRef, useState } from 'react';
import { useSavePosition } from '@/features/videos/queries';
import type { PlayerState } from './useYouTubePlayer';

const INTERVAL_MS = 15_000;

/**
 * Persists playback position: every ~15 s while playing, on pause/end, on unmount and on pagehide.
 * Routine saves are silent; after two consecutive failures `failing` turns true so the UI can offer a retry.
 */
export function usePositionSaving(videoId: string, state: PlayerState, timeRef: React.MutableRefObject<number>, getTime: () => number) {
  const save = useSavePosition();
  const lastSaved = useRef(-1);
  const failures = useRef(0);
  const [failing, setFailing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const flush = useCallback(
    async (useLive = true) => {
      const t = useLive ? getTime() : timeRef.current;
      if (t <= 0 || t === lastSaved.current) return;
      try {
        await save.mutateAsync({ id: videoId, lastPositionSeconds: t });
        lastSaved.current = t;
        failures.current = 0;
        setFailing(false);
      } catch {
        failures.current += 1;
        if (failures.current >= 2) setFailing(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoId, getTime, timeRef],
  );

  useEffect(() => {
    if (state !== 'playing') return;
    const id = setInterval(() => void flush(), INTERVAL_MS);
    return () => clearInterval(id);
  }, [state, flush]);

  useEffect(() => {
    if (state === 'paused' || state === 'ended') void flush();
  }, [state, flush]);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void flush(false); // player is already destroyed here; use the last polled time
    };
  }, [flush]);

  return { failing, retry: () => flush(), lastSaved };
}
