import { test, expect, type Page, type Locator } from '@playwright/test';

import { date, titles, tasksForDay, mockDay } from './fixtures/day';

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

// Compare geometry in one frame so entrance motion cannot skew two reads.
async function verticalGap(page: Page, first: string, second: string, stacked = false) {
  return page.evaluate(({ first, second, stacked }) => {
    const a = document.querySelector(first)!.getBoundingClientRect();
    const b = document.querySelector(second)!.getBoundingClientRect();
    return b.y - a.y - (stacked ? a.height : 0);
  }, { first, second, stacked });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await page.locator('main').evaluate((main) => [...main.querySelectorAll('*')]
    .filter((element) => element.getClientRects().length && getComputedStyle(element).position !== 'fixed')
    .map((element) => element.getBoundingClientRect())
    .every((rect) => rect.left >= -1 && rect.right <= innerWidth + 1));
  expect(bounds).toBe(true);
}

for (const collapsed of [false, true]) {
  test(`desktop card alignment with ${collapsed ? 'collapsed' : 'expanded'} navigation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockDay(page, { collapsed });
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Your day at a glance' })).toBeVisible();
    const task = await box(page.locator('.task-stack > div').first());
    const cards = await page.locator('.overview-card').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom, inset: style.paddingLeft, background: style.backgroundColor };
    }));
    expect(cards).toHaveLength(3);
    await expect.poll(() => verticalGap(page, '.task-stack > div', '.overview-card')).toBeCloseTo(0, 0);
    expect(cards[0].x - task.x - task.width).toBeCloseTo(24, 0);
    for (const [index, card] of cards.entries()) {
      expect(card.x).toBeCloseTo(cards[0].x, 0);
      expect(card.width).toBeCloseTo(cards[0].width, 0);
      expect(card.inset).toBe('20px');
      expect(card.background).toBe(cards[0].background);
      if (index > 0) expect(card.y - cards[index - 1].bottom).toBeCloseTo(16, 0);
    }
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('today-desktop.png'), fullPage: true });
  });
}

test('the grid responds to sidebar width at the same viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await mockDay(page);
  await page.goto('/today');
  const rail = page.getByRole('complementary', { name: 'Day overview' });
  await expect(rail).toBeVisible();
  await expect.poll(() => verticalGap(page, '.dashboard-main', '.dashboard-aside')).toBeCloseTo(0, 0);
  await page.getByRole('button', { name: /Expand sidebar/ }).click();
  await expect.poll(() => verticalGap(page, '.dashboard-main', '.dashboard-aside', true)).toBeCloseTo(24, 0);
  await noOverflow(page);
});

for (const width of [320, 390, 768]) {
  test(`Today reflows at ${width}px with long text and reachable bottom controls`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const tasks = tasksForDay();
    tasks[1].title = `Research ${'a'.repeat(120)}`;
    await mockDay(page, { tasks, collapsed: false });
    await page.goto('/today');
    const rail = page.getByRole('complementary', { name: 'Day overview' });
    await expect(rail).toBeVisible();
    await expect.poll(() => verticalGap(page, '.dashboard-main', '.dashboard-aside', true)).toBeCloseTo(24, 0);
    await noOverflow(page);
    const inbox = rail.getByRole('link', { name: /Open inbox/ });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const inboxBox = await box(inbox);
    const floating = await box(page.getByRole('button', { name: 'Plan my day', exact: true }));
    expect(inboxBox.y + inboxBox.height).toBeLessThan(floating.y);
    await inbox.focus();
    await expect(inbox).toBeFocused();
    expect(await inbox.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true });
    await inbox.press('Enter');
    await expect(page).toHaveURL(/\/capture$/);
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  });
}

for (const width of [320, 1440]) {
test(`list and form routes share page edges at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockDay(page);
  let left: number | undefined;
  let bodyLeft: number | undefined;
  for (const route of ['/today', '/capture', '/review', '/momentum', '/settings', '/settings/categories', '/settings/notifications', '/settings/voice']) {
    await page.goto(route);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const headingBox = await box(page.locator('.topbar-page'));
    left ??= headingBox.x;
    expect(headingBox.x, route).toBeCloseTo(left, 0);
    const body = await box(page.locator(route === '/today' ? '.dashboard-main' : '.page-body'));
    bodyLeft ??= body.x;
    expect(body.x, route).toBeCloseTo(bodyLeft, 0);
    expect(body.width).toBeLessThanOrEqual(760);
    await noOverflow(page);
  }
});
}

