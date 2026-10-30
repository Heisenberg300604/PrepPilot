import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from './api';
import type { Profile } from './types';
import { useApiMutation } from './useApi';

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => api<Profile>('/profile'), staleTime: 60_000 });

export const useMeta = () =>
  useQuery({ queryKey: keys.meta, queryFn: () => api<{ features: { youtubeImport: boolean } }>('/meta'), staleTime: 5 * 60_000 });

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useApiMutation<Partial<Omit<Profile, 'id' | 'avatarUrl' | 'createdAt'>>, Profile>((body) => ({ path: '/profile', method: 'PATCH', body }), {
    invalidate: [keys.profile, keys.dashboard],
    // Put the saved profile in the cache immediately so route guards never act on a stale copy
    // (e.g. finishing onboarding and navigating before the refetch lands).
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
};

/** Debounce a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Sets document.title as "<page> · PrepPilot". */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · PrepPilot` : 'PrepPilot — Your preparation. Your pace. Your progress.';
  }, [title]);
}
