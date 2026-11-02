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

describe('choosing which videos to keep from a playlist', () => {
  const PLS = 'PLselect00001';
  const urlS = `https://www.youtube.com/playlist?list=${PLS}`;
  const seed = async () => {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject, main } = await seedWorkspace(a);
    h.youtube.playlists.set(PLS, ytPlaylist(PLS, [1, 2, 3, 4, 5].map((n) => ytVideo(n))));
    return { h, a, subject, main };
  };
  const idOf = (n: number) => ytVideo(n).youtubeVideoId;

  it('imports only the selected videos, keeping their order', async () => {
    const { a, subject } = await seed();
    const imp = await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: [idOf(5), idOf(1), idOf(3)] });
    expect(imp.status).toBe(201);
    expect(imp.body.data).toMatchObject({ createdVideos: 3, skippedVideos: 2 });
    const d = (await a.get(`/api/playlists/${imp.body.data.playlist.id}`)).body.data;
    expect(d.videos.map((v: any) => v.title)).toEqual(['Lecture 1', 'Lecture 3', 'Lecture 5']); // original playlist order, not selection order
    expect(d.stats.total).toBe(3);
    expect(d.excludedVideos.map((e: any) => e.title).sort()).toEqual(['Lecture 2', 'Lecture 4']);
    expect((await a.get('/api/videos')).body.data.total).toBe(3); // skipped videos never become library records
  });

  it('rejects an empty selection and ignores ids that are not in the playlist', async () => {
    const { a, subject } = await seed();
    const none = await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: [] });
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe('NOTHING_SELECTED');
    const bogus = await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: ['notInPlaylist'] });
    expect(bogus.status).toBe(422);
    expect((await a.get('/api/playlists')).body.data).toHaveLength(0); // nothing written
    const mixed = await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: [idOf(2), 'notInPlaylist'] });
    expect(mixed.body.data).toMatchObject({ createdVideos: 1, skippedVideos: 4 });
  });

  it('sync never brings removed videos back, but picks up genuinely new ones', async () => {
    const { h, a, subject } = await seed();
    const imp = await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: [idOf(1), idOf(2)] });
    const pid = imp.body.data.playlist.id;
    h.youtube.playlists.set(PLS, ytPlaylist(PLS, [1, 2, 3, 4, 5, 6].map((n) => ytVideo(n)))); // YouTube adds lecture 6
    const s = await a.post(`/api/playlists/${pid}/sync`);
    expect(s.body.data).toMatchObject({ newVideos: 1, addedItems: 1 });
    const titles = (await a.get(`/api/playlists/${pid}`)).body.data.videos.map((v: any) => v.title);
    expect(titles).toEqual(['Lecture 1', 'Lecture 2', 'Lecture 6']);
  });

  it('removes videos from an imported playlist: remembers them, keeps progress where it matters, prunes untouched ones', async () => {
    const { a, subject, main } = await seed();
    const pid = (await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, folderId: main.id })).body.data.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    await a.put(`/api/videos/${vids[0].id}/progress`, { status: 'COMPLETED' }); // has progress -> must survive
    await a.put(`/api/videos/${vids[1].id}/favorite`, { favorite: true }); // favourite -> must survive
    const rm = await a.post(`/api/playlists/${pid}/videos/remove`, { videoIds: [vids[0].id, vids[1].id, vids[2].id] });
    expect(rm.status).toBe(200);
    expect(rm.body.data).toMatchObject({ removed: 3, deletedVideos: 1, restorable: true }); // only the untouched one is deleted
    const d = (await a.get(`/api/playlists/${pid}`)).body.data;
    expect(d.videos.map((v: any) => v.title)).toEqual(['Lecture 4', 'Lecture 5']);
    expect(d.stats.total).toBe(2);
    expect(d.excludedVideos).toHaveLength(3);
    expect((await a.get(`/api/videos/${vids[0].id}`)).body.data.status).toBe('COMPLETED'); // history kept
    expect((await a.get(`/api/videos/${vids[2].id}`)).status).toBe(404);
    // removing something that isn't in the playlist is a harmless no-op
    expect((await a.post(`/api/playlists/${pid}/videos/remove`, { videoIds: [vids[0].id] })).body.data.removed).toBe(0);
    expect((await a.post(`/api/playlists/${pid}/videos/remove`, { videoIds: [] })).status).toBe(400);
    // a normal sync leaves the removed ones removed
    await a.post(`/api/playlists/${pid}/sync`);
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos).toHaveLength(2);
  });

  it('restores removed videos through sync, with their old progress intact', async () => {
    const { a, subject } = await seed();
    const pid = (await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id })).body.data.playlist.id;
    const first = (await a.get(`/api/playlists/${pid}`)).body.data.videos[0];
    await a.put(`/api/videos/${first.id}/progress`, { status: 'COMPLETED' });
    await a.post(`/api/playlists/${pid}/videos/remove`, { videoIds: [first.id] });
    expect((await a.get(`/api/playlists/${pid}`)).body.data.stats).toMatchObject({ total: 4, completed: 0 });
    const res = await a.post(`/api/playlists/${pid}/sync`, { restore: [idOf(1)] });
    expect(res.body.data.addedItems).toBe(1);
    const d = (await a.get(`/api/playlists/${pid}`)).body.data;
    expect(d.excludedVideos).toHaveLength(0);
    expect(d.videos[0]).toMatchObject({ id: first.id, status: 'COMPLETED', position: 0 }); // same record, original place
    expect(d.stats).toMatchObject({ total: 5, completed: 1 });
  });

  it('re-importing with a different selection adds and removes accordingly, and defaults restore everything', async () => {
    const { a, subject } = await seed();
    const pid = (await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: [idOf(1), idOf(2)] })).body.data.playlist.id;
    const preview = await a.post('/api/playlists/preview', { url: urlS });
    expect(preview.body.data.excludedVideoIds.sort()).toEqual([idOf(3), idOf(4), idOf(5)].sort());
    const re = await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id, selectedVideoIds: [idOf(2), idOf(3)] });
    expect(re.body.data.playlist.id).toBe(pid);
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos.map((v: any) => v.title)).toEqual(['Lecture 2', 'Lecture 3']);
    await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id }); // no selection = everything
    const d = (await a.get(`/api/playlists/${pid}`)).body.data;
    expect(d.videos).toHaveLength(5);
    expect(d.excludedVideos).toHaveLength(0);
  });

  it('local collections: removal just drops membership and keeps the video in the library', async () => {
    const { a, subject } = await seed();
    const pl = (await a.post('/api/playlists', { title: 'Mine', subjectId: subject.id })).body.data;
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'One', playlistId: pl.id })).body.data;
    const rm = await a.post(`/api/playlists/${pl.id}/videos/remove`, { videoIds: [v.id] });
    expect(rm.body.data).toMatchObject({ removed: 1, deletedVideos: 0, restorable: false });
    expect((await a.get(`/api/videos/${v.id}`)).status).toBe(200);
    expect((await a.get(`/api/playlists/${pl.id}`)).body.data.excludedVideos).toEqual([]);
  });

  it("another user cannot remove or restore on someone else's playlist", async () => {
    const { h, a, subject } = await seed();
    const pid = (await a.post('/api/playlists/import', { url: urlS, subjectId: subject.id })).body.data.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    const b = h.as(h.newUser());
    expect((await b.post(`/api/playlists/${pid}/videos/remove`, { videoIds: [vids[0].id] })).status).toBe(404);
    expect((await b.post(`/api/playlists/${pid}/sync`, { restore: [idOf(1)] })).status).toBe(404);
    expect((await b.delete(`/api/playlists/${pid}/videos/${vids[0].id}`)).status).toBe(404);
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos).toHaveLength(5);
  });
});

