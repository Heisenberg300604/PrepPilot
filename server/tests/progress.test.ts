import { describe, expect, it } from 'vitest';
import { percent, statsFor } from '../src/services/stats.js';
import { cleanupUsers, makeHarness, seedWorkspace, ytPlaylist, ytVideo } from './helpers.js';

describe('stats helpers', () => {
  it('never yields NaN/Infinity and counts unique ids once', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(9, 3)).toBe(100);
    const s = statsFor(['a', 'a', 'b'], new Map([['a', 'COMPLETED'], ['b', 'IN_PROGRESS']]) as any);
    expect(s).toMatchObject({ total: 2, completed: 1, inProgress: 1, remaining: 1, percent: 50 });
    expect(statsFor([], new Map())).toMatchObject({ total: 0, percent: 0 });
  });
});

const { as, newUser, youtube } = makeHarness();
cleanupUsers();

async function addVideo(a: ReturnType<typeof as>, n: number, loc: Record<string, unknown>) {
  return (await a.post('/api/videos', { url: `https://youtu.be/vid0000000${n}`, title: `V${n}`, ...loc })).body.data;
}

describe('video progress', () => {
  it('marks complete, reopens, and keeps position separate from status', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    const v = await addVideo(a, 1, { subjectId: subject.id });
    expect(v.status).toBe('NOT_STARTED');

    const pos = await a.put(`/api/videos/${v.id}/progress`, { lastPositionSeconds: 125 });
    expect(pos.body.data).toMatchObject({ status: 'IN_PROGRESS', lastPositionSeconds: 125 });

    const done = await a.put(`/api/videos/${v.id}/progress`, { status: 'COMPLETED' });
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.completedAt).toBeTruthy();
    expect(done.body.data.lastPositionSeconds).toBe(125);

    // saving the position later must not undo completion
    const later = await a.put(`/api/videos/${v.id}/progress`, { lastPositionSeconds: 300 });
    expect(later.body.data).toMatchObject({ status: 'COMPLETED', lastPositionSeconds: 300 });

    const reopened = await a.put(`/api/videos/${v.id}/progress`, { status: 'IN_PROGRESS' });
    expect(reopened.body.data).toMatchObject({ status: 'IN_PROGRESS', completedAt: null, lastPositionSeconds: 300 });
    const reset = await a.put(`/api/videos/${v.id}/progress`, { status: 'NOT_STARTED' });
    expect(reset.body.data.status).toBe('NOT_STARTED');

    expect((await a.put(`/api/videos/${v.id}/progress`, { lastPositionSeconds: -1 })).status).toBe(400);
    expect((await a.put(`/api/videos/${v.id}/progress`, {})).status).toBe(400);
    expect((await a.put(`/api/videos/${v.id}/progress`, { status: 'DONE' })).status).toBe(400);
  });

  it('records one completion activity (no fabricated or duplicate events)', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    const v = await addVideo(a, 2, { subjectId: subject.id });
    expect((await a.get('/api/activity')).body.data.filter((x: any) => x.type === 'VIDEO_COMPLETED')).toHaveLength(0);
    await a.put(`/api/videos/${v.id}/progress`, { status: 'COMPLETED' });
    await a.put(`/api/videos/${v.id}/progress`, { status: 'COMPLETED' });
    expect((await a.get('/api/activity')).body.data.filter((x: any) => x.type === 'VIDEO_COMPLETED')).toHaveLength(1);
    // opening is throttled
    await a.post(`/api/videos/${v.id}/open`);
    await a.post(`/api/videos/${v.id}/open`);
    expect((await a.get('/api/activity')).body.data.filter((x: any) => x.type === 'VIDEO_OPENED')).toHaveLength(1);
  });

  it('saves and updates notes; toggles favorites idempotently', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    const v = await addVideo(a, 3, { subjectId: subject.id });
    expect((await a.get(`/api/videos/${v.id}`)).body.data.note).toBe('');
    await a.put(`/api/videos/${v.id}/note`, { content: 'first' });
    await a.put(`/api/videos/${v.id}/note`, { content: 'second' });
    expect((await a.get(`/api/videos/${v.id}`)).body.data.note).toBe('second');

    await a.put(`/api/videos/${v.id}/favorite`, { favorite: true });
    await a.put(`/api/videos/${v.id}/favorite`, { favorite: true });
    expect((await a.get('/api/videos?favorite=true')).body.data.total).toBe(1);
    await a.put(`/api/videos/${v.id}/favorite`, { favorite: false });
    expect((await a.get('/api/videos?favorite=true')).body.data.total).toBe(0);
  });
});

