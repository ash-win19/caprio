import { test, expect, type Page } from '@playwright/test';
import { date, titles, tasksForDay, mockDay } from './fixtures/day';
import type { BackendTask, BackendCategory } from '../src/lib/api';

async function workspace(page: Page, onboardingComplete = true) {
  await mockDay(page);
  const state = {
    inbox: [{ ...tasksForDay()[0], id: 'inbox-1', title: 'Write a brief', status: 'backlog', categoryId: 'work' }] as BackendTask[],
    categories: [{ id: 'work', name: 'Work', color: '#4A7CFF', hoursPerWeek: 40 }, { id: 'health', name: 'Health', color: '#EF4444', hoursPerWeek: 3 }] as BackendCategory[],
    onboardingComplete,
  };
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: { user: { id: 'demo', name: 'Demo', email: 'demo@example.com' }, onboardingComplete: state.onboardingComplete, preferences: { briefTime: '08:00' }, categories: state.categories, todayTasks: tasksForDay(), backlog: state.inbox, streak: 0 } });
    if (url.pathname === '/api/tasks' && method === 'GET' && url.searchParams.get('status') === 'backlog') return route.fulfill({ json: { tasks: state.inbox.filter(task => task.status === 'backlog') } });
    if (url.pathname === '/api/chat/sessions') return route.fulfill({ json: { sessions: [
      { sessionDate: date, title: 'A focused day', messageCount: 3, updatedAt: date, state: 'active' },
      { sessionDate: '2026-09-13', title: 'Launch preparation', messageCount: 8, updatedAt: '2026-09-13', state: 'closed', plannedCount: 3, completedCount: 2, carriedCount: 1, droppedCount: 0 },
    ] } });
    if (url.pathname === '/api/tasks' && method === 'POST') {
      const body = request.postDataJSON();
      writes.push({ method, path: url.pathname, body });
      const task = { ...tasksForDay()[0], duration: null, ...body, id: `inbox-${state.inbox.length + 1}` };
      state.inbox.push(task);
      return route.fulfill({ json: task });
    }
    if (url.pathname.startsWith('/api/tasks/inbox-') && method !== 'GET') {
      const body = method === 'DELETE' ? {} : request.postDataJSON();
      writes.push({ method, path: url.pathname, body });
      const task = state.inbox.find(task => url.pathname.endsWith(`/${task.id}`));
      if (method === 'DELETE') state.inbox = state.inbox.filter(item => item !== task);
      else if (task) Object.assign(task, body);
      return route.fulfill({ json: task ?? {} });
    }
    if (url.pathname === '/api/settings' || url.pathname === '/api/onboarding') {
      const body = request.postDataJSON();
      writes.push({ method, path: url.pathname, body });
      if (body.categories) state.categories = body.categories;
      if (url.pathname === '/api/onboarding') state.onboardingComplete = true;
      return route.fulfill({ json: {} });
    }
    return route.fallback();
  });
  return { state, writes };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('main').evaluate(main => [...main.querySelectorAll('*')].filter(e => e.getClientRects().length && getComputedStyle(e).position !== 'fixed').filter(e => { const rect = e.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).map(e => ({ tag: e.tagName, id: e.id, text: e.textContent?.slice(0, 70) })))).toEqual([]);
}

