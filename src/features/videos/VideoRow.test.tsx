import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@/lib/types';
import { VideoRow } from './VideoRow';

const video: Video = {
  id: 'v1', youtubeVideoId: 'abc', title: 'Quadratic equations', description: null, thumbnailUrl: null, sourceUrl: null, channelTitle: 'Maths Channel', durationSeconds: 754,
  availabilityStatus: 'AVAILABLE', isCustomized: false, createdAt: '', status: 'IN_PROGRESS', lastPositionSeconds: 30, lastStudiedAt: null, completedAt: null, favorite: false,
};

function setup(v: Video = video, props = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: 'COMPLETED', lastPositionSeconds: 30 } }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <VideoRow video={v} index={3} playlistId="p9" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VideoRow', () => {
  it('shows title, status, duration and links to the study view within the playlist', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Quadratic equations' })).toHaveAttribute('href', '/watch/v1?playlist=p9');
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument();
  });

  it('marks complete through the progress endpoint', async () => {
    const fetchMock = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Quadratic equations as complete' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/videos/v1/progress');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'COMPLETED' });
  });

  it('reopens a completed video when unchecked', async () => {
    const fetchMock = setup({ ...video, status: 'COMPLETED' });
    const box = screen.getByRole('checkbox', { name: /Mark Quadratic equations as complete/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ status: 'IN_PROGRESS' });
  });

  it('flags videos removed from the source playlist', () => {
    setup({ ...video, removedFromSource: true });
    expect(screen.getByText(/Removed from YouTube playlist/)).toBeInTheDocument();
  });
});
