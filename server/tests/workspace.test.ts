import { describe, expect, it } from 'vitest';
import { cleanupUsers, makeHarness, seedWorkspace } from './helpers.js';

const { as, newUser } = makeHarness();
cleanupUsers();

describe('exams and subjects', () => {
  it('creates, updates, archives, restores, completes and deletes an exam', async () => {
    const a = as(newUser());
    const created = await a.post('/api/exams', { name: 'CDS 2027', description: 'Defence', examDate: '2027-04-11' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data).toMatchObject({ name: 'CDS 2027', examDate: '2027-04-11', status: 'ACTIVE', subjectCount: 0 });
    expect(created.body.data.stats).toMatchObject({ total: 0, percent: 0 }); // empty => 0%, never NaN

    expect((await a.patch(`/api/exams/${id}`, { name: 'CDS 2028', status: 'ARCHIVED' })).body.data).toMatchObject({ name: 'CDS 2028', status: 'ARCHIVED' });
    expect((await a.get('/api/exams?status=ACTIVE')).body.data).toHaveLength(0);
    expect((await a.patch(`/api/exams/${id}`, { status: 'ACTIVE' })).body.data.status).toBe('ACTIVE');
    expect((await a.patch(`/api/exams/${id}`, { status: 'COMPLETED' })).body.data.status).toBe('COMPLETED');
    expect((await a.delete(`/api/exams/${id}`)).status).toBe(200);
    expect((await a.get(`/api/exams/${id}`)).status).toBe(404);
  });

  it('deleting an exam removes structure but keeps videos and their progress', async () => {
    const a = as(newUser());
    const { exam, subject } = await seedWorkspace(a);
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Keep me', subjectId: subject.id })).body.data;
    await a.put(`/api/videos/${v.id}/progress`, { status: 'COMPLETED' });
    const detail = (await a.get(`/api/exams/${exam.id}`)).body.data;
    expect(detail.impact).toMatchObject({ subjects: 1, folders: 2, videoPlacements: 1 });
    await a.delete(`/api/exams/${exam.id}`);
    const after = (await a.get(`/api/videos/${v.id}`)).body.data;
    expect(after.status).toBe('COMPLETED');
    expect(after.placements).toHaveLength(0);
  });

  it('creates subjects, reorders them and duplicates exam structure', async () => {
    const a = as(newUser());
    const { exam, subject } = await seedWorkspace(a);
    const eng = (await a.post('/api/subjects', { examId: exam.id, name: 'English' })).body.data;
    await a.post('/api/subjects/reorder', { examId: exam.id, ids: [eng.id, subject.id] });
    const list = (await a.get(`/api/subjects?examId=${exam.id}`)).body.data;
    expect(list.map((s: any) => s.name)).toEqual(['English', 'Mathematics']);
    expect(list[1].folderCount).toBe(2);
    const dup = (await a.post(`/api/exams/${exam.id}/duplicate`)).body.data;
    expect(dup.name).toBe('CDS 2027 (copy)');
    const copied = (await a.get(`/api/subjects?examId=${dup.id}`)).body.data;
    expect(copied).toHaveLength(2);
    expect(copied.find((s: any) => s.name === 'Mathematics').folderCount).toBe(2);
  });

  it('moves a subject to another exam keeping placements consistent', async () => {
    const a = as(newUser());
    const { subject } = await seedWorkspace(a);
    const other = (await a.post('/api/exams', { name: 'GATE' })).body.data;
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'V', subjectId: subject.id })).body.data;
    await a.patch(`/api/subjects/${subject.id}`, { examId: other.id });
    expect((await a.get(`/api/videos/${v.id}`)).body.data.placements[0].examName).toBe('GATE');
    expect((await a.get(`/api/exams/${other.id}`)).body.data.stats.total).toBe(1);
  });
});

