import { test, expect, type Page } from '@playwright/test';
import { mockDay, conversationDay, date, tasksForDay, planView, openPlan } from './fixtures/day';
import type { BackendTask } from '../src/lib/api';

const laterTasks = (): BackendTask[] => {
  const [base] = tasksForDay();
  return [
    { ...base, id: 'tomorrow', title: 'Study group', duration: 60, plannedForDate: '2026-09-15', status: 'planned', sortOrder: 0 },
    { ...base, id: 'far', title: 'Renew passport', duration: 30, plannedForDate: '2026-09-26', status: 'planned', sortOrder: 0 },
    { ...base, id: 'someday', title: 'Book a dentist appointment', duration: null, status: 'backlog', sortOrder: 0 },
  ];
};

const today = (page: Page) => page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li');
const section = (page: Page) => page.locator('details.today-later');
const laterRows = (page: Page) => page.getByRole('list', { name: 'Later tasks' }).locator(':scope > li');

for (const width of [390, 1440]) {
  test(`Later is one collapsed section for anything not on today's list at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockDay(page, { later: laterTasks() });
    await page.goto('/today');
    await expect(section(page)).not.toHaveAttribute('open', '');
    await expect(section(page).locator('summary')).toContainText('Later · 3');
    await expect(page.getByText('Study group')).not.toBeVisible();

    await section(page).locator('summary').click();
    await expect(laterRows(page)).toHaveCount(3);
    // Dated rows come first, labelled with their day; undated rows have no label.
    await expect(laterRows(page).nth(0)).toContainText('Study group');
    await expect(laterRows(page).nth(0).getByText('Tuesday', { exact: true })).toBeVisible();
    await expect(laterRows(page).nth(0)).toContainText('1h');
    await expect(laterRows(page).nth(1).getByText('Sat, Sep 26', { exact: true })).toBeVisible();
    await expect(laterRows(page).nth(2)).toHaveText(/^Book a dentist appointment/);
    await expect(laterRows(page).nth(2)).not.toContainText(/day|Sep/);
    // Later rows are parked work: nothing to tick off.
    await expect(laterRows(page).getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText(/Inbox/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath(`later-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('Later says when nothing is waiting', async ({ page }) => {
  await mockDay(page);
  await page.goto('/today');
  await expect(section(page).locator('summary')).toContainText('Later · 0');
  await section(page).locator('summary').click();
  await expect(section(page)).toContainText('Nothing waiting.');
});

test('Move to Later takes a task off today, undated', async ({ page }) => {
  const [first] = tasksForDay();
  const writes = await mockDay(page, { later: laterTasks() });
  await page.goto('/today');
  await expect(today(page)).toHaveCount(3);
  await page.getByRole('button', { name: `Task actions for ${first.title}` }).click();
  await page.getByRole('menuitem', { name: 'Move to Later' }).click();
  await expect(today(page)).toHaveCount(2);
  await expect(today(page).filter({ hasText: first.title })).toHaveCount(0);
  await expect(section(page).locator('summary')).toContainText('Later · 4');
  await expect(page.getByText('2 left · ~3h', { exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: `/api/tasks/${first.id}`, body: { status: 'backlog' } }]);
  await section(page).locator('summary').click();
  await expect(laterRows(page).last()).toContainText(first.title);
});

test('Move to today pulls a Later task onto today’s list', async ({ page }) => {
  const writes = await mockDay(page, { later: laterTasks() });
  await page.goto('/today');
  await section(page).locator('summary').click();
  await page.getByRole('button', { name: 'Task actions for Book a dentist appointment' }).click();
  await page.getByRole('menuitem', { name: 'Move to today' }).click();
  await expect(today(page)).toHaveCount(4);
  await expect(today(page).last()).toContainText('Book a dentist appointment');
  await expect(section(page).locator('summary')).toContainText('Later · 2');
  await expect(page.getByText('4 left · ~3h 40m', { exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: '/api/tasks/someday', body: { status: 'planned', plannedForDate: date } }]);
  // A dated task can be pulled in early the same way.
  await page.getByRole('button', { name: 'Task actions for Study group' }).click();
  await page.getByRole('menuitem', { name: 'Move to today' }).click();
  await expect(today(page)).toHaveCount(5);
  expect(writes[1]).toEqual({ path: '/api/tasks/tomorrow', body: { status: 'planned', plannedForDate: date } });
});

test('a failed move says why and leaves the task where it was', async ({ page }) => {
  const [first] = tasksForDay();
  await mockDay(page, { later: laterTasks() });
  await page.route(`**/api/tasks/${first.id}`, route => route.fulfill({ status: 400, json: { error: 'Could not move the task' } }));
  await page.goto('/today');
  await page.getByRole('button', { name: `Task actions for ${first.title}` }).click();
  await page.getByRole('menuitem', { name: 'Move to Later' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not move the task');
  await expect(today(page)).toHaveCount(3);
});

test('the old Inbox route leads to Today', async ({ page }) => {
  await mockDay(page);
  await page.goto('/capture');
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
});

test('a task the Draft sends to Later is in Later as soon as Confirm lands on Today', async ({ page }) => {
  const [first] = tasksForDay();
  const parked: BackendTask[] = [];
  const plan = planView([], { otherDays: [{ ref: first.id, taskId: first.id, title: first.title, badge: 'moved', inbox: true }] });
  await conversationDay(page, { state: 'active', plan }, []);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/day/plan/confirm') parked.push({ ...first, status: 'backlog' });
    if (url.pathname === '/api/tasks' && url.searchParams.get('status') === 'later') return route.fulfill({ json: { tasks: parked } });
    return route.fallback();
  });
  await page.goto('/today');
  await expect(section(page).locator('summary')).toContainText('Later · 0');
  await page.getByRole('link', { name: /Tell Caprio what changed/ }).click();
  await (await openPlan(page)).getByRole('button', { name: 'Confirm plan' }).click();
  await expect(page).toHaveURL('/today');
  await expect(section(page).locator('summary')).toContainText('Later · 1');
  await expect(today(page).filter({ hasText: first.title })).toHaveCount(0);
});

test('Later says so when its list can’t load, instead of claiming nothing is waiting', async ({ page }) => {
  await mockDay(page, { later: laterTasks() });
  let failing = true;
  await page.route('**/api/tasks?status=later**', route => failing ? route.fulfill({ status: 400, json: { error: 'Could not load Later.' } }) : route.fallback());
  await page.goto('/today');
  await expect(today(page)).toHaveCount(3);
  await section(page).locator('summary').click();
  await expect(section(page).getByRole('status')).toHaveText('Loading…');
  // The request is retried a few times before the error shows.
  await expect(section(page).getByRole('alert')).toContainText('Could not load Later.', { timeout: 20_000 });
  await expect(section(page).locator('summary')).not.toContainText('·');
  await expect(section(page)).not.toContainText('Nothing waiting.');

  failing = false;
  await section(page).getByRole('button', { name: 'Try again' }).click();
  await expect(section(page).locator('summary')).toContainText('Later · 3');
  await expect(laterRows(page)).toHaveCount(3);
});