describe('progress aggregation', () => {
  it('calculates playlist, folder, subject and exam progress without double-counting', async () => {
    const a = as(newUser());
    const { exam, subject, main, revision } = await seedWorkspace(a);
    const PL = 'PLagg0000001';
    youtube.playlists.set(PL, ytPlaylist(PL, [ytVideo(1), ytVideo(2), ytVideo(3), ytVideo(4)]));
    const pl = (await a.post('/api/playlists/import', { url: `https://www.youtube.com/playlist?list=${PL}`, subjectId: subject.id, folderId: main.id })).body.data.playlist;
    // the same playlist is ALSO placed in Revision, and one of its videos is added by hand in Revision too
    await a.post('/api/placements', { type: 'playlist', contentId: pl.id, subjectId: subject.id, folderId: revision.id });
    const vids = (await a.get(`/api/playlists/${pl.id}`)).body.data.videos;
    await a.post('/api/videos', { url: `https://youtu.be/${vids[0].youtubeVideoId}`, subjectId: subject.id, folderId: revision.id });
    // plus one extra, unrelated manual video
    const extra = await addVideo(a, 9, { subjectId: subject.id });

    expect((await a.get(`/api/subjects/${subject.id}`)).body.data.stats).toMatchObject({ total: 5, completed: 0, percent: 0 });

    await a.put(`/api/videos/${vids[0].id}/progress`, { status: 'COMPLETED' });
    await a.put(`/api/videos/${vids[1].id}/progress`, { status: 'COMPLETED' });
    await a.put(`/api/videos/${vids[2].id}/progress`, { lastPositionSeconds: 30 });

    const playlist = (await a.get(`/api/playlists/${pl.id}`)).body.data;
    expect(playlist.stats).toMatchObject({ total: 4, completed: 2, inProgress: 1, remaining: 2, percent: 50 });
    expect((await a.get(`/api/subjects/${subject.id}`)).body.data.stats).toMatchObject({ total: 5, completed: 2, percent: 40 });
    expect((await a.get(`/api/exams/${exam.id}`)).body.data.stats).toMatchObject({ total: 5, completed: 2, percent: 40 });
    const folders = (await a.get(`/api/subjects/${subject.id}/folders`)).body.data;
    expect(folders.find((f: any) => f.name === 'Main Course').stats).toMatchObject({ total: 4, completed: 2 });
    expect(folders.find((f: any) => f.name === 'Revision').stats).toMatchObject({ total: 4, completed: 2 });

    // same progress seen wherever the video appears
    expect((await a.get(`/api/subjects/${subject.id}/contents?folderId=${revision.id}`)).body.data.videos[0].status).toBe('COMPLETED');

    await a.put(`/api/videos/${extra.id}/progress`, { status: 'COMPLETED' });
    await a.put(`/api/videos/${vids[0].id}/progress`, { status: 'NOT_STARTED' });
    expect((await a.get(`/api/exams/${exam.id}`)).body.data.stats).toMatchObject({ completed: 2 });
  });

  it('handles empty collections', async () => {
    const a = as(newUser());
    const { exam, subject, main } = await seedWorkspace(a);
    expect((await a.get(`/api/exams/${exam.id}`)).body.data.stats).toEqual({ total: 0, completed: 0, inProgress: 0, remaining: 0, percent: 0 });
    expect((await a.get(`/api/subjects/${subject.id}/folders`)).body.data.find((f: any) => f.id === main.id).stats.percent).toBe(0);
    const pl = (await a.post('/api/playlists', { title: 'Empty', subjectId: subject.id })).body.data;
    expect(pl.stats.percent).toBe(0);
  });

  it('clamps saved playback position to a known duration', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    youtube.playlists.set('PLclamp00001', ytPlaylist('PLclamp00001', [ytVideo(1, { durationSeconds: 100 })]));
    const pl = (await a.post('/api/playlists/import', { url: 'https://www.youtube.com/playlist?list=PLclamp00001', subjectId: subject.id })).body.data.playlist;
    const vid = (await a.get(`/api/playlists/${pl.id}`)).body.data.videos[0];
    expect((await a.put(`/api/videos/${vid.id}/progress`, { lastPositionSeconds: 5000 })).body.data.lastPositionSeconds).toBe(100);
  });
});