describe('duplicate videos across the library', () => {
  const PLD = 'PLdupesdupes1';
  const urlD = `https://www.youtube.com/playlist?list=${PLD}`;
  const idOf = (n: number) => ytVideo(n).youtubeVideoId;

  it('preview flags videos already elsewhere in the library, and the default selection imports only the rest', async () => {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject } = await seedWorkspace(a);
    // two lectures already added manually, one in another playlist
    await a.post('/api/videos', { url: `https://youtu.be/${idOf(1)}`, title: 'Manual 1', subjectId: subject.id });
    await a.post('/api/videos', { url: `https://youtu.be/${idOf(2)}`, title: 'Manual 2', subjectId: subject.id });
    h.youtube.playlists.set('PLotherlist01', ytPlaylist('PLotherlist01', [ytVideo(3)]));
    await a.post('/api/playlists/import', { url: 'https://www.youtube.com/playlist?list=PLotherlist01', subjectId: subject.id });

    h.youtube.playlists.set(PLD, ytPlaylist(PLD, [1, 2, 3, 4, 5].map((n) => ytVideo(n))));
    const preview = (await a.post('/api/playlists/preview', { url: urlD })).body.data;
    expect(preview.duplicateVideoIds).toEqual([idOf(1), idOf(2), idOf(3)]);

    // what the dialog sends by default: everything except the duplicates
    const imp = await a.post('/api/playlists/import', { url: urlD, subjectId: subject.id, selectedVideoIds: [idOf(4), idOf(5)] });
    expect(imp.body.data).toMatchObject({ createdVideos: 2, skippedVideos: 3 });
    const pid = imp.body.data.playlist.id;
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos.map((v: any) => v.title)).toEqual(['Lecture 4', 'Lecture 5']);
    expect((await a.get('/api/videos')).body.data.total).toBe(5); // no duplicate records

    // re-previewing the same playlist doesn't flag its own videos
    const again = (await a.post('/api/playlists/preview', { url: urlD })).body.data;
    expect(again.duplicateVideoIds).toEqual([idOf(1), idOf(2), idOf(3)]);
    expect(again.excludedVideoIds.sort()).toEqual([idOf(1), idOf(2), idOf(3)].sort());
  });

  it('a playlist video later placed in another folder is flagged on re-import, and unticking takes it out of the playlist', async () => {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject, revision } = await seedWorkspace(a);
    h.youtube.playlists.set(PLD, ytPlaylist(PLD, [1, 2, 3].map((n) => ytVideo(n))));
    const pid = (await a.post('/api/playlists/import', { url: urlD, subjectId: subject.id })).body.data.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    // the student copies lecture 3 into a "Hard topics" folder
    expect((await a.post('/api/placements', { type: 'video', contentId: vids[2].id, subjectId: subject.id, folderId: revision.id })).status).toBe(201);

    const preview = (await a.post('/api/playlists/preview', { url: urlD })).body.data;
    expect(preview.duplicateVideoIds).toEqual([idOf(3)]);
    await a.post('/api/playlists/import', { url: urlD, subjectId: subject.id, selectedVideoIds: [idOf(1), idOf(2)] });
    const d = (await a.get(`/api/playlists/${pid}`)).body.data;
    expect(d.videos.map((v: any) => v.title)).toEqual(['Lecture 1', 'Lecture 2']);
    // still in the folder, once, and sync won't put it back in the playlist
    const folder = (await a.get(`/api/subjects/${subject.id}/contents?folderId=${revision.id}`)).body.data;
    expect(folder.videos.map((v: any) => v.title)).toEqual(['Lecture 3']);
    expect((await a.post(`/api/playlists/${pid}/sync`)).body.data).toMatchObject({ addedItems: 0 });
  });

  it('sync never drops existing playlist videos just because they are also placed elsewhere', async () => {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject, revision } = await seedWorkspace(a);
    h.youtube.playlists.set(PLD, ytPlaylist(PLD, [ytVideo(1), ytVideo(2)]));
    const pid = (await a.post('/api/playlists/import', { url: urlD, subjectId: subject.id })).body.data.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    await a.post('/api/placements', { type: 'video', contentId: vids[1].id, subjectId: subject.id, folderId: revision.id });
    expect((await a.post(`/api/playlists/${pid}/sync`)).body.data).toMatchObject({ removedFromSource: 0, skippedDuplicates: 0 });
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos).toHaveLength(2);
  });

  it('sync skips new videos that are already in the library and remembers them, restorable on request', async () => {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject } = await seedWorkspace(a);
    h.youtube.playlists.set(PLD, ytPlaylist(PLD, [ytVideo(1), ytVideo(2)]));
    const pid = (await a.post('/api/playlists/import', { url: urlD, subjectId: subject.id })).body.data.playlist.id;
    await a.post('/api/videos', { url: `https://youtu.be/${idOf(7)}`, title: 'Already have it', subjectId: subject.id });

    h.youtube.playlists.set(PLD, ytPlaylist(PLD, [1, 2, 6, 7].map((n) => ytVideo(n))));
    const s = (await a.post(`/api/playlists/${pid}/sync`)).body.data;
    expect(s).toMatchObject({ addedItems: 1, skippedDuplicates: 1 });
    const d = (await a.get(`/api/playlists/${pid}`)).body.data;
    expect(d.videos.map((v: any) => v.title)).toEqual(['Lecture 1', 'Lecture 2', 'Lecture 6']);
    expect(d.excludedVideos.map((e: any) => e.youtubeVideoId)).toEqual([idOf(7)]);

    // existing members are never treated as duplicates, and a restore brings the skipped one in
    const r = (await a.post(`/api/playlists/${pid}/sync`, { restore: [idOf(7)] })).body.data;
    expect(r).toMatchObject({ addedItems: 1, skippedDuplicates: 0 });
    expect((await a.get(`/api/playlists/${pid}`)).body.data.videos).toHaveLength(4);
    expect((await a.post(`/api/playlists/${pid}/sync`)).body.data).toMatchObject({ addedItems: 0, skippedDuplicates: 0 });
  });
});

