import { test, expect, type Page } from '@playwright/test';
import { date, titles, tasksForDay, mockDay, planView } from './fixtures/day';

async function workspace(page: Page) {
  const writes = await mockDay(page);
  return { writes };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('main').evaluate(main => [...main.querySelectorAll('*')].filter(e => e.getClientRects().length && getComputedStyle(e).position !== 'fixed').filter(e => { const rect = e.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).map(e => ({ tag: e.tagName, id: e.id, text: e.textContent?.slice(0, 70) })))).toEqual([]);
}

for (const width of [320, 390, 1440]) {
  test(`workspace pages prioritize their content at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await workspace(page);
    for (const route of ['/review', '/history', '/conversation']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`${route.replaceAll('/', '-')}-${width}.png`), animations: 'disabled' });
    }
    expect(writes).toEqual([]);
  });
}

test('proposal keeps the conversation visible beside its decisions and the model picker inside the composer', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const writes = await mockDay(page, { messages: [{ id: 'm1', role: 'assistant', content: 'Previous planning conversation', createdAt: date }], plan: planView([
    { ref: 'task-0', taskId: 'task-0', title: titles[0], duration: 40, date },
    { ref: 'new:1', title: 'Prepare a handoff', duration: 30, badge: 'new', date },
  ], { otherDays: [
    { ref: 'task-1', taskId: 'task-1', title: titles[1], inbox: true, badge: 'moved' },
    { ref: 'task-2', taskId: 'task-2', title: titles[2], inbox: true, badge: 'moved' },
  ] }) });
  await page.goto('/conversation');
  await expect(page.getByRole('region', { name: 'Proposed plan' })).toBeVisible();
  await expect(page.getByText('Previous planning conversation')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Today' })).toContainText('Prepare a handoff');
  await expect(page.getByRole('region', { name: 'Later' }).locator('li')).toHaveCount(2);
  const composer = page.locator('.conversation-composer form');
  await expect(composer.getByRole('button', { name: 'GPT-OSS 120B' })).toBeVisible();
  await composer.getByRole('button', { name: 'GPT-OSS 120B' }).click();
  await page.getByRole('option', { name: 'GPT-OSS 20B', exact: true }).click();
  await expect(composer.getByRole('button', { name: 'GPT-OSS 20B' })).toBeVisible();
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('plan-proposal.png'), animations: 'disabled' });
});

test('review asks only for unfinished decisions and keeps reflection optional', async ({ page }, info) => {
  const tasks = tasksForDay();
  tasks[0].completed = true;
  const writes = await mockDay(page, { tasks });
  await page.goto('/review');
  await expect(page.getByRole('button', { name: `Done: ${titles[0]}` })).toHaveCount(0);
  await expect(page.getByText('Already completed · 1')).toBeVisible();
  await page.getByRole('button', { name: `Tomorrow: ${titles[1]}`, exact: true }).click();
  await page.getByRole('button', { name: `Drop: ${titles[2]}`, exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your day' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: /Notes for tomorrow/ })).not.toBeVisible();
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('review-confirm.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Close day', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ date, taskActions: [{ taskId: 'task-0', action: 'done' }, { taskId: 'task-1', action: 'tomorrow' }, { taskId: 'task-2', action: 'drop' }] });
});
