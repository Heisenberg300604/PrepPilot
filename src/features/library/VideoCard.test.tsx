import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Video } from '@/lib/types';
import { VideoCard, resumeLabel, watchedPercent } from './VideoCard';
import { renderApp, stubApi } from './testUtils';

const video = (over: Partial<Video> = {}): Video => ({
  id: 'v1',
  youtubeVideoId: 'abc',
  title: 'Limits — Lecture 3',
  description: null,
  thumbnailUrl: null,
  sourceUrl: null,
  channelTitle: null,
  durationSeconds: 600,
  availabilityStatus: 'AVAILABLE',
  isCustomized: false,
  createdAt: '2026-01-01T00:00:00Z',
  status: 'NOT_STARTED',
  lastPositionSeconds: 0,
  lastStudiedAt: null,
  completedAt: null,
  favorite: false,
  location: { examId: 'e', examName: 'CDS 2027', subjectId: 's', subjectName: 'Mathematics', folderId: 'f', folderPath: ['Main Course'] },
  ...over,
});

describe('VideoCard', () => {
  it('shows title link, duration, status and location', () => {
    renderApp(<VideoCard video={video()} showLocation />);
    expect(screen.getByRole('link', { name: 'Limits — Lecture 3' })).toHaveAttribute('href', '/watch/v1');
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('CDS 2027 › Mathematics › Main Course')).toBeInTheDocument();
  });

  it('shows a progress cue and a resume label for in-progress videos', () => {
    renderApp(<VideoCard video={video({ status: 'IN_PROGRESS', lastPositionSeconds: 150 })} continueCta />);
    expect(screen.getByRole('progressbar', { name: '25% watched' })).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByRole('link', { name: /Resume at 2:30/ })).toHaveAttribute('href', '/watch/v1');
  });

  it('computes labels and percentages safely', () => {
    expect(resumeLabel({ status: 'NOT_STARTED', lastPositionSeconds: 0 })).toBe('Continue');
    expect(resumeLabel({ status: 'COMPLETED', lastPositionSeconds: 90 })).toBe('Watch again');
    expect(watchedPercent({ status: 'IN_PROGRESS', lastPositionSeconds: 5, durationSeconds: null })).toBeNull();
    expect(watchedPercent({ status: 'IN_PROGRESS', lastPositionSeconds: 9999, durationSeconds: 100 })).toBe(100);
  });

  it('toggles favorite through the API', async () => {
    const put = vi.fn(() => ({ favorite: true }));
    const mock = stubApi({ 'PUT /api/videos/v1/favorite': put });
    renderApp(<VideoCard video={video()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add “Limits — Lecture 3” to favorites/ }));
    await vi.waitFor(() => expect(put).toHaveBeenCalled());
    expect(JSON.parse(String((mock.mock.calls[0] as any)[1].body))).toEqual({ favorite: true });
  });
});