describe('folders', () => {
  it('creates nested folders and returns a breadcrumb', async () => {
    const a = as(newUser());
    const { subject, main } = await seedWorkspace(a);
    const algebra = (await a.post('/api/folders', { subjectId: subject.id, parentFolderId: main.id, name: 'Algebra' })).body.data;
    const quad = (await a.post('/api/folders', { subjectId: subject.id, parentFolderId: algebra.id, name: 'Quadratics' })).body.data;
    const contents = (await a.get(`/api/subjects/${subject.id}/contents?folderId=${quad.id}`)).body.data;
    expect(contents.breadcrumb.map((b: any) => b.name)).toEqual(['Main Course', 'Algebra', 'Quadratics']);
    const root = (await a.get(`/api/subjects/${subject.id}/contents`)).body.data;
    expect(root.folders.map((f: any) => f.name)).toEqual(['Main Course', 'Revision']);
    expect(root.folders[0].childFolderCount).toBe(1);
  });

  it('moves folders, and refuses to move one into itself or a descendant', async () => {
    const a = as(newUser());
    const { subject, main, revision } = await seedWorkspace(a);
    const child = (await a.post('/api/folders', { subjectId: subject.id, parentFolderId: main.id, name: 'Child' })).body.data;
    const grand = (await a.post('/api/folders', { subjectId: subject.id, parentFolderId: child.id, name: 'Grand' })).body.data;

    const self = await a.post(`/api/folders/${main.id}/move`, { parentFolderId: main.id });
    expect(self.status).toBe(400);
    expect(self.body.error.message).toMatch(/into itself/);
    const desc = await a.post(`/api/folders/${main.id}/move`, { parentFolderId: grand.id });
    expect(desc.status).toBe(400);
    expect(desc.body.error.message).toMatch(/sub-folders/);

    const ok = await a.post(`/api/folders/${child.id}/move`, { parentFolderId: revision.id });
    expect(ok.status).toBe(200);
    const rev = (await a.get(`/api/subjects/${subject.id}/contents?folderId=${revision.id}`)).body.data;
    expect(rev.folders.map((f: any) => f.name)).toEqual(['Child']);
    // grandchild travelled with its parent
    expect((await a.get(`/api/subjects/${subject.id}/contents?folderId=${grand.id}`)).body.data.breadcrumb.map((b: any) => b.name)).toEqual(['Revision', 'Child', 'Grand']);
  });

  it('rejects a parent folder from a different subject and moves between subjects together with content', async () => {
    const a = as(newUser());
    const { exam, subject, main } = await seedWorkspace(a);
    const eng = (await a.post('/api/subjects', { examId: exam.id, name: 'English' })).body.data;
    const engFolder = (await a.post('/api/folders', { subjectId: eng.id, name: 'Grammar' })).body.data;
    expect((await a.post('/api/folders', { subjectId: subject.id, parentFolderId: engFolder.id, name: 'x' })).status).toBe(422);
    expect((await a.post(`/api/folders/${main.id}/move`, { parentFolderId: engFolder.id })).status).toBe(422);

    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'V', subjectId: subject.id, folderId: main.id })).body.data;
    await a.post(`/api/folders/${main.id}/move`, { parentFolderId: engFolder.id, subjectId: eng.id });
    const loc = (await a.get(`/api/videos/${v.id}`)).body.data.placements[0];
    expect(loc).toMatchObject({ subjectName: 'English', folderPath: ['Grammar', 'Main Course'] });
  });

  it('deleting a folder keeps the videos that lived in it', async () => {
    const a = as(newUser());
    const { subject, main } = await seedWorkspace(a);
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'V', subjectId: subject.id, folderId: main.id })).body.data;
    await a.delete(`/api/folders/${main.id}`);
    expect((await a.get(`/api/videos/${v.id}`)).status).toBe(200);
    expect((await a.get('/api/videos?unfiled=true')).body.data.total).toBe(1);
  });

  it('moves, copies and removes placements without touching the underlying video', async () => {
    const a = as(newUser());
    const { subject, main, revision } = await seedWorkspace(a);
    const v = (await a.post('/api/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Shared', subjectId: subject.id, folderId: main.id })).body.data;
    // same video in a second place: one record, two placements, counted once
    const p2 = (await a.post('/api/placements', { type: 'video', contentId: v.id, subjectId: subject.id, folderId: revision.id })).body.data;
    expect((await a.get(`/api/subjects/${subject.id}`)).body.data.stats.total).toBe(1);
    expect((await a.get(`/api/videos/${v.id}`)).body.data.placements).toHaveLength(2);
    // idempotent
    expect((await a.post('/api/placements', { type: 'video', contentId: v.id, subjectId: subject.id, folderId: revision.id })).status).toBe(200);
    // removing one placement keeps the other and the video
    expect((await a.delete(`/api/placements/video/${p2.id}`)).status).toBe(200);
    expect((await a.get(`/api/videos/${v.id}`)).body.data.placements).toHaveLength(1);
    // moving onto an existing location merges instead of duplicating
    const only = (await a.get(`/api/videos/${v.id}`)).body.data.placements[0];
    const moved = await a.post(`/api/placements/video/${only.id}/move`, { subjectId: subject.id, folderId: revision.id });
    expect(moved.status).toBe(200);
    expect((await a.get(`/api/videos/${v.id}`)).body.data.placements[0].folderPath).toEqual(['Revision']);
  });
});
