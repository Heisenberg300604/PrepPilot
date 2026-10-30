import { describe, expect, it } from 'vitest';
import { cleanupUsers, makeHarness, seedWorkspace } from './helpers.js';

const { as, newUser } = makeHarness();
cleanupUsers();

describe('study planner', () => {
  it('creates, updates, completes, reopens and deletes a task', async () => {
    const a = as(newUser());
    const { exam, subject, main } = await seedWorkspace(a);
    const created = await a.post('/api/tasks', { title: 'Watch lecture 12', scheduledDate: '2027-02-01', estimatedDurationMinutes: 45, examId: exam.id, subjectId: subject.id, folderId: main.id });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ title: 'Watch lecture 12', scheduledDate: '2027-02-01', status: 'TODO', estimatedDurationMinutes: 45 });
    expect(created.body.data.subject.name).toBe('Mathematics');
    const id = created.body.data.id;

    expect((await a.patch(`/api/tasks/${id}`, { title: 'Watch lecture 13', estimatedDurationMinutes: 50 })).body.data).toMatchObject({ title: 'Watch lecture 13', estimatedDurationMinutes: 50 });
    const done = (await a.patch(`/api/tasks/${id}`, { status: 'DONE' })).body.data;
    expect(done.status).toBe('DONE');
    expect(done.completedAt).toBeTruthy();
    expect((await a.get('/api/activity')).body.data.filter((x: any) => x.type === 'TASK_COMPLETED')).toHaveLength(1);
    const reopened = (await a.patch(`/api/tasks/${id}`, { status: 'TODO' })).body.data;
    expect(reopened).toMatchObject({ status: 'TODO', completedAt: null });
    expect((await a.delete(`/api/tasks/${id}`)).status).toBe(200);
    expect((await a.get('/api/tasks')).body.data).toEqual([]);
  });

  it('derives missing parents and rejects incompatible links', async () => {
    const a = as(newUser());
    const w1 = await seedWorkspace(a);
    const w2 = await seedWorkspace(a, { exam: 'GATE', subject: 'Networks' });
    const derived = (await a.post('/api/tasks', { title: 't', scheduledDate: '2027-02-01', estimatedDurationMinutes: 10, folderId: w1.main.id })).body.data;
    expect(derived.subject.id).toBe(w1.subject.id);
    expect(derived.exam.id).toBe(w1.exam.id);

    const base = { title: 't', scheduledDate: '2027-02-01', estimatedDurationMinutes: 10 };
    expect((await a.post('/api/tasks', { ...base, examId: w2.exam.id, subjectId: w1.subject.id })).status).toBe(422);
    expect((await a.post('/api/tasks', { ...base, subjectId: w2.subject.id, folderId: w1.main.id })).status).toBe(422);
    expect((await a.patch(`/api/tasks/${derived.id}`, { examId: w2.exam.id })).status).toBe(422);
    expect((await a.post('/api/tasks', { ...base, scheduledDate: '2027-13-45' })).status).toBe(400);
    expect((await a.post('/api/tasks', { ...base, scheduledDate: 'tomorrow' })).status).toBe(400);
    expect((await a.post('/api/tasks', { ...base, estimatedDurationMinutes: -5 })).status).toBe(400);
  });

  it('returns tasks for the right dates: today, upcoming and overdue', async () => {
    const a = as(newUser());
    const mk = (title: string, scheduledDate: string) => a.post('/api/tasks', { title, scheduledDate, estimatedDurationMinutes: 20 });
    await mk('yesterday', '2027-03-09');
    await mk('today', '2027-03-10');
    await mk('today-2', '2027-03-10');
    await mk('tomorrow', '2027-03-11');
    expect((await a.get('/api/tasks?from=2027-03-10&to=2027-03-10')).body.data.map((t: any) => t.title)).toEqual(['today', 'today-2']);
    expect((await a.get('/api/tasks?from=2027-03-11')).body.data.map((t: any) => t.title)).toEqual(['tomorrow']);
    expect((await a.get('/api/tasks?overdueBefore=2027-03-10')).body.data.map((t: any) => t.title)).toEqual(['yesterday']);
    const dash = (await a.get('/api/dashboard?today=2027-03-10')).body.data.today;
    expect(dash).toMatchObject({ plannedMinutes: 40, overdueCount: 1, upcomingCount: 1 });
    expect(dash.tasks).toHaveLength(2);
    // completed overdue tasks are no longer overdue
    const y = (await a.get('/api/tasks?overdueBefore=2027-03-10')).body.data[0];
    await a.patch(`/api/tasks/${y.id}`, { status: 'DONE' });
    expect((await a.get('/api/tasks?overdueBefore=2027-03-10')).body.data).toEqual([]);
  });

  it('tracks progress against the daily target using planned minutes of completed tasks', async () => {
    const a = as(newUser());
    await a.patch('/api/profile', { dailyStudyTargetMinutes: 100 });
    const t = (await a.post('/api/tasks', { title: 'x', scheduledDate: '2027-03-10', estimatedDurationMinutes: 50 })).body.data;
    await a.post('/api/tasks', { title: 'y', scheduledDate: '2027-03-10', estimatedDurationMinutes: 30 });
    await a.patch(`/api/tasks/${t.id}`, { status: 'DONE' });
    expect((await a.get('/api/dashboard?today=2027-03-10')).body.data.today).toMatchObject({ plannedMinutes: 80, completedPlannedMinutes: 50, targetMinutes: 100, targetPercent: 50 });
    await a.patch('/api/profile', { dailyStudyTargetMinutes: 0 });
    expect((await a.get('/api/dashboard?today=2027-03-10')).body.data.today.targetPercent).toBe(0);
  });

  it('keeps tasks (unlinked) when the linked exam is deleted', async () => {
    const a = as(newUser());
    const { exam } = await seedWorkspace(a);
    const t = (await a.post('/api/tasks', { title: 'keep', scheduledDate: '2027-03-10', estimatedDurationMinutes: 20, examId: exam.id })).body.data;
    await a.delete(`/api/exams/${exam.id}`);
    const tasks = (await a.get('/api/tasks')).body.data;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: t.id, exam: null });
  });
});