describe('library, search and dashboard', () => {
  it('filters, searches by hierarchy names, and lists each video once', async () => {
    const a = as(newUser());
    const { subject, main, revision } = await seedWorkspace(a);
    const v1 = await addVideo(a, 4, { subjectId: subject.id, folderId: main.id });
    await a.post('/api/placements', { type: 'video', contentId: v1.id, subjectId: subject.id, folderId: revision.id });
    const v2 = await addVideo(a, 5, { subjectId: subject.id, folderId: revision.id });
    await a.put(`/api/videos/${v1.id}/progress`, { status: 'COMPLETED' });
    await a.put(`/api/videos/${v2.id}/favorite`, { favorite: true });

    expect((await a.get('/api/videos')).body.data.total).toBe(2);
    expect((await a.get('/api/videos?status=COMPLETED')).body.data.items.map((x: any) => x.title)).toEqual(['V4']);
    expect((await a.get('/api/videos?status=NOT_STARTED')).body.data.items.map((x: any) => x.title)).toEqual(['V5']);
    expect((await a.get('/api/videos?favorite=true')).body.data.items[0].title).toBe('V5');
    expect((await a.get('/api/videos?q=revision')).body.data.total).toBe(2); // folder name
    expect((await a.get('/api/videos?q=mathematics')).body.data.total).toBe(2); // subject name
    expect((await a.get('/api/videos?q=cds')).body.data.total).toBe(2); // exam name
    expect((await a.get('/api/videos?q=nomatch')).body.data.total).toBe(0);
    expect((await a.get('/api/videos?sort=title')).body.data.items.map((x: any) => x.title)).toEqual(['V4', 'V5']);
    const search = (await a.get('/api/search?q=main')).body.data;
    expect(search.folders.map((f: any) => f.name)).toEqual(['Main Course']);
  });

  it('builds the dashboard from real data only', async () => {
    const a = as(newUser());
    const empty = (await a.get('/api/dashboard?today=2027-01-10')).body.data;
    expect(empty.overview).toMatchObject({ activeExams: 0, totalVideos: 0, completedVideos: 0, percent: 0, todayTasks: 0 });
    expect(empty.continueStudying).toEqual([]);
    expect((await a.get('/api/activity')).body.data).toEqual([]);

    const { exam, subject } = await seedWorkspace(a);
    const v1 = await addVideo(a, 6, { subjectId: subject.id });
    const v2 = await addVideo(a, 7, { subjectId: subject.id });
    await addVideo(a, 8, { subjectId: subject.id });
    await a.put(`/api/videos/${v1.id}/progress`, { status: 'COMPLETED' });
    await a.post(`/api/videos/${v2.id}/open`);
    await a.post('/api/tasks', { title: 'Do it', scheduledDate: '2027-01-10', estimatedDurationMinutes: 60, examId: exam.id });
    const d = (await a.get('/api/dashboard?today=2027-01-10')).body.data;
    expect(d.overview).toMatchObject({ activeExams: 1, totalVideos: 3, completedVideos: 1, remainingVideos: 2, percent: 33, todayTasks: 1 });
    expect(d.exams[0].stats.percent).toBe(33);
    expect(d.continueStudying.map((x: any) => x.title)).toEqual(['V7']);
    expect(d.continueStudying[0].location).toMatchObject({ examName: 'CDS 2027', subjectName: 'Mathematics' });
    expect(d.today).toMatchObject({ plannedMinutes: 60, completedPlannedMinutes: 0, targetMinutes: 120, targetPercent: 0 });

    // archiving removes an exam from the active overview
    await a.patch(`/api/exams/${exam.id}`, { status: 'ARCHIVED' });
    expect((await a.get('/api/dashboard?today=2027-01-10')).body.data.overview).toMatchObject({ activeExams: 0, totalVideos: 0 });
  });
});
