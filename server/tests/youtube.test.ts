import { describe, expect, it } from 'vitest';
import { parsePlaylistUrl, parseVideoUrl } from '../src/youtube/parse.js';
import { parseIsoDuration, YouTubeClient, YouTubeError } from '../src/youtube/client.js';
import { cleanupUsers, makeHarness, seedWorkspace, ytPlaylist, ytVideo } from './helpers.js';

describe('URL parsing', () => {
  it('parses valid video URLs in every common format', () => {
    const id = 'dQw4w9WgXcQ';
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&list=PLabcdefghijk&t=10s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `youtube.com/watch?v=${id}`,
    ])
      expect(parseVideoUrl(u), u).toBe(id);
  });

  it('rejects invalid or unsafe video URLs', () => {
    for (const u of ['', 'not a url', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch', 'javascript:alert(1)', 'https://youtu.be/', 'ftp://youtube.com/watch?v=dQw4w9WgXcQ'])
      expect(parseVideoUrl(u), u).toBeNull();
  });

  it('parses playlist URLs and rejects non-importable lists', () => {
    expect(parsePlaylistUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
    expect(parsePlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijk')).toBe('PLabcdefghijk');
    for (const u of ['https://www.youtube.com/playlist?list=WL', 'https://www.youtube.com/playlist?list=LL', 'https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ', 'https://www.youtube.com/playlist', 'https://evil.com/playlist?list=PLabcdefghijk', 'https://www.youtube.com/playlist?list=<script>'])
      expect(parsePlaylistUrl(u), u).toBeNull();
  });

  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('P0D')).toBe(0);
    expect(parseIsoDuration('nonsense')).toBeNull();
  });
});