for (const state of ['planning', 'active', 'closed'] as const) {
  test(`${state} empty state occupies its own full row`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockDay(page, { state, tasks: [] });
    await page.goto('/today');
    const title = state === 'planning' ? 'Make room for what matters today' : state === 'active' ? 'Nothing planned for this day' : 'Day closed';
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Day overview' })).toHaveCount(0);
    await noOverflow(page);
  });
}

test('carried, completed, and proposed tasks preserve the first row alignment', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const tasks = tasksForDay();
  tasks[0].deferCount = 1;
  tasks[2].completed = true;
  await mockDay(page, { tasks, proposal: { id: 'proposal', summary: 'An adjusted plan', availableMinutes: 220, tasks: [] } });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Carried over · 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Completed · 1' })).toBeVisible();
  await expect.poll(() => verticalGap(page, '.task-stack > div', '.overview-card')).toBeCloseTo(0, 0);
  await expect.poll(() => verticalGap(page, '.page-notice', '.page-notice + .page-notice', true)).toBeCloseTo(24, 0);
  await expect(page.getByRole('progressbar', { name: 'Tasks completed' })).toHaveAttribute('aria-valuenow', '1');
  await noOverflow(page);
});

test('completion and keyboard reordering still send the expected updates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const writes = await mockDay(page);
  await page.goto('/today');
  const handle = page.getByRole('button', { name: `Reorder ${titles[0]}` });
  await handle.focus();
  await handle.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await handle.press('ArrowDown');
  await expect(page.locator('[role="status"][aria-live="assertive"]')).toContainText('over droppable area task-1');
  await handle.press('Space');
  await expect.poll(() => writes.find((write) => write.path === '/api/tasks/reorder')?.body).toEqual({ tasks: [
    { id: 'task-1', sortOrder: 0 }, { id: 'task-0', sortOrder: 1 }, { id: 'task-2', sortOrder: 2 },
  ] });
  await page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` }).click();
  await expect(page.getByRole('checkbox', { name: `Mark ${titles[0]} incomplete` })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Completed · 1' })).toBeVisible();
  expect(writes).toContainEqual({ path: '/api/tasks/task-0', body: { completed: true } });
});

test('loading and mutation errors occupy a full row without offsetting the overview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockDay(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/tasks?*', async (route) => {
    await pending;
    await route.fulfill({ json: { tasks: tasksForDay() } });
  });
  await page.route('**/api/tasks/task-0', (route) => route.fulfill({ status: 400, json: { error: 'Could not save completion' } }));
  await page.goto('/today');
  const loading = page.getByRole('status', { name: '' }).filter({ hasText: 'Loading your plan' });
  await expect(loading).toBeVisible();
  expect((await box(loading)).width).toBeCloseTo((await box(page.locator('.page-shell'))).width, 0);
  release();
  await page.getByRole('checkbox', { name: `Mark ${titles[0]} complete` }).click();
  const error = page.getByRole('alert');
  await expect(error).toContainText('Could not save completion');
  expect((await box(error)).width).toBeCloseTo((await box(page.locator('.page-shell'))).width, 0);
  await expect.poll(() => verticalGap(page, '.task-stack > div', '.overview-card')).toBeCloseTo(0, 0);
});

test('a completed plan and a historical plan retain the grid and their available actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockDay(page, { tasks: tasksForDay().map((task) => ({ ...task, completed: true })) });
  await page.goto('/today');
  await expect(page.getByText('All your planned tasks are complete. Review your day when you’re ready.')).toBeVisible();
  await expect.poll(() => verticalGap(page, '.dashboard-main .page-section > p', '.overview-card')).toBeCloseTo(0, 0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  await page.goto('/today?date=2026-09-12');
  await expect(page.getByRole('heading', { name: 'Daily plan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review day', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Something changed?' })).toHaveCount(0);
  await expect(page.getByRole('checkbox').first()).toBeDisabled();
  await expect(page.getByRole('complementary', { name: 'Day overview' }).getByRole('link', { name: /Open inbox/ })).toBeVisible();
  await noOverflow(page);
});