for (const width of [320, 390, 1440]) {
  test(`workspace pages prioritize their content at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await workspace(page);
    for (const route of ['/capture', '/review', '/momentum', '/settings', '/settings/categories', '/settings/notifications', '/settings/voice', '/new']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Plan my day', exact: true })).toHaveCount(0);
      if (route === '/capture') await expect(page.getByRole('list', { name: 'Inbox tasks' })).toBeVisible();
      if (route === '/momentum') await expect(page.getByRole('list', { name: 'Saved days' })).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`${route.replaceAll('/', '-')}-${width}.png`), animations: 'disabled' });
    }
    expect(writes).toEqual([]);
  });
}

test('inbox captures a title without an invented estimate and returns focus', async ({ page }) => {
  const { writes } = await workspace(page);
  await page.goto('/capture');
  const title = page.getByRole('textbox', { name: 'What do you need to do?' });
  await expect(page.getByRole('spinbutton', { name: 'Estimated minutes' })).not.toBeVisible();
  await title.fill('Book the dentist');
  await title.press('Enter');
  await expect(page.getByRole('list', { name: 'Inbox tasks' })).toContainText('Book the dentist');
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ title: 'Book the dentist', status: 'backlog' });
  expect(writes[0].body).not.toHaveProperty('duration');
});

test('inbox keeps failed capture details and the draft across navigation', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/tasks', route => route.request().method() === 'POST' ? route.fulfill({ status: 400, json: { error: 'Could not save task' } }) : route.fallback());
  await page.goto('/capture');
  await page.getByRole('textbox', { name: 'What do you need to do?' }).fill('Keep this draft');
  await page.locator('summary').filter({ hasText: 'Task details' }).click();
  await page.getByRole('spinbutton', { name: 'Estimated minutes' }).fill('45');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save task');
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'History', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'What do you need to do?' })).toHaveValue('Keep this draft');
  await page.locator('summary').filter({ hasText: 'Task details' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Estimated minutes' })).toHaveValue('45');
});

test('inbox separates add-to-day, discuss and confirmed deletion', async ({ page }) => {
  const { writes } = await workspace(page);
  await page.goto('/capture');
  await page.getByRole('button', { name: 'More options for Write a brief' }).click();
  await expect(page.getByRole('menuitem', { name: 'Discuss in Plan' })).toHaveAttribute('href', /intent=interrupt&taskId=inbox-1&seed=/);
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Keep task' }).click();
  await expect(page.getByRole('button', { name: 'More options for Write a brief' })).toBeFocused();
  await page.getByRole('button', { name: 'More options for Write a brief' }).click();
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your inbox is clear' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'What do you need to do?' })).toBeFocused();
  expect(writes.filter(write => write.method === 'DELETE')).toHaveLength(1);
});

test('inbox adds a task to the current day only on the primary row action', async ({ page }) => {
  const { writes } = await workspace(page);
  await page.goto('/capture');
  await page.getByRole('button', { name: 'Add to today', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: "added to today's plan" })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'What do you need to do?' })).toBeFocused();
  expect(writes[0].body).toEqual({ status: 'planned', plannedForDate: date });
});

test('proposal shows decisions before conversation and keeps the model picker inside the composer', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const writes = await mockDay(page, { messages: [{ id: 'm1', role: 'assistant', content: 'Previous planning conversation', createdAt: date }], proposal: { id: 'proposal-1', summary: 'A smaller plan for today.', availableMinutes: 220, tasks: [
    { id: 'task-0', title: titles[0], duration: 40, urgency: 'medium', disposition: 'today', reason: 'Due today.' },
    { title: 'Prepare a handoff', duration: 30, urgency: 'high', disposition: 'today', reason: 'Help the team.' },
    { id: 'task-1', title: titles[1], duration: 90, urgency: 'medium', disposition: 'backlog', reason: 'Can wait.' },
    { id: 'task-2', title: titles[2], duration: 90, urgency: 'medium', disposition: 'backlog', reason: 'Can wait.' },
  ] } });
  await page.goto('/new');
  await expect(page.getByRole('region', { name: 'Proposed plan' })).toBeVisible();
  await expect(page.getByText('Previous planning conversation')).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Proposal changes' })).toContainText('Prepare a handoff');
  await expect(page.getByText('Deferred or removed · 2')).toBeVisible();
  const composer = page.locator('.conversation-composer form');
  await expect(composer.getByRole('button', { name: 'Gemini 3.7 Flash' })).toBeVisible();
  await composer.getByRole('button', { name: 'Gemini 3.7 Flash' }).click();
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

test('history finds a date and makes its saved day the primary destination', async ({ page }) => {
  const { writes } = await workspace(page);
  await page.goto('/momentum');
  await expect(page.getByRole('link', { name: 'Open conversation' })).not.toBeVisible();
  await page.getByRole('searchbox', { name: 'Search history by date or title' }).fill('2026-09-13');
  const days = page.getByRole('list', { name: 'Saved days' });
  await expect(days.locator(':scope > li')).toHaveCount(1);
  await expect(days).toContainText('3 planned · 2 done · 1 carried · 0 dropped');
  await days.getByRole('link', { name: /View day/ }).click();
  await expect(page).toHaveURL('/today?date=2026-09-13');
  expect(writes).toEqual([]);
});

test('categories preserve edits across navigation and save only on confirmation', async ({ page }) => {
  const { writes } = await workspace(page);
  await page.goto('/settings/categories');
  await page.locator('summary').filter({ hasText: 'Work' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Projects');
  await page.getByRole('button', { name: 'Move Projects down' }).click();
  await expect(page.locator('#category-work')).toBeFocused();
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'History', exact: true }).click();
  await page.goBack();
  await expect(page.locator('.page-body summary').last()).toContainText('Projects');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Categories saved.' })).toBeVisible();
  expect(writes[0].body.categories).toMatchObject([{ id: 'health' }, { id: 'work', name: 'Projects', hoursPerWeek: 40 }]);
  expect(writes[0].body.preferences).toEqual({});
});

test('failed category saves preserve edits and discard restores saved values', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/settings', route => route.fulfill({ status: 400, json: { error: 'Could not save categories' } }));
  await page.goto('/settings/categories');
  await page.locator('summary').filter({ hasText: 'Work' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Projects');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save categories');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Projects');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Work');
});

test('setup confirms categories without asking for an inactive reminder preference', async ({ page }) => {
  const { writes } = await workspace(page, false);
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { name: 'Your categories' })).toBeVisible();
  await expect(page.locator('input[type=time]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Plan my day', exact: true }).click();
  await expect(page).toHaveURL('/new');
  expect(writes[0].path).toBe('/api/onboarding');
  expect(writes[0].body.preferences).toEqual({ proactiveReprioritization: false });
  expect(writes[0].body.categories).toHaveLength(2);
});


test('expanded settings and capture details reflow with enlarged mobile text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const { writes } = await workspace(page);
  await page.goto('/capture');
  await page.locator('summary').filter({ hasText: 'Task details' }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  await page.goto('/settings/categories');
  await page.locator('summary').filter({ hasText: 'Work' }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  expect(writes).toEqual([]);
});

test('a category save locks navigation until the request finishes', async ({ page }) => {
  await workspace(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/settings', async route => { await pending; await route.fallback(); });
  await page.goto('/settings/categories');
  await page.locator('summary').filter({ hasText: 'Work' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Projects');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL('/settings/categories');
  release();
  await expect(page.getByRole('status').filter({ hasText: 'Categories saved.' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL('/momentum');
});
