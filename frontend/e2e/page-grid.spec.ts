import { test, expect, type Page, type Locator } from '@playwright/test';
import { date, titles, tasksForDay, mockDay } from './fixtures/day';

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

for (const collapsed of [false, true]) {
  test(`the task list dominates Today with ${collapsed ? 'collapsed' : 'expanded'} navigation`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const writes = await mockDay(page, { collapsed });
    await page.goto('/today');
    const list = page.getByRole('list', { name: 'Remaining tasks' });
    await expect(list).toBeVisible();
    expect((await box(list)).width).toBeCloseTo((await box(page.locator('.today-page'))).width, 0);
    expect((await box(list)).width).toBeGreaterThan(900);
    expect((await box(list)).y).toBeLessThan(250);
    await expect(page.locator('main').getByRole('complementary')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Adjust plan', exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Something changed/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open inbox/ })).toHaveCount(0);
    const review = await box(page.locator('.today-review-entry'));
    const tasks = await box(list);
    expect(review.y).toBeGreaterThan(tasks.y + tasks.height);
    await noOverflow(page);
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath('today-desktop.png'), fullPage: true, animations: 'disabled' });
  });
}

for (const width of [320, 390, 768]) {
  test(`Today keeps tasks first and Review reachable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const tasks = tasksForDay();
    tasks[1].title = `Research ${'a'.repeat(120)}`;
    const writes = await mockDay(page, { tasks, collapsed: false });
    await page.goto('/today');
    await expect(page.getByRole('list', { name: 'Remaining tasks' })).toBeVisible();
    expect((await box(page.getByText(titles[0], { exact: true }))).y).toBeLessThan(300);
    expect((await box(page.getByText(tasks[1].title, { exact: true }))).y).toBeLessThan(700);
    const target = await box(page.getByRole('checkbox').first().locator('..'));
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`today-${width}.png`), fullPage: true, animations: 'disabled' });
    const review = page.getByRole('link', { name: 'Review day', exact: true });
    await review.scrollIntoViewIfNeeded();
    await review.focus();
    await expect(review).toBeFocused();
    if (width < 768) {
      const nav = await box(page.getByRole('navigation', { name: 'Mobile primary' }));
      const action = await box(review);
      expect(action.y + action.height).toBeLessThanOrEqual(nav.y);
    }
    await review.press('Enter');
    await expect(page).toHaveURL(`/review?date=${date}`);
    expect(writes).toEqual([]);
  });
}

for (const width of [320, 1440]) {
  test(`list and form routes retain shared header edges at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockDay(page);
    let left: number | undefined;
    let bodyLeft: number | undefined;
    for (const route of ['/today', '/capture', '/review', '/momentum', '/settings', '/settings/categories', '/settings/notifications', '/settings/voice']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const heading = await box(page.locator('.topbar-page'));
      left ??= heading.x;
      expect(heading.x, route).toBeCloseTo(left, 0);
      if (route !== '/today') {
        const body = await box(page.locator('.page-body'));
        bodyLeft ??= body.x;
        expect(body.x, route).toBeCloseTo(bodyLeft, 0);
        expect(body.width).toBeLessThanOrEqual(760);
      }
      await noOverflow(page);
    }
  });
}

for (const state of ['planning', 'active', 'closed'] as const) {
  test(`${state} empty day has a clear next step`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockDay(page, { state, tasks: [] });
    await page.goto(`/today?date=${date}`);
    const title = state === 'planning' ? 'Make room for what matters today' : state === 'active' ? 'Nothing planned for this day' : 'Day closed';
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Plan my day' })).toHaveCount(0);
    await noOverflow(page);
  });
}

