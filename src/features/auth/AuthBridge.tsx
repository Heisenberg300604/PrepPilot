import { useAuth } from '@clerk/clerk-react';
import { Fragment, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setTokenProvider } from '@/lib/api';

/**
 * Connects Clerk's session token to the API client. When the signed-in user changes, cached data is
 * discarded and the subtree remounts (keyed by user id), so one user never sees another's cache.
 * The cache is cleared during render, *before* children start querying; clearing it from an effect
 * would orphan queries that were already in flight.
 */
export function AuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth();
  const qc = useQueryClient();
  const last = useRef(userId);
  setTokenProvider(() => getToken());
  if (last.current !== userId) {
    last.current = userId;
    qc.clear();
  }
  return <Fragment key={userId ?? 'anon'}>{children}</Fragment>;
}
