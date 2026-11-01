import { useMutation, useQueryClient, type QueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
import { api, ApiError, LIBRARY_KEYS, type RequestOptions } from './api';
import { toast } from './toast';

type Entity = Record<string, unknown>;

/** Returns `value` with `patch` merged into every matching object, reusing untouched branches so unrelated rows don't re-render. */
function deepPatch(value: unknown, match: (o: Entity) => boolean, patch: Entity): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const n = deepPatch(v, match, patch);
      if (n !== v) changed = true;
      return n;
    });
    return changed ? out : value;
  }
  if (value && typeof value === 'object') {
    const o = value as Entity;
    let changed = false;
    const out: Entity = {};
    for (const k of Object.keys(o)) {
      out[k] = deepPatch(o[k], match, patch);
      if (out[k] !== o[k]) changed = true;
    }
    if (match(o)) return { ...out, ...patch };
    return changed ? out : o;
  }
  return value;
}

/**
 * Optimistically shows a change on one entity (a video, a task…) everywhere it is cached, before the server answers.
 * Only objects with this id that already have every patched field are touched. The mutation's usual invalidation
 * still refetches afterwards, so the server's answer (or a failure) always wins.
 */
export async function patchCached(qc: QueryClient, roots: QueryKey[], id: string, patch: Entity) {
  await Promise.all(roots.map((queryKey) => qc.cancelQueries({ queryKey })));
  const fields = Object.keys(patch);
  const match = (o: Entity) => o.id === id && fields.every((f) => f in o);
  for (const queryKey of roots) qc.setQueriesData({ queryKey }, (data: unknown) => deepPatch(data, match, patch));
}

/** Mutation helper: calls the API, refreshes library-derived data, and toasts a specific error on failure. */
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => { path: string } & RequestOptions,
  options: Omit<UseMutationOptions<TData, ApiError, TVars>, 'mutationFn'> & { invalidate?: QueryKey[]; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  const { invalidate = LIBRARY_KEYS, silentError, ...rest } = options;
  return useMutation<TData, ApiError, TVars>({
    ...rest,
    mutationFn: (vars) => {
      const { path, ...opts } = fn(vars);
      return api<TData>(path, opts);
    },
    onError: (e, v, ctx, mctx) => {
      if (!silentError) toast.error(e.message);
      return (rest.onError as any)?.(e, v, ctx, mctx);
    },
    onSettled: (d, e, v, ctx, mctx) => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      return (rest.onSettled as any)?.(d, e, v, ctx, mctx);
    },
  });
}
