import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import type { Video } from '@/lib/types';
import { allSelected, filterSortVideos, importErrorMessage, importLabel, initialSelection, nextUnwatched, setRange, toggleId, watchUrl } from './helpers';

const v = (n: number, o: Partial<Video> = {}): Video => ({
  id: `v${n}`, youtubeVideoId: null, title: `T${n}`, description: null, thumbnailUrl: null, sourceUrl: null, channelTitle: null, durationSeconds: n * 10,
  availabilityStatus: 'AVAILABLE', isCustomized: false, createdAt: '', status: 'NOT_STARTED', lastPositionSeconds: 0, lastStudiedAt: null, completedAt: null, favorite: false, position: n, ...o,
});

describe('importErrorMessage', () => {
  it('maps codes to specific messages', () => {
    expect(importErrorMessage(new ApiError(403, 'YOUTUBE_PRIVATE', 'x')).message).toMatch(/private/i);
    expect(importErrorMessage(new ApiError(503, 'YOUTUBE_QUOTA_EXCEEDED', 'x')).retry).toBe(false);
    expect(importErrorMessage(new ApiError(429, 'YOUTUBE_RATE_LIMITED', 'x')).retry).toBe(true);
    expect(importErrorMessage(new ApiError(0, 'NETWORK', 'offline')).message).toBe('offline');
    expect(importErrorMessage(new ApiError(502, 'YOUTUBE_UPSTREAM_ERROR', 'x')).retry).toBe(true);
    expect(importErrorMessage(new Error('boom')).retry).toBe(true);
  });
});

describe('filterSortVideos', () => {
  const list = [v(3, { status: 'COMPLETED' }), v(1, { removedFromSource: true }), v(2, { status: 'IN_PROGRESS' }), v(4)];
  it('keeps playlist order by default and sinks removed items', () => {
    expect(filterSortVideos(list, 'ALL', 'ORDER').map((x) => x.id)).toEqual(['v2', 'v3', 'v4', 'v1']);
  });
  it('filters, and sorts by title / duration / status', () => {
    expect(filterSortVideos(list, 'COMPLETED', 'ORDER').map((x) => x.id)).toEqual(['v3']);
    expect(filterSortVideos(list, 'ALL', 'DURATION').map((x) => x.id)).toEqual(['v4', 'v3', 'v2', 'v1']);
    expect(filterSortVideos(list, 'ALL', 'STATUS').map((x) => x.id)).toEqual(['v4', 'v2', 'v3', 'v1']);
    expect(filterSortVideos(list, 'ALL', 'TITLE')[0].id).toBe('v2');
  });
});

describe('nextUnwatched', () => {
  it('prefers in-progress, then first not completed, ignoring removed', () => {
    expect(nextUnwatched([v(1, { status: 'COMPLETED' }), v(2), v(3, { status: 'IN_PROGRESS' })])?.id).toBe('v3');
    expect(nextUnwatched([v(1, { status: 'COMPLETED' }), v(2), v(3)])?.id).toBe('v2');
    expect(nextUnwatched([v(1, { removedFromSource: true }), v(2, { status: 'COMPLETED' })])?.id).toBe('v2');
    expect(nextUnwatched([])).toBeUndefined();
  });
  it('builds watch urls', () => {
    expect(watchUrl('a', 'p')).toBe('/watch/a?playlist=p');
    expect(watchUrl('a')).toBe('/watch/a');
  });
});

describe('choosing videos to import', () => {
  const vids = ['a', 'b', 'c', 'd', 'e'].map((youtubeVideoId) => ({ youtubeVideoId }));
  it('starts with everything selected except previously removed videos', () => {
    expect([...initialSelection(vids)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect([...initialSelection(vids, ['b', 'd', 'zzz'])].sort()).toEqual(['a', 'c', 'e']);
  });
  it('toggles without mutating the original set', () => {
    const s = new Set(['a']);
    const on = toggleId(s, 'b');
    expect([...on].sort()).toEqual(['a', 'b']);
    expect([...s]).toEqual(['a']);
    expect(toggleId(on, 'a').has('a')).toBe(false);
  });
  it('selects or clears a range in either direction (shift-click)', () => {
    const ids = vids.map((v) => v.youtubeVideoId);
    expect([...setRange(new Set(), ids, 1, 3, true)]).toEqual(['b', 'c', 'd']);
    expect([...setRange(new Set(), ids, 3, 1, true)]).toEqual(['b', 'c', 'd']); // direction doesn't matter
    expect([...setRange(new Set(ids), ids, 0, 2, false)].sort()).toEqual(['d', 'e']);
    expect(setRange(new Set(), ids, -4, 99, true).size).toBe(5); // out-of-range is clamped, never throws
  });
  it('labels the import button honestly', () => {
    expect(importLabel(0, 5)).toBe('Select videos to import');
    expect(importLabel(5, 5)).toBe('Import 5 videos');
    expect(importLabel(1, 1)).toBe('Import 1 video');
    expect(importLabel(2, 5)).toBe('Import 2 of 5 videos');
    expect(allSelected(new Set(['a']), 1)).toBe(true);
    expect(allSelected(new Set(), 0)).toBe(false);
  });
});
