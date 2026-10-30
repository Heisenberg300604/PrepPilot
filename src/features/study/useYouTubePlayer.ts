import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
/** Loads the official IFrame Player API exactly once. */
export function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('The YouTube player could not be loaded.'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export type PlayerState = 'loading' | 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';
export type PlayerProblem = null | { kind: 'script' | 'unplayable' | 'embed-blocked'; message: string };

const STATES: Record<number, PlayerState> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };

/** Maps the IFrame API error codes (2, 5, 100, 101, 150) to something a student can act on. */
export function describePlayerError(code: number): NonNullable<PlayerProblem> {
  if (code === 101 || code === 150) return { kind: 'embed-blocked', message: "The owner of this video doesn't allow it to be played inside other sites." };
  if (code === 100) return { kind: 'unplayable', message: 'This video was removed or is private, so it cannot be played.' };
  return { kind: 'unplayable', message: 'YouTube could not play this video here.' };
}

/**
 * Creates one YT.Player for `youtubeVideoId` and tears it down on change/unmount.
 * `timeRef` always holds the latest known playback time so it can still be saved during cleanup.
 */
export function useYouTubePlayer(youtubeVideoId: string | null) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timeRef = useRef(0);
  const [state, setState] = useState<PlayerState>('loading');
  const [problem, setProblem] = useState<PlayerProblem>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !youtubeVideoId) return;
    let cancelled = false;
    const mount = document.createElement('div');
    host.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          videoId: youtubeVideoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: (e: any) => {
              setState('cued');
              setDuration(Math.floor(e.target.getDuration?.() ?? 0));
            },
            onStateChange: (e: any) => {
              setState(STATES[e.data] ?? 'unstarted');
              const d = Math.floor(e.target.getDuration?.() ?? 0);
              if (d) setDuration(d);
            },
            onError: (e: any) => setProblem(describePlayerError(e.data)),
          },
        });
      })
      .catch((err: Error) => !cancelled && setProblem({ kind: 'script', message: err.message }));
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
      mount.remove();
    };
  }, [youtubeVideoId]);

  // Poll the clock once a second while playing.
  useEffect(() => {
    if (state !== 'playing') return;
    const id = setInterval(() => {
      const t = Math.floor(playerRef.current?.getCurrentTime?.() ?? 0);
      timeRef.current = t;
      setTime(t);
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  const seekTo = useCallback((s: number) => {
    playerRef.current?.seekTo?.(s, true);
    timeRef.current = s;
    setTime(s);
  }, []);
  const play = useCallback(() => playerRef.current?.playVideo?.(), []);
  /** Current time straight from the player (falls back to the last polled value). */
  const getTime = useCallback(() => {
    const t = playerRef.current?.getCurrentTime?.();
    if (typeof t === 'number') timeRef.current = Math.floor(t);
    return timeRef.current;
  }, []);

  return { hostRef, state, problem, duration, time, timeRef, seekTo, play, getTime };
}