describe('YouTubeClient (against a stubbed HTTP layer)', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  it('reports missing API key without any network call', async () => {
    let called = false;
    const c = new YouTubeClient(undefined, (async () => ((called = true), json(200, {}))) as any);
    await expect(c.getPlaylistContents('PLabcdefghijk')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(called).toBe(false);
  });

  it('maps quota, private and missing responses to specific errors', async () => {
    const mk = (status: number, reason: string) => new YouTubeClient('k', (async () => json(status, { error: { errors: [{ reason }] } })) as any);
    await expect(mk(403, 'quotaExceeded').getPlaylistContents('PLabcdefghijk')).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    await expect(mk(403, 'playlistForbidden').getPlaylistContents('PLabcdefghijk')).rejects.toMatchObject({ code: 'PRIVATE' });
    await expect(mk(404, 'playlistNotFound').getPlaylistContents('PLabcdefghijk')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mk(429, '').getPlaylistContents('PLabcdefghijk')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('follows pagination and detects unavailable videos', async () => {
    const calls: string[] = [];
    const fetchStub = (async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      if (u.pathname.endsWith('/playlists')) return json(200, { items: [{ snippet: { title: 'P', channelTitle: 'C', thumbnails: { high: { url: 'x' } } } }] });
      if (u.pathname.endsWith('/playlistItems')) {
        const page2 = u.searchParams.get('pageToken') === 'T2';
        return json(200, {
          nextPageToken: page2 ? undefined : 'T2',
          items: page2
            ? [{ snippet: { position: 2, title: 'Deleted video', resourceId: { videoId: 'ccccccccccc' } }, contentDetails: { videoId: 'ccccccccccc' } }]
            : [
                { snippet: { position: 0, title: 'One', resourceId: { videoId: 'aaaaaaaaaaa' } }, contentDetails: { videoId: 'aaaaaaaaaaa' } },
                { snippet: { position: 1, title: 'Two', resourceId: { videoId: 'bbbbbbbbbbb' } }, contentDetails: { videoId: 'bbbbbbbbbbb' } },
              ],
        });
      }
      return json(200, { items: [{ id: 'aaaaaaaaaaa', snippet: { title: 'One' }, contentDetails: { duration: 'PT1M' }, status: {} }, { id: 'bbbbbbbbbbb', snippet: { title: 'Two' }, contentDetails: { duration: 'PT2M' }, status: {} }] });
    }) as any;
    const res = await new YouTubeClient('k', fetchStub).getPlaylistContents('PLabcdefghijk');
    expect(res.videos.map((v) => [v.youtubeVideoId, v.availability, v.durationSeconds])).toEqual([
      ['aaaaaaaaaaa', 'AVAILABLE', 60],
      ['bbbbbbbbbbb', 'AVAILABLE', 120],
      ['ccccccccccc', 'REMOVED', null],
    ]);
    expect(calls.filter((c) => c.includes('/playlistItems')).length).toBe(2);
    expect(calls.every((c) => c.startsWith('https://www.googleapis.com/youtube/v3/'))).toBe(true);
  });
});

const { as, newUser, youtube } = makeHarness();
cleanupUsers();
const PL = 'PLabcdefghijk';
const url = `https://www.youtube.com/playlist?list=${PL}`;

describe('playlist import', () => {
  it('reports a missing API key clearly, while manual video entry still works', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    youtube.configured = false;
    try {
      const pre = await a.post('/api/playlists/preview', { url });
      expect(pre.status).toBe(503);
      expect(pre.body.error.code).toBe('YOUTUBE_NOT_CONFIGURED');
      expect((await a.get('/api/meta')).body.data.features.youtubeImport).toBe(true === youtube.configured);

      const noTitle = await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', subjectId: subject.id });
      expect(noTitle.status).toBe(422);
      expect(noTitle.body.error.code).toBe('METADATA_UNAVAILABLE');
      const manual = await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'My lecture', subjectId: subject.id });
      expect(manual.status).toBe(201);
      expect(manual.body.data).toMatchObject({ title: 'My lecture', youtubeVideoId: 'dQw4w9WgXcQ', metadataSource: 'manual' });
    } finally {
      youtube.configured = true;
    }
  });

  it('rejects invalid, empty, private and missing playlists with useful errors', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    expect((await a.post('/api/playlists/preview', { url: 'https://example.com/x' })).status).toBe(400);
    expect((await a.post('/api/playlists/preview', { url: 'https://www.youtube.com/playlist?list=WL' })).status).toBe(400);
    const missing = await a.post('/api/playlists/preview', { url: 'https://www.youtube.com/playlist?list=PLnotexisting1' });
    expect(missing.status).toBe(404);
    youtube.playlists.set(PL, ytPlaylist(PL, []));
    expect((await a.post('/api/playlists/preview', { url })).body.error.code).toBe('EMPTY_PLAYLIST');
    youtube.failWith = new YouTubeError('QUOTA_EXCEEDED', 'quota');
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1)]));
    const quota = await a.post('/api/playlists/import', { url, subjectId: subject.id });
    expect(quota.status).toBe(503);
    expect(quota.body.error.code).toBe('YOUTUBE_QUOTA_EXCEEDED');
    youtube.failWith = null;
    // nothing was written by the failed attempt
    expect((await a.get('/api/playlists')).body.data).toHaveLength(0);
  });

  it('previews without writing, then imports with order, metadata and placement', async () => {
    const a = as(newUser());
    const { subject, main } = await seedWorkspace(a);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1), ytVideo(2), ytVideo(3, { availability: 'PRIVATE', title: 'Private video', durationSeconds: null })]));
    const pre = await a.post('/api/playlists/preview', { url });
    expect(pre.body.data).toMatchObject({ videoCount: 3, unavailableCount: 1, alreadyImportedPlaylistId: null });
    expect((await a.get('/api/playlists')).body.data).toHaveLength(0);

    const imp = await a.post('/api/playlists/import', { url, subjectId: subject.id, folderId: main.id });
    expect(imp.status).toBe(201);
    expect(imp.body.data).toMatchObject({ createdVideos: 3, reusedVideos: 0 });
    const detail = (await a.get(`/api/playlists/${imp.body.data.playlist.id}`)).body.data;
    expect(detail.videos.map((v: any) => [v.position, v.title])).toEqual([[0, 'Lecture 1'], [1, 'Lecture 2'], [2, 'Private video']]);
    expect(detail.placements[0]).toMatchObject({ subjectName: 'Mathematics', folderPath: ['Main Course'] });
    expect(detail.lastSyncedAt).toBeTruthy();
    expect(detail.stats).toMatchObject({ total: 3, completed: 0 });
    expect((await a.get(`/api/subjects/${subject.id}/contents?folderId=${main.id}`)).body.data.playlists).toHaveLength(1);
  });

  it('re-importing never duplicates playlists, videos, relationships or placements', async () => {
    const a = as(newUser());
    const { subject, main, revision } = await seedWorkspace(a);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1), ytVideo(2)]));
    const first = (await a.post('/api/playlists/import', { url, subjectId: subject.id, folderId: main.id })).body.data;
    const again = (await a.post('/api/playlists/import', { url, subjectId: subject.id, folderId: main.id })).body.data;
    expect(again.playlist.id).toBe(first.playlist.id);
    expect(again).toMatchObject({ createdVideos: 0, reusedVideos: 2, alreadyPlaced: true });
    // importing into a second location adds a placement, not a copy
    await a.post('/api/playlists/import', { url, subjectId: subject.id, folderId: revision.id });
    const detail = (await a.get(`/api/playlists/${first.playlist.id}`)).body.data;
    expect(detail.placements).toHaveLength(2);
    expect(detail.videos).toHaveLength(2);
    expect((await a.get('/api/videos')).body.data.total).toBe(2);
    expect((await a.get('/api/playlists')).body.data).toHaveLength(1);
    // the subject counts each video once despite two placements
    expect((await a.get(`/api/subjects/${subject.id}`)).body.data.stats.total).toBe(2);
  });

  it('shares one video record between two playlists and a manual add', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1), ytVideo(2)]));
    youtube.playlists.set('PLsecondlist1', ytPlaylist('PLsecondlist1', [ytVideo(2), ytVideo(3)]));
    await a.post('/api/playlists/import', { url, subjectId: subject.id });
    await a.post('/api/playlists/import', { url: 'https://www.youtube.com/playlist?list=PLsecondlist1', subjectId: subject.id });
    const shared = ytVideo(2).youtubeVideoId;
    const manual = await a.post('/api/videos', { url: `https://youtu.be/${shared}`, subjectId: subject.id });
    expect(manual.status).toBe(201);
    expect((await a.get('/api/videos')).body.data.total).toBe(3);
    const v = (await a.get('/api/videos?q=Lecture 2')).body.data.items[0];
    const detail = (await a.get(`/api/videos/${v.id}`)).body.data;
    expect(detail.playlists).toHaveLength(2);
    // progress is one record per video, visible from both playlists
    await a.put(`/api/videos/${v.id}/progress`, { status: 'COMPLETED' });
    for (const p of detail.playlists) expect((await a.get(`/api/playlists/${p.id}`)).body.data.stats.completed).toBe(1);
    expect((await a.get(`/api/subjects/${subject.id}`)).body.data.stats).toMatchObject({ total: 3, completed: 1, percent: 33 });
  });

  it('sync preserves progress, notes, favorites and identities; adds new videos; flags removed ones', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1), ytVideo(2), ytVideo(3)]));
    const imp = (await a.post('/api/playlists/import', { url, subjectId: subject.id })).body.data;
    const pid = imp.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    await a.put(`/api/videos/${vids[0].id}/progress`, { status: 'COMPLETED', lastPositionSeconds: 300 });
    await a.put(`/api/videos/${vids[0].id}/note`, { content: 'remember this' });
    await a.put(`/api/videos/${vids[0].id}/favorite`, { favorite: true });
    await a.patch(`/api/videos/${vids[1].id}`, { title: 'My custom title' });

    // source changes: video 3 removed, new video 4 first, titles/durations updated
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(4), ytVideo(1, { title: 'Lecture 1 (renamed)', durationSeconds: 999 }), ytVideo(2, { title: 'Renamed upstream' })]));
    const s1 = await a.post(`/api/playlists/${pid}/sync`);
    expect(s1.status).toBe(200);
    expect(s1.body.data).toMatchObject({ newVideos: 1, addedItems: 1, removedFromSource: 1 });
    const after = (await a.get(`/api/playlists/${pid}`)).body.data;
    expect(after.videos.map((v: any) => [v.title, v.position, v.removedFromSource])).toEqual([
      ['Lecture 4', 0, false],
      ['Lecture 1 (renamed)', 1, false],
      ['My custom title', 2, false], // local title survives
      ['Lecture 3', 3, true], // flagged, not deleted
    ]);
    const v1 = after.videos.find((v: any) => v.id === vids[0].id);
    expect(v1).toMatchObject({ status: 'COMPLETED', lastPositionSeconds: 300, favorite: true, durationSeconds: 999 });
    expect((await a.get(`/api/videos/${vids[0].id}`)).body.data.note).toBe('remember this');
    expect(after.stats).toMatchObject({ total: 3, completed: 1 }); // removed item excluded from counts

    // safe to retry
    const s2 = await a.post(`/api/playlists/${pid}/sync`);
    expect(s2.body.data).toMatchObject({ newVideos: 0, addedItems: 0, removedFromSource: 0 });
    expect((await a.get('/api/videos')).body.data.total).toBe(4);

    // a failed sync leaves everything untouched
    youtube.failWith = new YouTubeError('NETWORK', 'down');
    expect((await a.post(`/api/playlists/${pid}/sync`)).status).toBe(502);
    youtube.failWith = null;
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos).toHaveLength(4);
  });

  it('local playlist edits are flagged as local and survive a sync', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1)]));
    const pid = (await a.post('/api/playlists/import', { url, subjectId: subject.id })).body.data.playlist.id;
    await a.patch(`/api/playlists/${pid}`, { title: 'My name for it' });
    await a.post(`/api/playlists/${pid}/sync`);
    expect((await a.get(`/api/playlists/${pid}`)).body.data.title).toBe('My name for it');
  });

  it('deleting a playlist keeps its videos unless asked to prune untouched orphans', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1), ytVideo(2)]));
    const pid = (await a.post('/api/playlists/import', { url, subjectId: subject.id })).body.data.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    await a.put(`/api/videos/${vids[0].id}/progress`, { status: 'COMPLETED' });
    const del = await a.delete(`/api/playlists/${pid}?deleteOrphanVideos=true`);
    expect(del.body.data.removedVideos).toBe(1); // only the untouched one
    expect((await a.get(`/api/videos/${vids[0].id}`)).status).toBe(200);
    expect((await a.get(`/api/videos/${vids[1].id}`)).status).toBe(404);
  });
});

