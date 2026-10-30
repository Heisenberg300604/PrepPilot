import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { keys } from '@/lib/api';
import { useSaveNote } from '@/features/videos/queries';

export type NoteState = 'saved' | 'dirty' | 'saving' | 'error';

/** Debounced autosave with an explicit state machine, flush-on-unmount and an unsaved-changes guard. */
export function useAutosaveNote(videoId: string, initial: string, delay = 1000) {
  const [content, setContent] = useState(initial);
  const [state, setState] = useState<NoteState>('saved');
  const save = useSaveNote();
  const qc = useQueryClient();
  const latest = useRef(initial);
  const savedValue = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback(async () => {
    clearTimeout(timer.current);
    const value = latest.current;
    if (value === savedValue.current) return setState('saved');
    setState('saving');
    try {
      await save.mutateAsync({ id: videoId, content: value });
      savedValue.current = value;
      qc.setQueriesData({ queryKey: keys.video(videoId) }, (old: any) => (old ? { ...old, note: value } : old));
      setState(latest.current === value ? 'saved' : 'dirty');
      if (latest.current !== value) timer.current = setTimeout(persist, delay);
    } catch {
      setState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, delay]);

  const change = (v: string) => {
    latest.current = v;
    setContent(v);
    setState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, delay);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current !== savedValue.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearTimeout(timer.current);
      if (latest.current !== savedValue.current) void persist(); // flush on navigation
    };
  }, [persist]);

  return { content, change, state, retry: persist };
}
