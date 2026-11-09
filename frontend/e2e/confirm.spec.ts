import { test, expect, type Page } from '@playwright/test';
import { mockDay, date, tasksForDay, planView, openPlan } from './fixtures/day';
import type { PlanView, Workflow } from '../src/lib/api';

// A day whose chat turns return scripted replies and drafts, and whose
// Confirm and Discard behave like the backend. Writes are recorded.
async function conversationDay(page: Page, start: Partial<Workflow>, turns: Array<{ text: string; plan?: PlanView | null }>) {
  const tasks = tasksForDay();
  await mockDay(page, { state: start.state ?? 'planning', tasks, firstVisit: true });
  let workflow: Workflow = { date, state: 'planning', version: 1, tasks, messages: [], backlog: [], plan: null, availableMinutes: null, review: null, ...start };
  const writes: string[] = [];
  let turn = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    // Rollover runs on every app open; it isn't a change from the Conversation.
    if (route.request().method() !== 'GET' && path !== '/api/day/rollover') writes.push(path);
    if (path === '/api/workflow') return route.fulfill({ json: workflow });
    if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
    if (path === '/api/day/plan/confirm') {
      const added = (workflow.plan?.today ?? []).filter(item => item.badge === 'new').map((item, index) => ({ ...tasks[0], id: `added-${index}`, title: item.title }));
      workflow = { ...workflow, state: 'active', version: workflow.version + 1, plan: null, tasks: [...workflow.tasks, ...added] };
      return route.fulfill({ json: workflow });
    }
    if (path === '/api/day/plan/discard') {
      workflow = { ...workflow, version: workflow.version + 1, plan: null, messages: [...workflow.messages, { id: `discarded-${workflow.version}`, role: 'event', eventType: 'discarded', content: 'Proposal discarded' }] };
      return route.fulfill({ json: workflow });
    }
    if (path === '/api/chat/stream') {
      const { content } = route.request().postDataJSON();
      const reply = turns[turn++];
      workflow = { ...workflow, version: workflow.version + 1, plan: reply.plan === undefined ? workflow.plan : reply.plan,
        messages: [...workflow.messages, { id: `u${turn}`, role: 'user', content }, { id: `a${turn}`, role: 'assistant', content: reply.text }] };
      return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text: reply.text, workflow })}\n\n` });
    }
    return route.fallback();
  });
  return writes;
}

async function send(page: Page, text: string, reply: string) {
  await page.getByRole('textbox', { name: 'Message about your day' }).fill(text);
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
}

const callTheBank = () => planView([{ ref: 'new:1', title: 'Call the bank', badge: 'new', date, duration: 15 }]);

for (const width of [390, 1440]) {
  test(`a clarifying reply stays chat-only, and one request makes a one-change Draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await conversationDay(page, {}, [
      { text: 'What has a deadline today?' },
      { text: 'Call the bank is in your Draft.', plan: callTheBank() },
    ]);
    await page.goto(`/conversation?date=${date}`);
    await send(page, 'busy day', 'What has a deadline today?');
    await expect(page.getByRole('complementary', { name: 'Today’s plan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Plan( ·|$)/ })).toHaveCount(0);

    await send(page, 'Add call the bank', 'Call the bank is in your Draft.');
    const plan = await openPlan(page);
    await expect(plan.locator('li')).toHaveCount(1);
    await expect(plan.locator('li')).toHaveText(/Call the bank.*New/);
    await expect(plan).toContainText('1 new');
    expect(writes.filter(path => path !== '/api/chat/stream')).toEqual([]);
  });
}

test('Confirm of the morning Draft lands on Today with "Plan confirmed"', async ({ page }) => {
  const writes = await conversationDay(page, { plan: callTheBank() }, []);
  await page.goto(`/conversation?date=${date}`);
  await (await openPlan(page)).getByRole('button', { name: 'Confirm plan' }).click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByText('Plan confirmed', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toContainText('Call the bank');
  expect(writes).toEqual(['/api/day/plan/confirm']);
});

test('Confirm later in the Day lands on Today with "Changes saved"', async ({ page }) => {
  await conversationDay(page, { state: 'active', plan: callTheBank() }, []);
  await page.goto(`/conversation?date=${date}`);
  await (await openPlan(page)).getByRole('button', { name: 'Confirm plan' }).click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
});

test('Discard clears the Draft and stays in the Conversation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await conversationDay(page, { plan: callTheBank() }, []);
  await page.goto(`/conversation?date=${date}`);
  await page.getByRole('complementary', { name: 'Today’s plan' }).getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(`/conversation?date=${date}`);
  await expect(page.getByRole('complementary', { name: 'Today’s plan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Plan( ·|$)/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
});

test('the Conversation shows no Undo receipts for saved changes', async ({ page }) => {
  await conversationDay(page, { state: 'active', changeReceipts: [{
    id: 'receipt-1', requestId: 'request-1', summary: 'Added 1 task', undone: false, canUndo: true, affectedDates: [date],
    changes: [{ taskId: 'task-0', title: 'Call the bank', action: 'Added', date }],
  }] } as Partial<Workflow>, []);
  await page.goto(`/conversation?date=${date}`);
  await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Saved task changes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
});

for (const [available, footer] of [[240, 'Planned ~3h 55m for your 4h'], [null, 'Planned ~3h 55m']] as const) {
  test(`the Draft footer shows the planned total${available ? ' and the stated time' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tasks = tasksForDay();
    // Three saved tasks (220 min) stay, one is removed, and Call the bank adds 15.
    const plan = planView([
      ...tasks.map(task => ({ ref: task.id, taskId: task.id, title: task.title, date, duration: task.duration ?? undefined })),
      { ref: 'new:1', title: 'Call the bank', badge: 'new', date, duration: 15 },
      { ref: 'gone', taskId: 'gone', title: 'Old errand', badge: 'removed', date, duration: 60 },
    ]);
    await conversationDay(page, { plan, availableMinutes: available }, []);
    await page.goto(`/conversation?date=${date}`);
    const panel = page.getByRole('complementary', { name: 'Today’s plan' });
    await expect(panel.getByText(footer, { exact: true })).toBeVisible();
    if (!available) await expect(panel.getByText(/for your/)).toHaveCount(0);
  });
}

test('the Draft footer stays hidden when nothing has an Estimate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await conversationDay(page, { tasks: [], plan: planView([{ ref: 'new:1', title: 'Call the bank', badge: 'new', date }]), availableMinutes: 240 }, []);
  await page.goto(`/conversation?date=${date}`);
  const panel = page.getByRole('complementary', { name: 'Today’s plan' });
  await expect(panel.getByRole('button', { name: 'Confirm plan' })).toBeVisible();
  await expect(panel.getByText(/^Planned/)).toHaveCount(0);
});
