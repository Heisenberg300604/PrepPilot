import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setTokenProvider } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setTokenProvider(async () => null);
});
afterEach(() => vi.unstubAllGlobals());

describe('api()', () => {
  it('unwraps the { data } envelope', async () => {
    fetchMock.mockResolvedValue(json(200, { data: { hello: 'world' } }));
    await expect(api('/ping')).resolves.toEqual({ hello: 'world' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ping');
  });

  it('sends the Clerk token only as a Bearer header', async () => {
    setTokenProvider(async () => 'tok_123');
    fetchMock.mockResolvedValue(json(200, { data: 1 }));
    await api('/profile');
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer tok_123');
    expect(fetchMock.mock.calls[0][0]).not.toContain('tok_123');
  });

  it('omits Authorization when signed out or token lookup fails', async () => {
    setTokenProvider(async () => {
      throw new Error('clerk down');
    });
    fetchMock.mockResolvedValue(json(200, { data: 1 }));
    await api('/x');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('serialises query params, skipping empty values', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [] }));
    await api('/videos', { query: { q: 'a b', status: 'COMPLETED', favorite: true, limit: 20, empty: '', none: null, undef: undefined } });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/videos?q=a+b&status=COMPLETED&favorite=true&limit=20');
  });

  it('JSON-encodes bodies and sets the content type', async () => {
    fetchMock.mockResolvedValue(json(201, { data: { id: '1' } }));
    await api('/exams', { method: 'POST', body: { name: 'CDS' } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"name":"CDS"}');
  });

  it('maps the error envelope to ApiError', async () => {
    fetchMock.mockResolvedValue(json(422, { error: { code: 'INVALID_RELATIONSHIP', message: 'Folder is in another subject.', details: { a: 1 } } }));
    const err = (await api('/tasks').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'INVALID_RELATIONSHIP', message: 'Folder is in another subject.', details: { a: 1 } });
    expect(err.isAuth).toBe(false);
  });

  it('flags 401 as an auth error', async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }));
    const err = (await api('/profile').catch((e) => e)) as ApiError;
    expect(err.isAuth).toBe(true);
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    const err = (await api('/x').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 502, code: 'ERROR' });
    expect(err.message).toContain('502');
  });

  it('turns network failures into a friendly NETWORK error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await api('/x').catch((e) => e)) as ApiError;
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' });
    expect(err.message).toMatch(/connection/i);
  });

  it('rethrows aborts untouched', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(api('/x')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
