import { test, expect, type Page } from '@playwright/test';
import { conversationDay, mockDay, date, tasksForDay, planView } from './fixtures/day';

const list = (page: Page) => page.getByRole('list', { name: 'Remaining tasks' });
const rows = (page: Page) => list(page).locator(':scope > li');

for (const width of [390, 1440]) {
  test(`Today is a plain list with a header, quick add and a message bar at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const tasks = tasksForDay();
    tasks.push({ ...tasks[0], id: 'done', title: 'Already finished', completed: true, status: 'completed', sortOrder: 3 });
    await mockDay(page, { tasks, oldestUnclosedDate: '2026-09-06', plan: null });
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText('Monday, September 14', { exact: true })).toBeVisible();
    await expect(page.getByText('3 left · ~3h 40m', { exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Tell Caprio what changed…' })).toBeVisible();

    // Done work waits in a collapsed section.
    const done = page.locator('details').filter({ hasText: 'Done · 1' });
    await expect(done).not.toHaveAttribute('open', '');
    await expect(page.getByText('Already finished')).not.toBeVisible();

    // Nothing else competes for attention.
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Day navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Previous day|Next day|Choose day/ })).toHaveCount(0);
    await expect(page.getByText(/min estimated remaining|min available|without an estimate/)).toHaveCount(0);
    await expect(page.getByText(/waiting for your confirmation|These tasks are saved/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Review unfinished day' })).toHaveCount(0);
    await expect(page.getByText(/Carried forward|Uncategorized/)).toHaveCount(0);
    await expect(page.locator('.today-prompt')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`today-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('quick add saves a task to today right away', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto('/today');
  const add = page.getByRole('textbox', { name: 'Add a task to today' });
  await add.fill('  Call the bank  ');
  await add.press('Enter');
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).last()).toContainText('Call the bank');
  await expect(add).toHaveValue('');
  await expect(add).toBeFocused();
  await expect(page.getByText('4 left · ~3h 40m', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ path: '/api/tasks', body: { title: 'Call the bank', sortOrder: 3, status: 'planned', plannedForDate: date } });
  // An empty line adds nothing.
  await add.press('Enter');
  expect(writes).toHaveLength(1);
});

test('quick add lands below every task even when their positions have gaps', async ({ page }) => {
  // Rollover keeps each task's old position, so positions on a day can skip numbers.
  const tasks = tasksForDay().map((task, index) => ({ ...task, sortOrder: [0, 5, 9][index] }));
  const writes = await mockDay(page, { tasks });
  await page.goto('/today');
  const add = page.getByRole('textbox', { name: 'Add a task to today' });
  await add.fill('Call the bank');
  await add.press('Enter');
  await expect(rows(page)).toHaveCount(4);
  expect(writes[0].body).toMatchObject({ title: 'Call the bank', sortOrder: 10 });
});

test('a failed quick add keeps what was typed and says why', async ({ page }) => {
  await mockDay(page);
  await page.route('**/api/tasks', route => route.request().method() === 'POST' ? route.fulfill({ status: 400, json: { error: 'Could not save task' } }) : route.fallback());
  await page.goto('/today');
  const add = page.getByRole('textbox', { name: 'Add a task to today' });
  await add.fill('Call the bank');
  await add.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Could not save task');
  await expect(add).toHaveValue('Call the bank');
  await expect(rows(page)).toHaveCount(3);
});

test('carried tasks sit in the list with their age, and stale ones stand out', async ({ page }) => {
  const [a, b, c] = tasksForDay();
  const tasks = [a, { ...b, deferCount: 1 }, { ...c, deferCount: 4 }];
  await mockDay(page, { tasks, carryoverOrigins: { [b.id]: '2026-09-13', [c.id]: '2026-09-08' } });
  await page.goto('/today');
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).not.toContainText('carried');
  await expect(rows(page).nth(1).getByText('carried · 1d', { exact: true })).not.toHaveClass(/stale/);
  await expect(rows(page).nth(2).getByText('carried · 6d', { exact: true })).toHaveClass(/stale/);
  await expect(page.getByText('Carried forward')).toHaveCount(0);
  // Carried tasks reorder with the rest.
  await expect(rows(page).nth(2).getByRole('button', { name: `Reorder ${c.title}` })).toBeVisible();
});

