import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end student journey on the real UI + API + PostgreSQL.
 * Clerk is a test double and YouTube is a deterministic fake (see e2e/README note in the main README).
 */
const user = `e2e-${Date.now()}`;
const signInAs = async (page: Page, id: string) => {
  await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('e2e-user', v), id);
};
const dialog = (page: Page) => page.getByRole('dialog');

test.describe.serial('student journey', () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
  });
  test.afterAll(async () => page.context().close());

  test('signed-out visitors see the landing page and are sent to sign in for protected pages', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Your preparation\. Your pace\. Your progress\./ })).toBeVisible();
    await page.goto('/exams');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('sign in, skip onboarding with a clean dashboard', async () => {
    await page.goto('/sign-in');
    await page.getByLabel('User id').fill(user);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/onboarding/);
    await expect(page.getByRole('heading', { name: 'Welcome to PrepPilot' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByText(/Good (morning|afternoon|evening)|Hello/)).toBeVisible();
  });

  test('create exam CDS 2027 and its subjects', async () => {
    await page.goto('/exams');
    await page.getByRole('button', { name: /Create exam/ }).first().click();
    await dialog(page).getByLabel('Exam name').fill('CDS 2027');
    await dialog(page).getByRole('button', { name: /^(Create|Save)/ }).click();
    await expect(dialog(page)).toBeHidden();
    await page.getByRole('link', { name: /CDS 2027/ }).first().click();
    await expect(page.getByRole('heading', { name: 'CDS 2027' })).toBeVisible();
    for (const name of ['Mathematics', 'English']) {
      await page.getByRole('button', { name: /Add subject/ }).first().click();
      await dialog(page).getByLabel('Subject name').fill(name);
      await dialog(page).getByRole('button', { name: /^(Create|Add|Save)/ }).click();
      await expect(dialog(page)).toBeHidden();
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test('create Main Course and Revision folders under Mathematics', async () => {
    await page.getByRole('link', { name: /Mathematics/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Mathematics' }).first()).toBeVisible();
    for (const name of ['Main Course', 'Revision']) {
      await page.getByRole('button', { name: /New folder/ }).first().click();
      await dialog(page).getByLabel('Folder name').fill(name);
      await dialog(page).getByRole('button', { name: /^(Create|Save)/ }).click();
      await expect(dialog(page)).toBeHidden();
    }
    await expect(page.getByText('Main Course').first()).toBeVisible();
    await expect(page.getByText('Revision').first()).toBeVisible();
  });

  test('import a YouTube playlist into Main Course', async () => {
    await page.getByRole('link', { name: /Main Course/ }).first().click();
    await page.getByRole('button', { name: /Import playlist/ }).first().click();
    await dialog(page).getByLabel('YouTube link').or(dialog(page).getByRole('textbox').first()).first().fill('https://www.youtube.com/playlist?list=PLe2eplaylist01');
    await dialog(page).getByRole('button', { name: /Preview/ }).click();
    await expect(dialog(page).getByText('Algebra Foundations')).toBeVisible();
    await expect(dialog(page).getByText(/4 videos/).first()).toBeVisible();
    await dialog(page).getByRole('button', { name: /Import 4 videos/ }).click();
    await expect(page).toHaveURL(/\/playlists\//);
    await expect(page.getByRole('heading', { name: 'Algebra Foundations' })).toBeVisible();
    await expect(page.getByText('Quadratic Equations — Lecture 1').first()).toBeVisible();
  });

  test('add a single video to Revision', async () => {
    await page.goto('/exams');
    await page.getByRole('link', { name: /CDS 2027/ }).first().click();
    await page.getByRole('link', { name: /Mathematics/ }).first().click();
    await page.getByRole('link', { name: /Revision/ }).first().click();
    await page.getByRole('button', { name: /Add video/ }).first().click();
    await dialog(page).getByLabel('YouTube link').fill('https://youtu.be/dQw4w9WgXcQ');
    await dialog(page).getByRole('button', { name: /^Add/ }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByText('A single lecture').first()).toBeVisible();
  });

  test('open a lecture, mark it complete, and see progress everywhere', async () => {
    await page.getByRole('link', { name: 'A single lecture' }).first().click();
    await expect(page).toHaveURL(/\/watch\//);
    await expect(page.getByRole('button', { name: 'Mark complete' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Mark complete' }).first().click();
    await expect(page.getByRole('button', { name: 'Reopen' }).first()).toBeVisible();

    // dashboard reflects it (1 of 5 unique videos)
    await page.goto('/dashboard');
    await expect(page.getByText('20%').first()).toBeVisible();
    // survives a full reload
    await page.reload();
    await expect(page.getByText('20%').first()).toBeVisible();
  });

  test('plan a task for tomorrow, complete it, and see it on the dashboard', async () => {
    await page.goto('/planner');
    await page.getByRole('button', { name: /Add task|Plan/ }).first().click();
    await dialog(page).getByLabel('Task').or(dialog(page).getByLabel('Title')).first().fill('Revise quadratics');
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    await dialog(page).getByLabel('Date').fill(tomorrow);
    await dialog(page).getByRole('button', { name: /^(Create|Add|Save)/ }).click();
    await expect(dialog(page)).toBeHidden();
    await page.goto(`/planner?date=${tomorrow}`);
    const box = page.getByRole('checkbox', { name: /Revise quadratics/ });
    await box.click();
    await expect(box).toBeChecked();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /Revise quadratics/ })).toBeChecked();
  });

  test('switch to dark theme and keep it after refresh', async () => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^Theme/ }).click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto('/settings');
    await expect(page.getByRole('radio', { name: /Dark/ })).toBeChecked();
  });

  test('a second user cannot see or open the first user\'s data', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await signInAs(p2, `${user}-other`);
    await p2.goto('/exams');
    await expect(p2.getByText('CDS 2027')).toHaveCount(0);
    await p2.goto('/library');
    await expect(p2.getByText('A single lecture')).toHaveCount(0);
    // guess the first user's resource ids via the API using user 2's token: must be 404
    const exams = await page.evaluate(async (u) => (await (await fetch('/api/exams', { headers: { Authorization: `Bearer ${u}` } })).json()).data, user);
    const status = await p2.evaluate(async (id) => (await fetch(`/api/exams/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('e2e-user')}` } })).status, exams[0].id);
    expect(status).toBe(404);
    await ctx.close();
  });
});
