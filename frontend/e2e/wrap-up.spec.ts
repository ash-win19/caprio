import { test, expect, type Page } from '@playwright/test';
import { mockDay, date, tasksForDay, titles } from './fixtures/day';

const prompt = (page: Page) => page.getByRole('region', { name: 'Wrap up' });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Wrap up' });
const choice = (page: Page, title: string, option: 'Keep' | 'Drop') => sheet(page).getByRole('group', { name: title }).getByRole('radio', { name: option });
const remaining = (page: Page) => page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li');
const closes = (writes: Array<{ path: string; body: unknown }>) => writes.filter(write => write.path === '/api/day/close').map(write => write.body);

for (const state of ['planning', 'active', 'closed'] as const) {
  test(`the Wrap up prompt ${state === 'active' ? 'ends' : 'is not on'} Today on a ${state} Day`, async ({ page }) => {
    await mockDay(page, { state });
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Add a task to today' })).toBeVisible();
    if (state !== 'active') return expect(prompt(page)).toHaveCount(0);
    await expect(prompt(page)).toHaveText(/^Done for the day\? Wrap up is optional\. Unchecked tasks carry over on their own\.Wrap up$/);
  });
}

for (const width of [390, 1440]) {
  test(`Finish with the defaults keeps every unchecked task for the next Day at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const tasks = tasksForDay();
    tasks[0] = { ...tasks[0], completed: true, status: 'completed' };
    const writes = await mockDay(page, { tasks });
    await page.goto('/today');
    await prompt(page).getByRole('button', { name: 'Wrap up' }).click();

    // Only unchecked tasks are listed, and each starts on Keep.
    await expect(sheet(page).getByRole('group')).toHaveCount(2);
    for (const title of titles.slice(1)) {
      await expect(choice(page, title, 'Keep')).toBeChecked();
      await expect(choice(page, title, 'Drop')).not.toBeChecked();
    }
    await expect(sheet(page)).not.toContainText(titles[0]);
    await expect(sheet(page).getByRole('textbox', { name: 'Note for tomorrow' })).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`wrap-up-${width}.png`), animations: 'disabled' });

    await sheet(page).getByRole('button', { name: 'Finish' }).click();
    await expect(sheet(page)).toHaveCount(0);
    // 2026-09-14 is a Monday, so kept tasks carry to Tuesday.
    await expect(page.getByText('Wrapped up · 2 tasks carry to Tuesday', { exact: true })).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);
    expect(closes(writes)).toEqual([{ date, taskActions: [
      { taskId: 'task-0', action: 'done' }, { taskId: 'task-1', action: 'tomorrow' }, { taskId: 'task-2', action: 'tomorrow' },
    ] }]);
  });
}

test('Wrap up drops what you choose and saves a one-line note', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto('/today');
  await prompt(page).getByRole('button', { name: 'Wrap up' }).click();
  await choice(page, titles[1], 'Drop').check();
  await sheet(page).getByRole('textbox', { name: 'Note for tomorrow' }).fill('  Lab took twice as long as I guessed.  ');
  await sheet(page).getByRole('textbox', { name: 'Note for tomorrow' }).press('Enter');
  await expect(page.getByText('Wrapped up · 2 tasks carry to Tuesday', { exact: true })).toBeVisible();
  expect(closes(writes)).toEqual([{ date, notes: 'Lab took twice as long as I guessed.', taskActions: [
    { taskId: 'task-0', action: 'tomorrow' }, { taskId: 'task-1', action: 'drop' }, { taskId: 'task-2', action: 'tomorrow' },
  ] }]);
});

test('the wrapped line counts one task, and none, in plain words', async ({ page }) => {
  await mockDay(page, { tasks: tasksForDay().slice(0, 1) });
  await page.goto('/today');
  await prompt(page).getByRole('button', { name: 'Wrap up' }).click();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Wrapped up · 1 task carries to Tuesday', { exact: true })).toBeVisible();
});

test('a Day with nothing unchecked wraps up with just a note', async ({ page }) => {
  const writes = await mockDay(page, { tasks: tasksForDay().map(task => ({ ...task, completed: true, status: 'completed' })) });
  await page.goto('/today');
  await prompt(page).getByRole('button', { name: 'Wrap up' }).click();
  await expect(sheet(page).getByRole('group')).toHaveCount(0);
  await expect(sheet(page)).toContainText('Everything on today’s list is done.');
  await sheet(page).getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Wrapped up · nothing carries over', { exact: true })).toBeVisible();
  expect(closes(writes)).toHaveLength(1);
});

test('Not now leaves the Day as it was', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto('/today');
  await prompt(page).getByRole('button', { name: 'Wrap up' }).click();
  await choice(page, titles[0], 'Drop').check();
  await sheet(page).getByRole('button', { name: 'Not now' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(remaining(page)).toHaveCount(3);
  await expect(prompt(page)).toBeVisible();
  expect(writes).toEqual([]);
});

test('after Wrap up, quick add and the Conversation continue the Day', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto('/today');
  await prompt(page).getByRole('button', { name: 'Wrap up' }).click();
  await sheet(page).getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText(/^Wrapped up · /)).toBeVisible();
  // The kept tasks wait in Later under the next Day.
  await expect(page.locator('details.today-later summary')).toContainText('Later · 3');

  await expect(page.locator('.today-message-bar').getByRole('link')).toHaveAttribute('href', '/conversation');
  const quickAdd = page.getByRole('textbox', { name: 'Add a task to today' });
  await quickAdd.fill('One more thing');
  await quickAdd.press('Enter');
  await expect(remaining(page)).toHaveText([/One more thing/]);
  // The Day goes on, so Wrap up is offered again.
  await expect(page.getByText(/^Wrapped up · /)).toHaveCount(0);
  await expect(prompt(page)).toBeVisible();
  expect(writes.map(write => write.path)).toEqual(['/api/day/close', '/api/tasks']);
});

test('a wrapped-up Day never says "closed", on Today or in the Conversation', async ({ page }) => {
  await mockDay(page, { state: 'closed' });
  for (const route of ['/today', '/conversation']) {
    await page.goto(route);
    await expect(page.getByRole('navigation', { name: 'App' })).toBeVisible();
    await expect(page.getByText(/closed/i)).toHaveCount(0);
  }
  await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
  await expect(page.getByText('This Day is wrapped up. Add new work to continue it; what you finished stays recorded.', { exact: true })).toBeVisible();
});

test('the old Review route redirects to Today', async ({ page }) => {
  await mockDay(page);
  for (const route of ['/review', `/review?date=${date}`, '/review?date=2026-09-06&reopen=1']) {
    await page.goto(route);
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /review day/i })).toHaveCount(0);
});
