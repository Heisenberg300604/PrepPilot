import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { DialogProvider } from '@/lib/dialogs';
import { ThemeProvider } from '@/lib/theme';

// vitest `globals` is off, so RTL's auto-cleanup isn't registered; do it here.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

/** Render with the providers the app uses (query cache, router, dialogs, theme). */
export function renderApp(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>
          <DialogProvider>{ui}</DialogProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

type Handler = (req: { method: string; body: any; search: URLSearchParams }) => unknown | { __status: number; error: unknown };

/** Stub only the network: `routes` maps "METHOD /api/path" -> response data. Returns the mock for assertions. */
export function stubApi(routes: Record<string, Handler | unknown>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.pathname}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `unstubbed ${key}` } }), { status: 404 });
    const h = routes[key];
    const out = typeof h === 'function' ? (h as Handler)({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined, search: url.searchParams }) : h;
    if (out && typeof out === 'object' && '__status' in (out as any)) return new Response(JSON.stringify({ error: (out as any).error }), { status: (out as any).__status });
    return new Response(JSON.stringify({ data: out }), { status: 200 });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
