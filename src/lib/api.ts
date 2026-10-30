import type { QueryKey } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get isAuth() {
    return this.status === 401;
  }
}

type TokenProvider = () => Promise<string | null>;
let getToken: TokenProvider = async () => null;
/** Wired to Clerk's session token by <AuthBridge/>. The token only ever travels in the Authorization header. */
export const setTokenProvider = (fn: TokenProvider) => {
  getToken = fn;
};

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, { method = 'GET', body, query, signal }: RequestOptions = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const url = `${BASE}/api${path}${qs.size ? `?${qs}` : ''}`;

  const headers: Record<string, string> = {};
  const token = await getToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', "Can't reach PrepPilot right now. Check your connection and try again.");
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Something went wrong (${res.status}).`, err?.details);
  }
  return json?.data as T;
}

/** Central list of query keys so mutations can invalidate precisely. */
export const keys = {
  profile: ['profile'] as QueryKey,
  meta: ['meta'] as QueryKey,
  dashboard: ['dashboard'] as QueryKey,
  exams: ['exams'] as QueryKey,
  exam: (id: string) => ['exams', id] as QueryKey,
  subjects: ['subjects'] as QueryKey,
  subject: (id: string) => ['subjects', id] as QueryKey,
  contents: (subjectId: string, folderId?: string | null) => ['contents', subjectId, folderId ?? null] as QueryKey,
  folders: (subjectId: string) => ['folders', subjectId] as QueryKey,
  playlists: ['playlists'] as QueryKey,
  playlist: (id: string) => ['playlists', id] as QueryKey,
  videos: ['videos'] as QueryKey,
  video: (id: string) => ['video', id] as QueryKey,
  tasks: ['tasks'] as QueryKey,
  activity: ['activity'] as QueryKey,
  search: (q: string) => ['search', q] as QueryKey,
};

/**
 * Everything derived from the hierarchy / progress shares counts, so after almost any write we refresh
 * all of these rather than hand-patching caches. Cheap at personal-library scale.
 */
export const LIBRARY_KEYS: QueryKey[] = [
  keys.dashboard,
  keys.exams,
  keys.subjects,
  ['contents'],
  ['folders'],
  keys.playlists,
  keys.videos,
  ['video'],
  keys.tasks,
  keys.activity,
];
