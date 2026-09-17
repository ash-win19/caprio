import { test, expect } from '@playwright/test';
import { mockDay, date, tasksForDay } from './fixtures/day';

for (const width of [390, 1440]) {
  for (const entry of ['/', '/today']) {
    test(`a carry-only morning opens the conversation from ${entry} at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const tasks = tasksForDay().map(task => ({ ...task, deferCount: 1, duration: 120 }));
      const writes = await mockDay(page, {
        state: 'planning', tasks,
        carryoverOrigins: Object.fromEntries(tasks.map(task => [task.id, '2026-09-13'])),
      });
      await page.goto(entry);
      await expect(page).toHaveURL('/new');
      const input = page.getByRole('textbox', { name: 'Message about your day' });
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
      await expect(page.getByText('3 saved tasks', { exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('3 carried forward');
      await page.screenshot({ path: info.outputPath(`morning-conversation-${width}.png`), animations: 'disabled' });

      // The explicit checklist remains reachable before a plan is started,
      // and a visit there must not discard the morning conversation draft.
      await input.fill('Help me plan my day around these tasks.');
      await page.getByRole('link', { name: 'View tasks', exact: true }).click();
      await expect(page).toHaveURL(`/today?date=${date}`);
      await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
      await page.locator('.today-carried > summary').click();
      await expect(page.getByRole('list', { name: 'Carried forward tasks' }).locator('li')).toHaveCount(3);
      await page.getByRole('link', { name: 'Plan day', exact: true }).click();
      await expect(input).toHaveValue('Help me plan my day around these tasks.');
      expect(writes).toEqual([]);

      await page.reload();
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    });
  }
}

test('an empty morning opens a ready conversation', async ({ page }) => {
  await mockDay(page, { state: 'planning', tasks: [] });
  await page.goto('/');
  await expect(page).toHaveURL('/new');
  await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
  await expect(page.getByText('0 saved tasks', { exact: true })).toBeVisible();
});

test('a Today tab left open overnight starts the new day in conversation', async ({ page }) => {
  await mockDay(page);
  await page.goto('/today');
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toBeVisible();
  const nextDay = '2026-09-15';
  const nextWorkflow = page.waitForRequest(request => new URL(request.url()).pathname === '/api/workflow'
    && new URL(request.url()).searchParams.get('date') === nextDay);
  await page.clock.setFixedTime(new Date(`${nextDay}T08:00:00`));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await nextWorkflow;
  await expect(page).toHaveURL('/new');
  await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'View tasks', exact: true })).toHaveAttribute('href', `/today?date=${nextDay}`);
});