test('an unplanned day prompts to plan, and the prompt opens the Conversation', async ({ page }) => {
  await mockDay(page, { state: 'planning' });
  await page.goto('/today');
  const prompt = page.locator('.today-prompt');
  await expect(prompt).toContainText('You haven’t planned today.');
  await expect(page.getByText('Your plan is drafted.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Plan your day with Caprio…' })).toBeVisible();
  await prompt.getByRole('link', { name: 'Plan with Caprio' }).click();
  await expect(page).toHaveURL('/conversation');
  await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
});

for (const state of ['planning', 'active'] as const) {
  test(`a waiting Draft is prompted first on a ${state} day, and opens the Conversation`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const plan = planView([{ ref: 'new:1', title: 'Call the bank', badge: 'new', date }, { ref: 'new:2', title: 'Ship slides', badge: 'new', date }]);
    await mockDay(page, { state, plan });
    await page.goto('/today');
    const prompt = page.locator('.today-prompt');
    await expect(prompt).toHaveCount(1);
    await expect(prompt).toContainText('Your plan is drafted. 2 changes are waiting for you.');
    await expect(page.getByText('You haven’t planned today.')).toHaveCount(0);
    await prompt.getByRole('link', { name: 'Review draft' }).click();
    await expect(page).toHaveURL('/conversation');
    await expect(page.getByRole('complementary', { name: 'Today’s plan' })).toContainText('Call the bank');
  });
}

test('a Draft with no changes left is still prompted, without a count', async ({ page }) => {
  await mockDay(page, { plan: planView(tasksForDay().map(task => ({ ref: task.id, taskId: task.id, title: task.title, date }))) });
  await page.goto('/today');
  await expect(page.locator('.today-prompt')).toHaveText(/^Your plan is drafted\. It’s waiting for you\.Review draft$/);
});

test('Skip to my list shows the drafted prompt when a Draft is waiting', async ({ page }) => {
  await conversationDay(page, { plan: planView([{ ref: 'new:1', title: 'Call the bank', badge: 'new', date }]) }, []);
  await page.goto('/');
  await page.getByRole('link', { name: 'Skip to my list', exact: true }).click();
  await expect(page).toHaveURL('/today');
  await expect(page.locator('.today-prompt')).toContainText('Your plan is drafted. 1 change is waiting for you.');
});

test('the message bar keeps its confirmed wording while the day loads', async ({ page }) => {
  await mockDay(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/workflow?*', async route => { await pending; await route.fallback(); });
  // A dated link to today skips the app-entry check, so the page loads the Day itself.
  await page.goto(`/today?date=${date}`);
  await expect(page.getByRole('status').filter({ hasText: 'Loading your list' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tell Caprio what changed…' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Plan your day with Caprio…' })).toHaveCount(0);
  release();
  await expect(rows(page)).toHaveCount(3);
});

for (const width of [390, 1440]) {
  test(`the message bar opens the Conversation and Back to Today returns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDay(page);
    await page.goto('/today');
    const bar = page.getByRole('link', { name: 'Tell Caprio what changed…' });
    await expect(bar).toBeInViewport();
    // The bar never covers the last row.
    await rows(page).last().scrollIntoViewIfNeeded();
    const [row, barBox] = await Promise.all([rows(page).last().boundingBox(), bar.boundingBox()]);
    expect(row!.y + row!.height).toBeLessThanOrEqual(barBox!.y + 1);
    await bar.click();
    await expect(page).toHaveURL('/conversation');
    await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
    await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
    await expect(page).toHaveURL('/today');
    await expect(list(page)).toBeVisible();
  });
}

test('a wrapped-up day shows its list without the closed-day summary', async ({ page }) => {
  await mockDay(page, { state: 'closed' });
  await page.goto('/today');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByText(/closed/i)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Add a task to today' })).toHaveCount(0);
});
