import { test, expect } from '@playwright/test';
import { mockDay, date, tasksForDay } from './fixtures/day';
import type { ChangeReceipt, Workflow } from '../src/lib/api';

for (const width of [320, 390, 1440]) {
  test(`unfinished carry context appears once beside View tasks at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const tasks = tasksForDay().map((task, index) => ({ ...task, deferCount: index < 2 ? 2 : 0 }));
    tasks.push({ ...tasks[0], id: 'finished-carry', completed: true, status: 'completed' });
    await mockDay(page, { state: 'planning', tasks, firstVisit: true });
    await page.goto('/');
    const summary = page.getByRole('status', { name: 'Task summary' });
    await expect(summary).toContainText('3 remaining');
    await expect(summary).toContainText('2 carried forward');
    await expect(page.getByText(/carried forward/)).toHaveCount(1);
    await expect(page.locator('.app-topbar')).toContainText('2 carried forward');
    await expect(page.getByText(/already waiting|Estimates are optional|They stay in your plan/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'GPT-OSS 120B', exact: true })).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Message about your day' });
    await expect(input).not.toHaveAttribute('placeholder', /carried/i);
    const contrast = await summary.evaluate(element => {
      const normal = getComputedStyle(element.querySelector('span')!).color;
      const carry = getComputedStyle(element.querySelector('.text-cap-blue')!).color;
      const background = getComputedStyle(element.closest('header')!).backgroundColor;
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const foregroundLuminance = luminance(carry);
      const backgroundLuminance = luminance(background);
      return { distinct: normal !== carry, ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05) };
    });
    expect(contrast.distinct).toBe(true);
    expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const title = await page.getByRole('heading', { name: 'Plan', exact: true }).evaluate(element => {
      const styles = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(styles.lineHeight) };
    });
    expect(title.height).toBeLessThanOrEqual(title.lineHeight + 1);
    await page.screenshot({ path: info.outputPath(`carry-context-${width}.png`), animations: 'disabled' });
    await input.fill('Help me decide what to do first.');
    await expect(summary).toContainText('2 carried forward');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'View tasks', exact: true })).toBeVisible();
  });
}

for (const width of [390, 1440]) {
  for (const entry of ['/', '/today']) {
    test(`a carry-only morning opens the conversation from ${entry} at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const tasks = tasksForDay().map(task => ({ ...task, deferCount: 1, duration: 120 }));
      const writes = await mockDay(page, {
        state: 'planning', tasks, firstVisit: true,
        carryoverOrigins: Object.fromEntries(tasks.map(task => [task.id, '2026-09-13'])),
      });
      await page.goto(entry);
      await expect(page).toHaveURL('/new');
      const input = page.getByRole('textbox', { name: 'Message about your day' });
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
      await expect(page.getByRole('region', { name: 'Saved checklist' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Your tasks' })).toHaveCount(0);
      await expect(page.locator('.daily-conversation-workspace')).not.toHaveClass(/with-task-list/);
      await expect(page.getByText('3 remaining', { exact: true })).toBeVisible();
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

for (const state of ['planning', 'active'] as const) {
  test(`an empty ${state} day opens only the conversation on every visit`, async ({ page }) => {
    await mockDay(page, { state, tasks: [] });
    for (const entry of ['/', '/today']) {
      await page.goto(entry);
      await expect(page).toHaveURL('/new');
      await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
      await expect(page.getByRole('status', { name: 'Task summary' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Saved checklist' })).toHaveCount(0);
    }
  });
}

test('first visit opens conversation even with a plan, then later visits open tasks', async ({ page }) => {
  await mockDay(page, { firstVisit: true });
  await page.goto('/today');
  await expect(page).toHaveURL('/new');
  await expect(page.getByRole('heading', { name: 'What needs your attention?' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved checklist' })).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`morning planning stays in conversation until tasks are saved at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const carried = tasksForDay().slice(0, 1).map(task => ({ ...task, deferCount: 1 }));
    await mockDay(page, { state: 'planning', tasks: carried, firstVisit: true });
    let workflow: Workflow = { date, state: 'planning', version: 1, tasks: carried, messages: [], backlog: [], proposal: null, availableMinutes: null, review: null };
    let turns = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') {
        if (new URL(route.request().url()).searchParams.get('date') !== date) return route.fallback();
        return route.fulfill({ json: workflow });
      }
      if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
      if (path !== '/api/chat/stream') return route.fallback();
      const request = route.request().postDataJSON();
      turns++;
      const text = turns === 1 ? 'What would you like to work on?' : 'Added your report.';
      let receipt: ChangeReceipt | undefined;
      if (turns === 2) {
        receipt = { id: 'initial-plan', requestId: request.requestId, summary: 'Added 1 task',
          changes: [{ taskId: 'report', title: 'Finish report', action: 'Added', date }], affectedDates: [date], canUndo: true, undone: false };
        workflow = { ...workflow, state: 'active', version: 2, tasks: [...carried, { ...tasksForDay()[0], id: 'report', title: 'Finish report' }], changeReceipts: [receipt] };
      }
      workflow = { ...workflow, messages: [...workflow.messages, { id: `user-${turns}`, role: 'user', content: request.content }, { id: `assistant-${turns}`, role: 'assistant', content: text }] };
      return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text, workflow, appliedChange: receipt })}\n\n` });
    });
    await page.goto('/');
    const input = page.getByRole('textbox', { name: 'Message about your day' });
    await expect(input).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Your tasks' })).toHaveCount(0);
    await input.fill('Help me plan my day');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page.getByText('What would you like to work on?', { exact: true })).toBeVisible();
    await expect(page).toHaveURL('/new');
    await expect(page.getByRole('region', { name: 'Saved checklist' })).toHaveCount(0);
    await input.fill('Add Finish report to today');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('list', { name: 'Remaining tasks' })).toContainText('Finish report');
    await expect(page.getByRole('region', { name: 'Planning conversation' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`after-planning-${width}.png`), animations: 'disabled' });
    await page.reload();
    await expect(page).toHaveURL('/today');
    await page.clock.setFixedTime(new Date('2026-09-15T08:00:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL('/new');
    await expect(input).toBeEnabled();
    expect(turns).toBe(2);
  });
}

test('confirming a plan of carried tasks opens the task page', async ({ page }) => {
  const tasks = tasksForDay().map(task => ({ ...task, deferCount: 1 }));
  const proposal: NonNullable<Workflow['proposal']> = {
    id: 'carry-plan', summary: 'Focus on the work carried from yesterday.', availableMinutes: 240,
    tasks: tasks.map(task => ({ id: task.id, title: task.title, duration: task.duration ?? 30, urgency: task.urgency, disposition: 'today', reason: 'Keep this priority.' })),
  };
  await mockDay(page, { state: 'planning', tasks, proposal, firstVisit: true });
  let workflow: Workflow = { date, state: 'planning', version: 1, tasks, proposal, messages: [], backlog: [], availableMinutes: 240, review: null };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workflow') return route.fulfill({ json: workflow });
    if (path === '/api/day/plan/confirm') {
      workflow = { ...workflow, state: 'active', version: 2, proposal: null };
      return route.fulfill({ json: workflow });
    }
    return route.fallback();
  });
  await page.goto('/');
  await expect(page).toHaveURL('/new');
  await page.getByRole('button', { name: 'Confirm plan', exact: true }).click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Planning conversation' })).toHaveCount(0);
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
