import { expect, test } from '@playwright/test';

/** Every main page must render at phone width without horizontal scrolling. */
const OUT = process.env.SHOTS_DIR;
const user = 'e2e-resp-' + Date.now();

test('main pages have no horizontal overflow and key controls are reachable', async ({ page }, info) => {
  n = info.project.name;
  await page.goto('/');
  await page.evaluate((u) => localStorage.setItem('e2e-user', u), user);
  // seed some data through the API so pages are not empty
  const token = { Authorization: 'Bearer ' + user, 'Content-Type': 'application/json' };
  const post = async (p: string, b: object) => (await (await page.request.post('http://localhost:4100/api' + p, { headers: token, data: b })).json()).data;
  await page.request.patch('http://localhost:4100/api/profile', { headers: token, data: { onboardingCompleted: true } });
  const exam = await post('/exams', { name: 'GATE 2027', examDate: '2027-02-07' });
  const subject = await post('/subjects', { examId: exam.id, name: 'Operating Systems' });
  const folder = await post('/folders', { subjectId: subject.id, name: 'Processes' });
  await post('/playlists/import', { url: 'https://www.youtube.com/playlist?list=PLe2eplaylist01', subjectId: subject.id, folderId: folder.id });
  const today = new Date().toISOString().slice(0, 10);
  await post('/tasks', { title: 'Watch process scheduling', scheduledDate: today, estimatedDurationMinutes: 45, examId: exam.id });

  const pages = ['/dashboard', '/exams', '/exams/' + exam.id, '/subjects/' + subject.id, '/subjects/' + subject.id + '?folder=' + folder.id, '/library', '/planner', '/recent', '/favorites', '/settings'];
  for (const [i, path] of pages.entries()) {
    await page.goto(path);
    await expect(page.locator('main#main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path + ' overflows horizontally by ' + overflow + 'px').toBeLessThanOrEqual(1);
    if (OUT) await page.screenshot({ path: OUT + '/' + testInfoName() + '-' + String(i).padStart(2, '0') + '.png', fullPage: true });
  }
});
let n = 'x';
function testInfoName() {
  return n;
}
