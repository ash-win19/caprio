import { test, expect, type Page, type Locator } from '@playwright/test';
import { date, titles, tasksForDay, mockDay, planView } from './fixtures/day';

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('main').evaluate(main => [...main.querySelectorAll('*')]
    .filter(element => element.getClientRects().length && getComputedStyle(element).position !== 'fixed')
    .every(element => { const rect = element.getBoundingClientRect(); return rect.left >= -1 && rect.right <= innerWidth + 1; }))).toBe(true);
}

test('the task list dominates Today', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const writes = await mockDay(page);
  await page.goto('/today');
  const list = page.getByRole('list', { name: 'Remaining tasks' });
  await expect(list).toBeVisible();
  expect((await box(list)).width).toBeCloseTo((await box(page.locator('.today-page'))).width, 0);
  expect((await box(list)).width).toBeGreaterThan(900);
  // Below the app bar and the page header.
  expect((await box(list)).y).toBeLessThan(280);
  await expect(page.locator('main').getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Adjust plan', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tell Caprio what changed…' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Something changed/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open inbox/ })).toHaveCount(0);
  const wrapUp = await box(page.locator('.today-wrap-up'));
  const tasks = await box(list);
  expect(wrapUp.y).toBeGreaterThan(tasks.y + tasks.height);
  await noOverflow(page);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('today-desktop.png'), fullPage: true, animations: 'disabled' });
});

for (const width of [320, 390, 768]) {
  test(`Today keeps tasks first and Wrap up reachable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const tasks = tasksForDay();
    tasks[1].title = `Research ${'a'.repeat(120)}`;
    const writes = await mockDay(page, { tasks });
    await page.goto('/today');
    await expect(page.getByRole('list', { name: 'Remaining tasks' })).toBeVisible();
    // The app bar sits above the page header, where the bottom nav used to sit below the list.
    expect((await box(page.getByText(titles[0], { exact: true }))).y).toBeLessThan(360);
    expect((await box(page.getByText(tasks[1].title, { exact: true }))).y).toBeLessThan(700);
    const target = await box(page.getByRole('checkbox').first().locator('..'));
    // 44px targets; layout rounding can report a hair under on some machines.
    expect(Math.round(target.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(target.height)).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`today-${width}.png`), fullPage: true, animations: 'disabled' });
    const wrapUp = page.getByRole('button', { name: 'Wrap up', exact: true });
    await wrapUp.scrollIntoViewIfNeeded();
    await wrapUp.focus();
    await expect(wrapUp).toBeFocused();
    await wrapUp.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Wrap up' });
    await expect(sheet.getByRole('button', { name: 'Finish' })).toBeVisible();
    // Long titles wrap inside the sheet, and each choice is a full-size target.
    await noOverflow(page);
    const choice = await box(sheet.getByRole('radio', { name: 'Drop' }).first());
    expect(Math.round(choice.height)).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: info.outputPath(`wrap-up-sheet-${width}.png`), animations: 'disabled' });
    expect(writes).toEqual([]);
  });
}

for (const state of ['planning', 'active', 'closed'] as const) {
  test(`${state} empty day has a clear next step`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockDay(page, { state, tasks: [] });
    await page.goto('/today');
    await expect(page.getByText('Nothing on today’s list yet.', { exact: true })).toBeVisible();
    await expect(page.locator('.today-prompt')).toHaveCount(state === 'planning' ? 1 : 0);
    await expect(page.getByRole('textbox', { name: 'Add a task to today' })).toHaveCount(1);
    await expect(page.locator('.today-message-bar').getByRole('link')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plan my day' })).toHaveCount(0);
    await noOverflow(page);
  });
}

test('completing and restoring a task preserves focus and the count, and Wrap up stays optional', async ({ page }, info) => {
  const writes = await mockDay(page);
  await page.goto('/today');
  const first = page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` });
  await first.focus();
  await first.press('Space');
  await expect(page.getByRole('checkbox', { name: `Mark ${titles[1]} complete` })).toBeFocused();
  await expect(page.locator('.today-summary')).toHaveText('2 left · ~3h');
  const completed = page.locator('.today-done');
  await expect(completed).not.toHaveAttribute('open');
  await completed.locator(':scope > summary').click();
  await page.getByRole('checkbox', { name: `Mark ${titles[0]} incomplete` }).click();
  await expect(page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` })).toBeFocused();
  for (const title of titles) await page.getByRole('checkbox', { name: `Mark ${title} complete` }).click();
  await expect(page.locator('.today-done > summary')).toBeFocused();
  await expect(page.locator('.today-summary')).toHaveText('0 left');
  await expect(page.getByText('Nothing left for today.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('region', { name: 'Wrap up' }).getByRole('button', { name: 'Wrap up' })).toBeVisible();
  expect(writes).toHaveLength(5);
  expect(writes.every(write => write.path.startsWith('/api/tasks/task-'))).toBe(true);
  await page.screenshot({ path: info.outputPath('today-complete.png'), fullPage: true, animations: 'disabled' });
});

test('keyboard and pointer reordering preserve the displayed order of today tasks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tasks = tasksForDay();
  const writes = await mockDay(page, { tasks });
  await page.goto('/today');
  const rows = page.getByRole('list', { name: 'Remaining tasks' }).locator('li');
  await expect(rows.first()).toContainText(titles[0]);
  const handle = page.getByRole('button', { name: `Reorder ${titles[0]}` });
  await handle.focus();
  await handle.press('Space');
  await expect(page.locator('[role="status"][aria-live="assertive"]')).toContainText('over droppable area task-0');
  await handle.press('ArrowDown');
  await expect(page.locator('[role="status"][aria-live="assertive"]')).toContainText('over droppable area task-1');
  await handle.press('Space');
  await expect(rows.first()).toContainText(titles[1]);
  await expect(handle).toBeFocused();
  await page.getByRole('button', { name: `Task actions for ${titles[1]}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect(rows.first()).toContainText(titles[0]);
  await expect(page.getByRole('button', { name: `Task actions for ${titles[1]}` })).toBeFocused();
  await page.reload();
  await expect(rows.nth(1)).toContainText(titles[1]);
  expect(writes.filter(write => write.path === '/api/tasks/reorder')).toHaveLength(2);
});

