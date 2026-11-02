import { describe, expect, it } from 'vitest';
import { cleanupUsers, makeHarness } from './helpers.js';

const { as, newUser } = makeHarness();
cleanupUsers();

const link = (n: number, over = {}) => ({ title: `Link ${n}`, url: `https://example.gov.in/page-${n}`, category: 'OFFICIAL', ...over });
const test = (n: number, over = {}) => ({ title: `Full Mock #${n}`, url: `https://www.prephub.in/afcat/mock-test-${n}`, testType: 'FULL', maxScore: 300, durationMinutes: 120, marksCorrect: 3, marksWrong: -1, ...over });

async function examFor(a: ReturnType<typeof as>) {
  return (await a.post('/api/exams', { name: 'AFCAT 2027' })).body.data;
}

describe('exam resources', () => {
  it('bulk-adds links and tests in order, and lists them per exam', async () => {
    const a = as(newUser());
    const exam = await examFor(a);
    const empty = await a.get(`/api/exams/${exam.id}/resources`);
    expect(empty.body.data).toEqual({ links: [], tests: [] });

    const add = await a.post(`/api/exams/${exam.id}/resources`, { links: [link(1), link(2, { category: 'NOTES', pinned: true })], tests: [test(1), test(2, { testType: 'SECTIONAL', maxScore: 90, marksCorrect: null, marksWrong: null })] });
    expect(add.status).toBe(201);
    await a.post(`/api/exams/${exam.id}/resources`, { links: [link(3)] });

    const res = (await a.get(`/api/exams/${exam.id}/resources`)).body.data;
    expect(res.links.map((l: any) => [l.title, l.category, l.pinned, l.displayOrder])).toEqual([
      ['Link 1', 'OFFICIAL', false, 0],
      ['Link 2', 'NOTES', true, 1],
      ['Link 3', 'OFFICIAL', false, 2],
    ]);
    expect(res.tests[0]).toMatchObject({ title: 'Full Mock #1', testType: 'FULL', maxScore: 300, durationMinutes: 120, marksCorrect: 3, marksWrong: -1, attempts: [] });
    expect(res.tests[1]).toMatchObject({ testType: 'SECTIONAL', maxScore: 90, marksCorrect: null });

    // other exams don't see them
    const other = await examFor(a);
    expect((await a.get(`/api/exams/${other.id}/resources`)).body.data).toEqual({ links: [], tests: [] });
  });

  it('rejects unsafe or invalid input', async () => {
    const a = as(newUser());
    const exam = await examFor(a);
    const post = (body: unknown) => a.post(`/api/exams/${exam.id}/resources`, body);
    expect((await post({})).status).toBe(400); // nothing to add
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://files.example.com/x', 'not a url', 'https://localhost/x']) expect((await post({ links: [link(1, { url })] })).status, url).toBe(400);
    expect((await post({ links: [link(1, { title: '  ' })] })).status).toBe(400);
    expect((await post({ links: [link(1, { category: 'BOGUS' })] })).status).toBe(400);
    expect((await post({ tests: [test(1, { maxScore: 0 })] })).status).toBe(400);
    expect((await post({ tests: [test(1, { marksWrong: 1 })] })).status).toBe(400); // must be ≤ 0
    expect((await post({ links: Array.from({ length: 51 }, (_, i) => link(i)) })).status).toBe(400);
    // a bad item fails the whole batch
    expect((await post({ links: [link(1)], tests: [test(1, { url: 'javascript:x' })] })).status).toBe(400);
    expect((await a.get(`/api/exams/${exam.id}/resources`)).body.data.links).toHaveLength(0);
  });

  it('edits, pins and deletes links', async () => {
    const a = as(newUser());
    const exam = await examFor(a);
    const { links } = (await a.post(`/api/exams/${exam.id}/resources`, { links: [link(1)] })).body.data;
    const id = links[0].id;
    const pinned = await a.patch(`/api/links/${id}`, { pinned: true, title: 'Admit card', category: 'OFFICIAL' });
    expect(pinned.body.data).toMatchObject({ pinned: true, title: 'Admit card' });
    expect((await a.patch(`/api/links/${id}`, { url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await a.delete(`/api/links/${id}`)).status).toBe(200);
    expect((await a.get(`/api/exams/${exam.id}/resources`)).body.data.links).toHaveLength(0);
    expect((await a.delete(`/api/links/${id}`)).status).toBe(404);
  });

  it('logs attempts with negative and fractional scores, oldest first, and records activity', async () => {
    const a = as(newUser());
    const exam = await examFor(a);
    const t = (await a.post(`/api/exams/${exam.id}/resources`, { tests: [test(1)] })).body.data.tests[0];
    const second = await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 192.335, correct: 70, wrong: 18, skipped: 12, timeMinutes: 112, reflection: 'Better', attemptedOn: '2026-10-24' });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ score: 192.34, maxScore: 300, attemptedOn: '2026-10-24', reflection: 'Better' }); // max defaults to the test's
    await a.post(`/api/mock-tests/${t.id}/attempts`, { score: -4, attemptedOn: '2026-10-10' });

    const got = (await a.get(`/api/exams/${exam.id}/resources`)).body.data.tests[0].attempts;
    expect(got.map((x: any) => [x.score, x.attemptedOn])).toEqual([
      [-4, '2026-10-10'],
      [192.34, '2026-10-24'],
    ]);

    expect((await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 301, attemptedOn: '2026-10-25' })).status).toBe(400);
    expect((await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 10, attemptedOn: '2026-02-30' })).status).toBe(400);
    expect((await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 10, correct: -1, attemptedOn: '2026-10-25' })).status).toBe(400);

    const activity = (await a.get('/api/activity')).body.data;
    expect(activity[0]).toMatchObject({ type: 'MOCK_ATTEMPTED', metadata: { title: 'Full Mock #1', score: -4, maxScore: 300 } });
  });

  it('editing a test keeps past attempt scores; deleting cascades its attempts', async () => {
    const a = as(newUser());
    const exam = await examFor(a);
    const t = (await a.post(`/api/exams/${exam.id}/resources`, { tests: [test(1)] })).body.data.tests[0];
    const att = (await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 200, attemptedOn: '2026-10-24' })).body.data;
    const edited = (await a.patch(`/api/mock-tests/${t.id}`, { maxScore: 200, title: 'Renamed', marksCorrect: null, marksWrong: null })).body.data;
    expect(edited).toMatchObject({ title: 'Renamed', maxScore: 200, marksCorrect: null });
    expect(edited.attempts[0]).toMatchObject({ score: 200, maxScore: 300 }); // snapshot kept

    expect((await a.delete(`/api/mock-attempts/${att.id}`)).status).toBe(200);
    await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 150, attemptedOn: '2026-10-25' });
    expect((await a.delete(`/api/mock-tests/${t.id}`)).status).toBe(200);
    expect((await a.get(`/api/exams/${exam.id}/resources`)).body.data.tests).toHaveLength(0);
  });

  it('duplicating an exam copies links and tests but not attempts; deleting an exam removes them', async () => {
    const a = as(newUser());
    const exam = await examFor(a);
    const t = (await a.post(`/api/exams/${exam.id}/resources`, { links: [link(1, { pinned: true })], tests: [test(1)] })).body.data.tests[0];
    await a.post(`/api/mock-tests/${t.id}/attempts`, { score: 200, attemptedOn: '2026-10-24' });
    const dup = (await a.post(`/api/exams/${exam.id}/duplicate`)).body.data;
    const copy = (await a.get(`/api/exams/${dup.id}/resources`)).body.data;
    expect(copy.links).toMatchObject([{ title: 'Link 1', pinned: true }]);
    expect(copy.tests).toMatchObject([{ title: 'Full Mock #1', attempts: [] }]);
    expect(copy.tests[0].id).not.toBe(t.id);

    await a.delete(`/api/exams/${exam.id}`);
    expect((await a.get(`/api/exams/${exam.id}/resources`)).status).toBe(404);
    expect((await a.delete(`/api/mock-tests/${t.id}`)).status).toBe(404);
  });

  it("never exposes or changes another user's resources", async () => {
    const owner = as(newUser());
    const intruder = as(newUser());
    const exam = await examFor(owner);
    const { links, tests } = (await owner.post(`/api/exams/${exam.id}/resources`, { links: [link(1)], tests: [test(1)] })).body.data;
    const att = (await owner.post(`/api/mock-tests/${tests[0].id}/attempts`, { score: 100, attemptedOn: '2026-10-24' })).body.data;

    expect((await intruder.get(`/api/exams/${exam.id}/resources`)).status).toBe(404);
    expect((await intruder.post(`/api/exams/${exam.id}/resources`, { links: [link(2)] })).status).toBe(404);
    expect((await intruder.patch(`/api/links/${links[0].id}`, { pinned: true })).status).toBe(404);
    expect((await intruder.delete(`/api/links/${links[0].id}`)).status).toBe(404);
    expect((await intruder.patch(`/api/mock-tests/${tests[0].id}`, { title: 'x' })).status).toBe(404);
    expect((await intruder.post(`/api/mock-tests/${tests[0].id}/attempts`, { score: 1, attemptedOn: '2026-10-24' })).status).toBe(404);
    expect((await intruder.delete(`/api/mock-attempts/${att.id}`)).status).toBe(404);
    expect((await intruder.delete(`/api/mock-tests/${tests[0].id}`)).status).toBe(404);

    const still = (await owner.get(`/api/exams/${exam.id}/resources`)).body.data;
    expect(still.links[0].pinned).toBe(false);
    expect(still.tests[0].attempts).toHaveLength(1);
  });
});
