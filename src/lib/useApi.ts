import { useMutation, useQueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
import { api, ApiError, LIBRARY_KEYS, type RequestOptions } from './api';
import { toast } from './toast';

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
