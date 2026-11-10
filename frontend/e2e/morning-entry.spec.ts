import { test, expect, type Page } from '@playwright/test';
import { mockDay, date, tasksForDay, planView, openPlan } from './fixtures/day';
import type { Workflow } from '../src/lib/api';

const composer = (page: Page) => page.getByRole('textbox', { name: 'Message about your day' });
const todayList = (page: Page) => page.getByRole('list', { name: 'Remaining tasks' });

// The Conversation is the whole screen: no task list beside or behind it.
async function expectOnlyConversation(page: Page) {
  await expect(page).toHaveURL('/conversation');
  await expect(composer(page)).toBeEnabled();
  await expect(todayList(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toHaveCount(0);
}

for (const width of [390, 1440]) {
  for (const entry of ['/', '/today']) {
    test(`the first open of an unconfirmed day from ${entry} shows only the Conversation at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const tasks = tasksForDay().map(task => ({ ...task, deferCount: 1 }));
      const opener = 'Morning. 3 tasks carried over from yesterday. What’s on today?';
      const writes = await mockDay(page, { state: 'planning', tasks, firstVisit: true, opener });
      await page.goto(entry);
      await expectOnlyConversation(page);
      await expect(page.getByRole('region', { name: 'Planning conversation' }).getByText(opener, { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Skip to my list', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to Today', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`morning-conversation-${width}.png`), animations: 'disabled' });

      // Reopening before deciding still starts in the Conversation.
      await page.reload();
      await expectOnlyConversation(page);
      expect(writes).toEqual([]);
    });
  }
}

for (const width of [390, 1440]) {
  test(`Skip to my list lands on Today and later opens that day stay there at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDay(page, { state: 'planning', firstVisit: true });
    await page.goto('/');
    await expect(page).toHaveURL('/conversation');
    await composer(page).fill('Draft that survives the skip');
    await page.getByRole('link', { name: 'Skip to my list', exact: true }).click();
    await expect(page).toHaveURL('/today');
    await expect(todayList(page)).toBeVisible();

    // The Conversation is still reachable, and the unsent message is kept.
    await page.keyboard.press('Control+Shift+Space');
    await expect(page).toHaveURL('/conversation');
    await expect(composer(page)).toHaveValue('Draft that survives the skip');
    await expect(page.getByRole('link', { name: 'Skip to my list', exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL('/conversation');
    await page.goto('/today');
    await expect(page).toHaveURL('/today');
    await expect(todayList(page)).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL('/today');
    await expect(todayList(page)).toBeVisible();
  });
}

test('choosing the Today tab from the morning Conversation counts as skipping', async ({ page }) => {
  await mockDay(page, { state: 'planning', firstVisit: true });
  await page.goto('/');
  await expect(page).toHaveURL('/conversation');
  await page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL('/today');
  await expect(todayList(page)).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL('/today');
});

test('the skip is remembered per account and per date', async ({ page }) => {
  await mockDay(page, { state: 'planning', firstVisit: true });
  await page.addInitScript(() => {
    // Yesterday's skip, and today's skip by another account, don't count.
    localStorage.setItem('caprio_day_entry:demo', '2026-09-13');
    localStorage.setItem('caprio_day_entry:someone-else', '2026-09-14');
  });
  await page.goto('/');
  await expect(page).toHaveURL('/conversation');
});

for (const state of ['active', 'closed'] as const) {
  test(`a confirmed day opens on Today even on its first open (${state})`, async ({ page }) => {
    await mockDay(page, { state, firstVisit: true });
    for (const entry of ['/', '/today']) {
      await page.goto(entry);
      await expect(page).toHaveURL('/today');
    }
  });
}

test('a confirmed day where every task carried over stays on Today', async ({ page }) => {
  const tasks = tasksForDay().map(task => ({ ...task, deferCount: 2 }));
  await mockDay(page, { state: 'active', tasks, firstVisit: true, carryoverOrigins: Object.fromEntries(tasks.map(task => [task.id, '2026-09-12'])) });
  for (const entry of ['/', '/today']) {
    await page.goto(entry);
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  }
});

test('an unconfirmed day of carried tasks stays on Today once skipped', async ({ page }) => {
  const tasks = tasksForDay().map(task => ({ ...task, deferCount: 1 }));
  await mockDay(page, { state: 'planning', tasks });
  for (const entry of ['/', '/today']) {
    await page.goto(entry);
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  }
});

for (const width of [390, 1440]) {
  test(`Confirm lands on Today, and reopening the same day stays there at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const carried = tasksForDay().slice(0, 1).map(task => ({ ...task, deferCount: 1 }));
    await mockDay(page, { state: 'planning', tasks: carried, firstVisit: true });
    let workflow: Workflow = { date, state: 'planning', version: 1, tasks: carried, messages: [], backlog: [], plan: null, availableMinutes: null, review: null };
    let turns = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') {
        if (new URL(route.request().url()).searchParams.get('date') !== date) return route.fallback();
        return route.fulfill({ json: workflow });
      }
      if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
      if (path === '/api/day/plan/confirm') {
        workflow = { ...workflow, state: 'active', version: workflow.version + 1, plan: null, tasks: [...carried, { ...tasksForDay()[0], id: 'report', title: 'Finish report' }] };
        return route.fulfill({ json: workflow });
      }
      if (path !== '/api/chat/stream') return route.fallback();
      const request = route.request().postDataJSON();
      turns++;
      const text = turns === 1 ? 'What would you like to work on?' : 'Review this draft with Finish report.';
      if (turns === 2) {
        workflow = { ...workflow, version: 2, plan: planView([{ ref: 'new:1', title: 'Finish report', badge: 'new', date }], { draftId: 'draft-plan', carried: carried.map(task => ({ ref: task.id, taskId: task.id, title: task.title, date, carried: true })) }) };
      }
      workflow = { ...workflow, messages: [...workflow.messages, { id: `user-${turns}`, role: 'user', content: request.content }, { id: `assistant-${turns}`, role: 'assistant', content: text }] };
      return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text, workflow })}\n\n` });
    });
    await page.goto('/');
    await expectOnlyConversation(page);
    await composer(page).fill('Help me plan my day');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page.getByText('What would you like to work on?', { exact: true })).toBeVisible();
    await expectOnlyConversation(page);
    await composer(page).fill('Add Finish report to today');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page.getByText('Review this draft with Finish report.', { exact: true })).toBeVisible();
    const plan = await openPlan(page);
    await plan.getByRole('button', { name: 'Confirm plan', exact: true }).click();
    await expect(page).toHaveURL('/today');
    await expect(todayList(page)).toContainText('Finish report');
    await expect(page.getByRole('region', { name: 'Planning conversation' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`after-planning-${width}.png`), animations: 'disabled' });
    await page.reload();
    await expect(page).toHaveURL('/today');
    await page.goto('/');
    await expect(page).toHaveURL('/today');

    // After Confirm the Conversation offers a way back instead of a skip.
    await page.keyboard.press('Control+Shift+Space');
    await expect(page).toHaveURL('/conversation');
    await expect(page.getByRole('link', { name: 'Skip to my list', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
    await expect(page).toHaveURL('/today');

    // A new day starts in the Conversation again.
    await page.clock.setFixedTime(new Date('2026-09-15T08:00:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL('/conversation');
    await expect(composer(page)).toBeEnabled();
    expect(turns).toBe(2);
  });
}

test('a Today tab left open overnight starts the new day in the Conversation', async ({ page }) => {
  await mockDay(page);
  await page.goto('/today');
  await expect(todayList(page)).toBeVisible();
  const nextDay = '2026-09-15';
  const nextWorkflow = page.waitForRequest(request => new URL(request.url()).pathname === '/api/workflow'
    && new URL(request.url()).searchParams.get('date') === nextDay);
  await page.clock.setFixedTime(new Date(`${nextDay}T08:00:00`));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await nextWorkflow;
  await expect(page).toHaveURL('/conversation');
  await expect(composer(page)).toBeEnabled();
});

test('the old Plan route redirects to the Conversation and keeps its query', async ({ page }) => {
  await mockDay(page, { state: 'planning' });
  await page.goto('/new');
  await expect(page).toHaveURL('/conversation');
  await expect(composer(page)).toBeEnabled();
  await page.goto(`/new?date=${date}&seed=Call%20the%20bank`);
  await expect(page).toHaveURL(`/conversation?date=${date}`);
  await expect(composer(page)).toHaveValue('Call the bank');
});

for (const width of [390, 1440]) {
  test(`only the Today and History tabs and the avatar menu navigate the app at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDay(page);
    for (const route of ['/today', '/conversation', '/momentum']) {
      await page.goto(route);
      await expect(page.getByRole('navigation', { name: 'App' }).getByRole('link')).toHaveText(['Today', 'History']);
      await expect(page.getByRole('navigation', { name: /primary/i })).toHaveCount(0);
      await expect(page.locator('#app-sidebar, #conversation-sidebar, .mobile-bottom-nav')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /sidebar|conversation history/i })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('/today');
    await expect(page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL('/momentum');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Sign out']);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/login');
  });
}