test('failed completion restores the task and keeps the failure visible', async ({ page }) => {
  await mockDay(page);
  await page.route('**/api/tasks/task-0', route => route.fulfill({ status: 400, json: { error: 'Could not save completion' } }));
  await page.goto('/today');
  const checkbox = page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` });
  await checkbox.click();
  await expect(page.getByRole('alert')).toContainText('Could not save completion');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeFocused();
  await expect(page.locator('.today-summary')).toHaveText('3 left · ~3h 40m');
});

test('a waiting Draft comes before Wrap up, with no recovery notice', async ({ page }) => {
  const writes = await mockDay(page, { oldestUnclosedDate: '2026-09-06', plan: planView([{ ref: 'new:1', title: 'Adjusted work', badge: 'new', date }]) });
  await page.goto('/today');
  await expect(page.locator('.today-prompt').getByRole('link', { name: 'Review draft' })).toHaveAttribute('href', '/conversation');
  // Wrapping up would discard the Draft, so it isn't offered until the Draft is settled.
  await expect(page.getByRole('region', { name: 'Wrap up' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Review unfinished day' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('task notes disclose detail without changing state and large text still reflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tasks = tasksForDay();
  tasks[0].description = 'Bring the printed agenda.';
  const writes = await mockDay(page, { tasks });
  await page.goto('/today');
  const rows = page.getByRole('list', { name: 'Remaining tasks' }).locator('li');
  const first = rows.first();
  await expect(first.getByText('Bring the printed agenda.')).not.toBeVisible();
  await first.locator('summary').click();
  await expect(first.getByText('Bring the printed agenda.')).toBeVisible();
  // Old priority notes are not shown.
  await expect(rows.nth(1).locator('summary')).toHaveCount(0);
  await expect(page.getByText('Protect a focused block of time for this priority.')).toHaveCount(0);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  expect(writes).toEqual([]);
});


test('mobile tasks offer a pointer reorder alternative and total only the estimates given', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tasks = tasksForDay();
  tasks[0].duration = null;
  await mockDay(page, { tasks });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/tasks/reorder', async route => { await pending; await route.fallback(); });
  await page.goto('/today');
  await expect(page.locator('.today-summary')).toHaveText('3 left · ~3h');
  await expect(page.getByRole('button', { name: `Reorder ${titles[0]}` })).not.toBeVisible();
  await page.getByRole('button', { name: `Task actions for ${titles[0]}` }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator('li').nth(1)).toContainText(titles[0]);
  await expect(page.locator('#today-row-task-0')).toBeFocused();
  release();
  await expect(page.getByRole('button', { name: `Task actions for ${titles[0]}` })).toBeFocused();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('today-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('failed reorder restores the saved order', async ({ page }) => {
  await mockDay(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/tasks/reorder', async route => {
    await pending;
    await route.fulfill({ status: 400, json: { error: 'Could not save order' } });
  });
  await page.goto('/today');
  await page.getByRole('button', { name: `Task actions for ${titles[0]}` }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect(page.locator('#today-row-task-0')).toBeFocused();
  release();
  await expect(page.getByRole('alert')).toContainText('Could not save order');
  await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator('li').first()).toContainText(titles[0]);
  await expect(page.getByRole('button', { name: `Task actions for ${titles[0]}` })).toBeFocused();
});

test('a loading and a failed list keep a retry path', async ({ page }) => {
  await mockDay(page);
  let fail = true;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/tasks?*', async route => {
    if (!fail) return route.fallback();
    await pending;
    await route.fulfill({ status: 400, json: { error: 'Could not load the list' } });
  });
  await page.goto('/today');
  await expect(page.getByRole('status', { name: '', exact: true }).filter({ hasText: 'Loading your list' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toHaveCount(0);
  release();
  // The application retries queries three times with backoff before showing failure.
  await expect(page.locator('.today-page').getByRole('alert')).toContainText('Could not load the list', { timeout: 15000 });
  fail = false;
  await page.locator('.today-page').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toBeVisible();
});
