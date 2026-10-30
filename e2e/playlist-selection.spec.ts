import { expect, test } from '@playwright/test';

/** Choosing which videos to keep: at import time, afterwards in bulk, and restoring. Real UI + API + Postgres. */
const user = `e2e-select-${Date.now()}`;
const h = { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' };

const playlistId = async (request: import('@playwright/test').APIRequestContext) =>
  (await (await request.get('http://localhost:4100/api/playlists', { headers: h })).json()).data[0].id as string;

test.describe.serial('selective playlist videos', () => {
  let subjectId = '';
  test.beforeAll(async ({ request }) => {
    await request.patch('http://localhost:4100/api/profile', { headers: h, data: { onboardingCompleted: true } });
    const exam = (await (await request.post('http://localhost:4100/api/exams', { headers: h, data: { name: 'CDS 2027' } })).json()).data;
    subjectId = (await (await request.post('http://localhost:4100/api/subjects', { headers: h, data: { examId: exam.id, name: 'Mathematics' } })).json()).data.id;
  });

  test('untick videos in the import preview and import only the rest', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((u) => localStorage.setItem('e2e-user', u), user);
    await page.goto(`/subjects/${subjectId}`);
    await page.getByRole('button', { name: /Import playlist/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('textbox').first().fill('https://www.youtube.com/playlist?list=PLe2eplaylist01');
    await dlg.getByRole('button', { name: 'Preview' }).click();
    await expect(dlg.getByText('4 of 4 selected')).toBeVisible();

    await dlg.getByLabel('Include Quadratic Equations — Lecture 2').uncheck();
    await dlg.getByLabel('Include Quadratic Equations — Lecture 4').uncheck();
    await expect(dlg.getByText('2 of 4 selected')).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Import 2 of 4 videos' })).toBeEnabled();

    // none selected -> cannot import
    await dlg.getByRole('button', { name: 'Select none' }).click();
    await expect(dlg.getByRole('button', { name: 'Select videos to import' })).toBeDisabled();
    await dlg.getByRole('button', { name: 'Select all' }).click();
    await dlg.getByLabel('Include Quadratic Equations — Lecture 2').uncheck();
    await dlg.getByLabel('Include Quadratic Equations — Lecture 4').uncheck();

    await dlg.getByRole('button', { name: 'Import 2 of 4 videos' }).click();
    await expect(page).toHaveURL(/\/playlists\//);
    await expect(page.getByText('Quadratic Equations — Lecture 1').first()).toBeVisible();
    await expect(page.getByText('Quadratic Equations — Lecture 3').first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Videos' }).getByText('Quadratic Equations — Lecture 2')).toHaveCount(0); // it is listed under "Removed videos" instead
    await expect(page.getByText('2 tracked')).toBeVisible();
    await expect(page.getByText(/Removed videos/)).toBeVisible();
  });

  test('restore a removed video from the Removed videos list', async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate((u) => localStorage.setItem('e2e-user', u), user);
    await page.goto(`/playlists/${await playlistId(request)}`);
    await page.getByText(/Removed videos/).click();
    await page.getByRole('button', { name: 'Restore Quadratic Equations — Lecture 2' }).click();
    await expect(page.getByText('3 tracked')).toBeVisible();
    await expect(page.getByText('Quadratic Equations — Lecture 2').first()).toBeVisible();
  });

  test('select several videos and remove them in one go, with a confirmation that explains what happens', async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate((u) => localStorage.setItem('e2e-user', u), user);
    await page.goto(`/playlists/${await playlistId(request)}`);
    await page.getByRole('button', { name: 'Select videos' }).click();
    await page.getByLabel('Select Quadratic Equations — Lecture 1').check();
    await page.getByLabel('Select Quadratic Equations — Lecture 3').check();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: /Remove from playlist/ }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByText(/syncing from YouTube will not add them back/i)).toBeVisible();
    await expect(dlg.getByText(/Nothing is changed on YouTube/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('1 tracked')).toBeVisible();
    await expect(page.getByText(/Removed videos/)).toBeVisible();
    // sync (fake YouTube returns all 4) must NOT bring the removed ones back
    await page.getByRole('button', { name: /Sync from YouTube/ }).click();
    await expect(page.getByText(/Synchronised/)).toBeVisible();
    await expect(page.getByText('1 tracked')).toBeVisible();
  });

  test('single remove from the row menu, and a signed-in stranger cannot touch the playlist', async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate((u) => localStorage.setItem('e2e-user', u), user);
    const list = (await (await request.get('http://localhost:4100/api/playlists', { headers: h })).json()).data;
    const pid = list[0].id;
    await page.goto(`/playlists/${pid}`);
    await page.getByRole('button', { name: /More actions/ }).first().click();
    await page.getByRole('menuitem', { name: 'Remove from this playlist' }).click();
    await expect(page.getByText(/Removed 1 video from this playlist/)).toBeVisible();
    await expect(page.getByText('0 tracked')).toBeVisible();
    const other = { Authorization: 'Bearer someone-else', 'Content-Type': 'application/json' };
    const res = await request.post(`http://localhost:4100/api/playlists/${pid}/videos/remove`, { headers: other, data: { videoIds: ['x'] } });
    expect(res.status()).toBe(404);
  });
});
