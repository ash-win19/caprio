import { test, expect, type Page } from '@playwright/test';
import { mockDay, tasksForDay, titles } from './fixtures/day';
import type { BackendTask } from '../src/lib/api';

const remaining = (page: Page) => page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li');
const laterRows = (page: Page) => page.getByRole('list', { name: 'Later tasks' }).locator(':scope > li');
// The toast itself, not the copy announced to screen readers alongside it.
const toast = (page: Page) => page.getByRole('region', { name: /^Notifications \(/ }).getByRole('status').filter({ hasText: 'Dropped' });
const drop = async (page: Page, title: string) => {
  await page.getByRole('button', { name: `Task actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Drop' }).click();
};

for (const width of [390, 1440]) {
  test(`Drop takes a task off today, and Undo puts it back where it was at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockDay(page);
    await page.goto('/today');
    await expect(remaining(page)).toHaveCount(3);
    await drop(page, titles[0]);
    await expect(remaining(page)).toHaveCount(2);
    await expect(remaining(page).filter({ hasText: titles[0] })).toHaveCount(0);
    await expect(page.locator('.today-summary')).toHaveText('2 left · ~3h');
    await expect(toast(page)).toContainText(titles[0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`dropped-${width}.png`), animations: 'disabled' });

    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(remaining(page)).toHaveCount(3);
    await expect(remaining(page).first()).toContainText(titles[0]);
    await expect(toast(page)).toHaveCount(0);
    expect(writes).toEqual([
      { path: '/api/tasks/task-0', body: { status: 'dropped' } },
      { path: '/api/tasks/task-0', body: { status: 'planned' } },
    ]);
  });
}

test('Drop works on Later rows, and Undo restores each to what it was', async ({ page }) => {
  const [base] = tasksForDay();
  const later: BackendTask[] = [
    { ...base, id: 'tomorrow', title: 'Study group', plannedForDate: '2026-09-15', status: 'planned', sortOrder: 0 },
    { ...base, id: 'someday', title: 'Book a dentist appointment', status: 'backlog', sortOrder: 0 },
  ];
  const writes = await mockDay(page, { later });
  await page.goto('/today');
  await page.locator('details.today-later summary').click();
  for (const [task, status] of [[later[1], 'backlog'], [later[0], 'planned']] as const) {
    await drop(page, task.title);
    await expect(laterRows(page)).toHaveCount(1);
    await expect(page.locator('details.today-later summary')).toContainText('Later · 1');
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(laterRows(page)).toHaveCount(2);
    expect(writes.splice(0)).toEqual([
      { path: `/api/tasks/${task.id}`, body: { status: 'dropped' } },
      { path: `/api/tasks/${task.id}`, body: { status } },
    ]);
  }
  await expect(remaining(page)).toHaveCount(3);
});

test('a failed Drop says why and leaves the task on the list', async ({ page }) => {
  await mockDay(page);
  await page.route('**/api/tasks/task-0', route => route.fulfill({ status: 409, json: { error: 'Someone else changed this task.', code: 'conflict' } }));
  await page.goto('/today');
  await drop(page, titles[0]);
  await expect(page.getByRole('alert')).toContainText('Someone else changed this task.');
  await expect(remaining(page)).toHaveCount(3);
  await expect(toast(page)).toHaveCount(0);
});

test('a wrapped-up Day keeps its finished rows without a Drop action', async ({ page }) => {
  await mockDay(page, { state: 'closed', tasks: tasksForDay().map(task => ({ ...task, completed: true, status: 'completed' })) });
  await page.goto('/today');
  await page.locator('details.today-done summary').click();
  await expect(page.getByRole('list', { name: 'Done tasks' }).locator(':scope > li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Task actions for/ })).toHaveCount(0);
});

test('each of two quick drops keeps its own Undo', async ({ page }) => {
  await mockDay(page);
  await page.goto('/today');
  await drop(page, titles[0]);
  await drop(page, titles[1]);
  await expect(remaining(page)).toHaveCount(1);
  await expect(toast(page)).toHaveCount(2);
  await toast(page).filter({ hasText: titles[0] }).getByRole('button', { name: 'Undo' }).click();
  await expect(remaining(page)).toHaveText([new RegExp(titles[0]), new RegExp(titles[2])]);
  await expect(toast(page)).toHaveText([new RegExp(titles[1])]);
});

test('after Wrap up, Later rows can move to today but not be dropped', async ({ page }) => {
  const [base] = tasksForDay();
  await mockDay(page, { state: 'closed', later: [{ ...base, id: 'someday', title: 'Book a dentist appointment', status: 'backlog' }] });
  await page.goto('/today');
  await page.locator('details.today-later summary').click();
  await page.getByRole('button', { name: 'Task actions for Book a dentist appointment' }).click();
  await expect(page.getByRole('menuitem', { name: 'Move to today' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Drop' })).toHaveCount(0);
});