describe('local collections', () => {
  it('lets users build a local playlist from manual videos, but not edit an imported one', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    const pl = (await a.post('/api/playlists', { title: 'My picks', subjectId: subject.id })).body.data;
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'One', playlistId: pl.id, subjectId: subject.id })).body.data;
    expect((await a.get(`/api/playlists/${pl.id}`)).body.data.videos.map((x: any) => x.id)).toEqual([v.id]);
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1)]));
    const imported = (await a.post('/api/playlists/import', { url, subjectId: subject.id })).body.data.playlist;
    const res = await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', playlistId: imported.id });
    expect(res.status).toBe(422);
  });

  it('asks for confirmation before deleting a video that is still in use', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'V', subjectId: subject.id })).body.data;
    const refused = await a.delete(`/api/videos/${v.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toMatchObject({ placements: 1 });
    expect((await a.delete(`/api/videos/${v.id}?force=true`)).status).toBe(200);
  });
});

describe('playlist metadata cache', () => {
  it('reuses fetched metadata between preview and import to save API quota, and sync always refetches', async () => {
    const h = makeHarness({ playlistCacheTtlMs: 60_000 });
    const a = h.as(h.newUser());
    const { subject } = await seedWorkspace(a);
    h.youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1)]));
    await a.post('/api/playlists/preview', { url });
    const imp = await a.post('/api/playlists/import', { url, subjectId: subject.id });
    expect(h.youtube.calls.playlist).toBe(1);
    await a.post(`/api/playlists/${imp.body.data.playlist.id}/sync`);
    expect(h.youtube.calls.playlist).toBe(2);
  });
});