describe('custom playlist order', () => {
  const PLO = 'PLorderorder1';
  const urlO = `https://www.youtube.com/playlist?list=${PLO}`;
  const titles = async (a: any, pid: string) => (await a.get(`/api/playlists/${pid}`)).body.data.videos.map((v: any) => v.title);

  async function seeded() {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject } = await seedWorkspace(a);
    h.youtube.playlists.set(PLO, ytPlaylist(PLO, [1, 2, 3, 4].map((n) => ytVideo(n))));
    const pid = (await a.post('/api/playlists/import', { url: urlO, subjectId: subject.id })).body.data.playlist.id;
    const vids = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    return { h, a, pid, ids: vids.map((v: any) => v.id) as string[] };
  }

  it('saves a new order, and sync keeps it while appending new videos and parking removed ones', async () => {
    const { h, a, pid, ids } = await seeded();
    expect((await a.put(`/api/playlists/${pid}/order`, { videoIds: [ids[3], ids[0], ids[2], ids[1]] })).status).toBe(200);
    expect(await titles(a, pid)).toEqual(['Lecture 4', 'Lecture 1', 'Lecture 3', 'Lecture 2']);
    expect((await a.get(`/api/playlists/${pid}`)).body.data.customOrder).toBe(true);

    // YouTube drops lecture 3 and adds lecture 5
    h.youtube.playlists.set(PLO, ytPlaylist(PLO, [1, 2, 4, 5].map((n) => ytVideo(n))));
    await a.post(`/api/playlists/${pid}/sync`);
    const after = (await a.get(`/api/playlists/${pid}`)).body.data.videos;
    expect(after.map((v: any) => [v.title, v.removedFromSource])).toEqual([
      ['Lecture 4', false],
      ['Lecture 1', false],
      ['Lecture 2', false],
      ['Lecture 5', false],
      ['Lecture 3', true],
    ]);
  });

  it('resetting goes back to YouTube order on the next sync', async () => {
    const { a, pid, ids } = await seeded();
    await a.put(`/api/playlists/${pid}/order`, { videoIds: [...ids].reverse() });
    expect((await a.delete(`/api/playlists/${pid}/order`)).status).toBe(200);
    await a.post(`/api/playlists/${pid}/sync`);
    expect(await titles(a, pid)).toEqual(['Lecture 1', 'Lecture 2', 'Lecture 3', 'Lecture 4']);
    expect((await a.get(`/api/playlists/${pid}`)).body.data.customOrder).toBe(false);
  });

  it('rejects stale or partial orders, and other users', async () => {
    const { h, a, pid, ids } = await seeded();
    expect((await a.put(`/api/playlists/${pid}/order`, { videoIds: ids.slice(0, 3) })).status).toBe(409);
    expect((await a.put(`/api/playlists/${pid}/order`, { videoIds: [...ids, ids[0]] })).status).toBe(409);
    expect((await a.put(`/api/playlists/${pid}/order`, { videoIds: [ids[0], ids[1], ids[2], 'someoneelse'] })).status).toBe(409);
    expect(await titles(a, pid)).toEqual(['Lecture 1', 'Lecture 2', 'Lecture 3', 'Lecture 4']);
    const other = h.as(h.newUser());
    expect((await other.put(`/api/playlists/${pid}/order`, { videoIds: [...ids].reverse() })).status).toBe(404);
    expect((await other.delete(`/api/playlists/${pid}/order`)).status).toBe(404);
  });

  it('works for local collections too', async () => {
    const h = makeHarness();
    const a = h.as(h.newUser());
    const { subject } = await seedWorkspace(a);
    const pl = (await a.post('/api/playlists', { title: 'Mine', subjectId: subject.id })).body.data;
    const v1 = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'One', playlistId: pl.id })).body.data;
    const v2 = (await a.post('/api/videos', { url: 'https://youtu.be/9bZkp7q19f0', title: 'Two', playlistId: pl.id })).body.data;
    await a.put(`/api/playlists/${pl.id}/order`, { videoIds: [v2.id, v1.id] });
    expect(await titles(a, pl.id)).toEqual(['Two', 'One']);
    expect((await a.delete(`/api/playlists/${pl.id}/order`)).status).toBe(422);
  });
});
