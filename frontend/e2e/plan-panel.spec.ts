import { test, expect } from '@playwright/test';
import { mockDay, date, tasksForDay, planView } from './fixtures/day';

const longPlan = () => planView(
  Array.from({ length: 14 }, (_, index) => ({ ref: `new:${index}`, title: `Planned task ${index + 1}`, badge: 'new' as const, date })),
  { carried: tasksForDay().map(task => ({ ref: task.id, taskId: task.id, title: task.title, date, carried: true })) },
);

test('at desktop width the plan sits beside the chat with its actions in reach', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDay(page, { state: 'planning', tasks: tasksForDay(), plan: longPlan(), messages: [
    { id: 'u1', role: 'user', content: 'Here is everything for today' },
    { id: 'a1', role: 'assistant', content: 'All fourteen are on the plan.' },
  ] });
  await page.goto(`/new?date=${date}`);
  const panel = page.getByRole('complementary', { name: 'Today’s plan' });
  await expect(panel).toBeVisible();
  const chat = page.getByRole('region', { name: 'Planning conversation' });
  const [panelBox, chatBox] = await Promise.all([panel.boundingBox(), chat.boundingBox()]);
  expect(panelBox!.x).toBeGreaterThanOrEqual(chatBox!.x + chatBox!.width - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(panel.getByRole('button', { name: 'Confirm plan' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('plan-panel-1440.png'), animations: 'disabled' });
  await panel.getByRole('button', { name: 'Close plan' }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Plan · 14 changes' }).click();
  await expect(panel).toBeVisible();
});

test('at phone width the plan opens from a pill as a bottom sheet and confirms from there', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await mockDay(page, { state: 'planning', tasks: [], plan: planView([{ ref: 'new:1', title: 'Ship slides', badge: 'new', date }]) });
  await page.goto(`/new?date=${date}`);
  await expect(page.getByRole('complementary', { name: 'Today’s plan' })).toHaveCount(0);
  const pill = page.getByRole('button', { name: 'Plan · 1 change' });
  await expect(pill).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pill.click();
  const sheet = page.getByRole('dialog', { name: 'Today’s plan' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Ship slides');
  await page.screenshot({ path: info.outputPath('plan-sheet-390.png'), animations: 'disabled' });
  await sheet.getByRole('button', { name: 'Confirm plan' }).click();
  await expect.poll(() => writes.some(write => write.path === '/api/day/plan/confirm')).toBe(true);
});

test('with reduced motion the panel appears without sliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDay(page, { state: 'planning', tasks: [], plan: planView([{ ref: 'new:1', title: 'Ship slides', badge: 'new', date }]) });
  await page.goto(`/new?date=${date}`);
  const panel = page.getByRole('complementary', { name: 'Today’s plan' });
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});