test('completing and restoring a task preserves focus, progress and explicit review', async ({ page }, info) => {
  const writes = await mockDay(page);
  await page.goto('/today');
  const first = page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` });
  await first.focus();
  await first.press('Space');
  await expect(page.getByRole('checkbox', { name: `Mark ${titles[1]} complete` })).toBeFocused();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  const completed = page.locator('.today-completed');
  await expect(completed).not.toHaveAttribute('open');
  await completed.locator(':scope > summary').click();
  await page.getByRole('checkbox', { name: `Mark ${titles[0]} incomplete` }).click();
  await expect(page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` })).toBeFocused();
  for (const title of titles) await page.getByRole('checkbox', { name: `Mark ${title} complete` }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks are complete' })).toBeVisible();
  await expect(page.locator('.today-completed > summary')).toBeFocused();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  await expect(page).toHaveURL('/today');
  await expect(page.locator('.today-review-ready').getByRole('link', { name: 'Review day' })).toBeVisible();
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

for (const width of [390, 1440]) {
  test(`carried work stays in a separate expandable section at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 });
    const tasks = tasksForDay();
    tasks[0].title = 'Ship the conversational workflow';
    tasks[0].duration = 120;
    tasks[1].title = 'Fix Headlines publishing';
    tasks[1].deferCount = 1;
    tasks[1].duration = 120;
    tasks[2].title = 'Restore Headlines brand behavior';
    tasks[2].deferCount = 4;
    tasks[2].duration = 120;
    const writes = await mockDay(page, { tasks, carryoverOrigins: { 'task-1': '2026-09-13', 'task-2': '2026-09-10' } });
    await page.goto('/today');
    const carried = page.locator('.today-carried');
    await expect(carried).toBeVisible();
    await expect(carried).not.toHaveAttribute('open');
    await expect(carried.locator(':scope > summary')).toContainText('1 from yesterday · 1 from earlier days');
    await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator('li')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`carryovers-collapsed-${width}.png`), fullPage: true, animations: 'disabled' });
    await carried.locator(':scope > summary').click();
    await expect(page.getByRole('list', { name: 'Carried forward tasks' }).locator('li')).toHaveCount(2);
    await expect(carried).toContainText('Since Sep 10');
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`carryovers-expanded-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('checkbox', { name: 'Mark Fix Headlines publishing complete' }).click();
    await expect(page.getByRole('list', { name: 'Carried forward tasks' }).locator('li')).toHaveCount(1);
    await expect(carried.locator(':scope > summary')).toContainText('1 from earlier days');
    expect(writes.filter(write => write.path === '/api/tasks/task-1')).toHaveLength(1);
    await page.reload();
    await expect(carried.locator(':scope > summary')).toContainText('1 from earlier days');
    await expect(page.locator('.today-completed')).toContainText('Completed · 1');
  });
}

test('failed completion restores the task and keeps the failure visible', async ({ page }) => {
  await mockDay(page);
  await page.route('**/api/tasks/task-0', route => route.fulfill({ status: 400, json: { error: 'Could not save completion' } }));
  await page.goto('/today');
  const checkbox = page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` });
  await checkbox.click();
  await expect(page.getByRole('alert')).toContainText('Could not save completion');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeFocused();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('proposal and older recovery remain distinct from the daily review footer', async ({ page }) => {
  const writes = await mockDay(page, { oldestUnclosedDate: '2026-09-06', proposal: { id: 'proposal', summary: 'Adjusted plan', availableMinutes: 220, tasks: [] } });
  await page.goto('/today');
  await expect(page.getByRole('link', { name: 'Review proposal' })).toHaveAttribute('href', `/new?date=${date}`);
  await expect(page.getByRole('link', { name: 'Review day', exact: true })).toHaveAttribute('href', `/review?date=${date}`);
  const recovery = page.getByRole('link', { name: 'Review unfinished day' });
  await expect(recovery).toHaveAttribute('href', '/review?date=2026-09-06&reopen=1');
  expect((await box(recovery)).y).toBeGreaterThan((await box(page.locator('.today-review-entry'))).y);
  expect(writes).toEqual([]);
});

test('historical and future dates retain read-only controls and the planning shortcut still works on Today', async ({ page }) => {
  const writes = await mockDay(page);
  for (const value of ['2026-09-12', '2026-09-16']) {
    await page.goto(`/today?date=${value}`);
    await expect(page.getByRole('checkbox').first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Task actions/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Review day', exact: true })).toHaveCount(0);
  }
  await page.goto('/today');
  await page.keyboard.press('Control+Shift+Space');
  await expect(page).toHaveURL('/new');
  expect(writes).toEqual([]);
});

test('task notes disclose detail without changing state and large text still reflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await mockDay(page);
  await page.goto('/today');
  const first = page.getByRole('list', { name: 'Remaining tasks' }).locator('li').first();
  await expect(first.getByText('Protect a focused block of time for this priority.')).not.toBeVisible();
  await first.locator('summary').click();
  await expect(first.getByText('Protect a focused block of time for this priority.')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  expect(writes).toEqual([]);
});


test('mobile tasks offer a pointer reorder alternative and disclose missing estimates', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tasks = tasksForDay();
  tasks[0].duration = null;
  await mockDay(page, { tasks });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/tasks/reorder', async route => { await pending; await route.fallback(); });
  await page.goto('/today');
  await expect(page.locator('.today-capacity')).toContainText('180 min estimated remaining · 1 task without an estimate');
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

test('loading and failed plans preserve a retry path', async ({ page }) => {
  await mockDay(page);
  let fail = true;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/workflow?*', async route => {
    if (!fail) return route.fallback();
    await pending;
    await route.fulfill({ status: 400, json: { error: 'Could not load the plan' } });
  });
  await page.goto(`/today?date=${date}`);
  await expect(page.getByRole('status', { name: '', exact: true }).filter({ hasText: 'Loading your plan' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toHaveCount(0);
  release();
  // The application retries queries three times with backoff before showing failure.
  await expect(page.locator('.today-page').getByRole('alert')).toContainText('Could not load the plan', { timeout: 15000 });
  fail = false;
  await page.locator('.today-page').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toBeVisible();
});
