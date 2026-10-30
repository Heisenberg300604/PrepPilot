import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { parseOrigins } from '../src/config.js';
import { cleanupUsers, makeHarness, seedWorkspace } from './helpers.js';

const { app, as, newUser } = makeHarness();
cleanupUsers();

describe('authentication', () => {
  it('rejects signed-out requests on protected routes', async () => {
    for (const path of ['/api/exams', '/api/profile', '/api/videos', '/api/tasks', '/api/playlists', '/api/dashboard?today=2027-01-01']) {
      const res = await as(null).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
    expect((await as(null).post('/api/exams', { name: 'x' })).status).toBe(401);
  });

  it('keeps the health check public', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('provisions a profile on first authenticated request, without a webhook', async () => {
    const a = as(newUser());
    const res = await a.get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.body.data.dailyStudyTargetMinutes).toBe(120);
    expect(res.body.data.onboardingCompleted).toBe(false);
  });

  it('survives a burst of simultaneous first requests from a brand-new user', async () => {
    const a = as(newUser());
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => a.get(['/api/profile', '/api/exams', '/api/meta', '/api/tasks'][i % 4])));
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(200));
  });

  it('lets a user read and update their own profile preferences', async () => {
    const a = as(newUser());
    const res = await a.patch('/api/profile', { displayName: 'Asha', dailyStudyTargetMinutes: 90, preferredTheme: 'DARK', onboardingCompleted: true });
    expect(res.body.data).toMatchObject({ displayName: 'Asha', dailyStudyTargetMinutes: 90, preferredTheme: 'DARK', onboardingCompleted: true });
    expect((await a.patch('/api/profile', { dailyStudyTargetMinutes: -5 })).status).toBe(400);
  });
});

describe('cross-user isolation', () => {
  it('hides, blocks and protects User A data from User B', async () => {
    const A = as(newUser());
    const B = as(newUser());
    const { exam, subject, main } = await seedWorkspace(A);
    const video = (await A.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Mine', subjectId: subject.id, folderId: main.id })).body.data;
    const task = (await A.post('/api/tasks', { title: 'Private', scheduledDate: '2027-01-01', estimatedDurationMinutes: 30 })).body.data;

    // reads: listings are empty, direct reads look exactly like "not found"
    expect((await B.get('/api/exams')).body.data).toEqual([]);
    for (const url of [`/api/exams/${exam.id}`, `/api/subjects/${subject.id}`, `/api/videos/${video.id}`, `/api/subjects/${subject.id}/contents`]) {
      const res = await B.get(url);
      expect(res.status, url).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect((await B.get('/api/videos')).body.data.total).toBe(0);

    // writes
    expect((await B.patch(`/api/exams/${exam.id}`, { name: 'Hacked' })).status).toBe(404);
    expect((await B.patch(`/api/subjects/${subject.id}`, { name: 'Hacked' })).status).toBe(404);
    expect((await B.patch(`/api/tasks/${task.id}`, { status: 'DONE' })).status).toBe(404);
    expect((await B.put(`/api/videos/${video.id}/progress`, { status: 'COMPLETED' })).status).toBe(404);
    expect((await B.put(`/api/videos/${video.id}/note`, { content: 'x' })).status).toBe(404);
    expect((await B.put(`/api/videos/${video.id}/favorite`, { favorite: true })).status).toBe(404);

    // deletes
    expect((await B.delete(`/api/exams/${exam.id}`)).status).toBe(404);
    expect((await B.delete(`/api/folders/${main.id}`)).status).toBe(404);
    expect((await B.delete(`/api/videos/${video.id}?force=true`)).status).toBe(404);
    expect((await B.delete(`/api/tasks/${task.id}`)).status).toBe(404);

    // A's data is untouched
    expect((await A.get(`/api/exams/${exam.id}`)).body.data.name).toBe('CDS 2027');
    expect((await A.get(`/api/videos/${video.id}`)).status).toBe(200);
  });

  it('rejects nested resources that point at another user\'s chain', async () => {
    const A = as(newUser());
    const B = as(newUser());
    const a = await seedWorkspace(A);
    const b = await seedWorkspace(B, { exam: 'GATE', subject: 'Networks' });

    // B tries to create things inside A's exam / subject / folder
    expect((await B.post('/api/subjects', { examId: a.exam.id, name: 'x' })).status).toBe(404);
    expect((await B.post('/api/folders', { subjectId: a.subject.id, name: 'x' })).status).toBe(404);
    expect((await B.post('/api/folders', { subjectId: b.subject.id, parentFolderId: a.main.id, name: 'x' })).status).toBe(404);
    expect((await B.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'x', subjectId: a.subject.id })).status).toBe(404);
    expect((await B.post('/api/tasks', { title: 't', scheduledDate: '2027-01-01', estimatedDurationMinutes: 10, subjectId: a.subject.id })).status).toBe(404);

    // folder moves across users
    expect((await B.post(`/api/folders/${b.main.id}/move`, { parentFolderId: a.main.id })).status).toBe(404);
    expect((await B.post(`/api/folders/${b.main.id}/move`, { parentFolderId: null, subjectId: a.subject.id })).status).toBe(404);
    expect((await A.post(`/api/folders/${a.main.id}/move`, { parentFolderId: b.main.id })).status).toBe(404);

    // placing B's own video into A's subject
    const bv = (await B.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Bv' })).body.data;
    expect((await B.post('/api/placements', { type: 'video', contentId: bv.id, subjectId: a.subject.id })).status).toBe(404);
    // ...and A's content into nowhere
    expect((await A.post('/api/placements', { type: 'video', contentId: bv.id, subjectId: a.subject.id })).status).toBe(404);
  });

  it('validates input instead of trusting it', async () => {
    const A = as(newUser());
    expect((await A.post('/api/exams', { name: '' })).status).toBe(400);
    expect((await A.post('/api/exams', { name: 'x', userId: 'someone-else' })).body.data.name).toBe('x');
    const res = await A.get('/api/exams/%00');
    expect(res.status).toBe(400);
    expect((await A.post('/api/exams', { name: 'a\u0000b' })).status).toBe(400);
    const bad = await request(makeHarness().app).post('/api/exams').set('x-test-user', 'u').set('content-type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
  });
});

describe('CORS origin configuration', () => {
  it('tolerates trailing slashes, quotes, spaces and lists', () => {
    expect(parseOrigins('https://app.vercel.app/')).toEqual(['https://app.vercel.app']);
    expect(parseOrigins('"https://app.vercel.app"')).toEqual(['https://app.vercel.app']);
    expect(parseOrigins(" https://a.com/ , 'https://b.com' ,, ")).toEqual(['https://a.com', 'https://b.com']);
    expect(parseOrigins('')).toEqual([]);
  });

  it('answers the preflight for an allowed origin and refuses others', async () => {
    const { app } = makeHarness();
    const ok = await request(app).options('/api/exams').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'authorization');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await request(app).options('/api/exams').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
