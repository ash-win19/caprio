import { test, expect } from '@playwright/test';
import { mockDay, date, tasksForDay, planView, openPlan } from './fixtures/day';
import type { Workflow } from '../src/lib/api';

for (const width of [390, 1440]) {
  test(`conversation draft requires confirm before checklist changes at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockDay(page);
    const original = tasksForDay().slice(0, 1);
    let workflow: Workflow = { date, state: 'active', version: 1, messages: [], tasks: original, backlog: [], plan: null, availableMinutes: 30, review: null, changeReceipts: [] };
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') return route.fulfill({ json: workflow });
      if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
      if (path === '/api/chat/stream') {
        const body = route.request().postDataJSON();
        writes.push({ path, body });
        workflow = { ...workflow, version: 2, messages: [{ id: 'u1', role: 'user', content: body.content }, { id: 'a1', role: 'assistant', content: 'Review this draft.' }],
          plan: planView([
            { ref: original[0].id, taskId: original[0].id, title: original[0].title, date },
            { ref: 'new:1', title: 'Fix Headlines publishing', badge: 'new', date },
            { ref: 'new:2', title: 'Prepare tomorrow’s demo', badge: 'new', date },
          ]) };
        return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text: 'Review this draft.', workflow })}\n\n` });
      }
      if (path === '/api/day/plan/confirm') {
        writes.push({ path, body: route.request().postDataJSON() });
        workflow = { ...workflow, version: 3, state: 'active', plan: null, tasks: [...original,
          { ...original[0], id: 'publishing', title: 'Fix Headlines publishing', description: 'Preserve the Headlines brand and use Cozad’s feedback.', duration: 120, sortOrder: 1 },
          { ...original[0], id: 'demo', title: 'Prepare tomorrow’s demo', duration: 120, sortOrder: 2 },
        ] };
        return route.fulfill({ json: workflow });
      }
      return route.fallback();
    });
    await page.goto(`/new?date=${date}&taskId=referenced-inbox-task`);
    await expect(page.getByText('1 remaining', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message about your day' }).fill('I have to fix Headlines publishing and prepare tomorrow’s demo. Two hours each.');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page.getByText('Review this draft.', { exact: true })).toBeVisible();
    const proposal = await openPlan(page);
    await expect(proposal).toBeVisible();
    await expect(proposal.getByRole('button', { name: 'Confirm plan' })).toBeVisible();
    await expect(proposal.getByRole('region', { name: 'Today' }).locator('li')).toHaveCount(3);
    await expect(page.getByText('1 remaining', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Saved task changes' })).toHaveCount(0);
    expect(writes[0].body).toMatchObject({ date, taskId: 'referenced-inbox-task' });
    expect(writes[0].body).not.toHaveProperty('contractVersion');
    await proposal.getByRole('button', { name: 'Confirm plan' }).click();
    // Confirm opens bare /today for local today (fixture clock = date) so overnight tabs are not pinned.
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li')).toHaveCount(3);
    await expect(page.locator('.today-page')).toContainText('280 min estimated remaining');
    const publishing = page.getByRole('listitem').filter({ hasText: 'Fix Headlines publishing' });
    await publishing.locator('summary').click();
    await expect(publishing.getByText('Preserve the Headlines brand and use Cozad’s feedback.')).toBeVisible();
    expect(writes.find(write => write.path === '/api/day/plan/confirm')?.body).toMatchObject({ date, draftId: 'draft-1' });
    expect(writes.filter(write => write.path === '/api/chat/stream')).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`conversation-confirmed-${width}.png`), animations: 'disabled' });
  });
}

test('a moved task shows under other days with its badge while the rest of the day stays listed', async ({ page }) => {
  const tasks = tasksForDay();
  await mockDay(page, { tasks, plan: planView(
    [tasks[0], tasks[2]].map(task => ({ ref: task.id, taskId: task.id, title: task.title, date })),
    { otherDays: [{ ref: tasks[1].id, taskId: tasks[1].id, title: tasks[1].title, date: '2026-09-15', badge: 'moved' }] },
  ) });
  await page.goto(`/new?date=${date}`);
  const proposal = page.getByRole('region', { name: 'Proposed plan' });
  await expect(proposal.getByRole('region', { name: 'Other days' })).toContainText(tasks[1].title);
  await expect(proposal.getByRole('region', { name: 'Other days' })).toContainText('Moved');
  await expect(proposal.getByRole('region', { name: 'Today' }).locator('li')).toHaveCount(2);
  await expect(proposal).not.toContainText('Removed');
  await expect(proposal.getByRole('button', { name: 'Confirm plan' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved task changes' })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`the thread stays whole beside a pending draft and discard leaves a marker at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const draft = planView([{ ref: 'new:1', title: 'Ship slides', badge: 'new', date }, { ref: 'new:2', title: 'Sleep early', badge: 'new', date }]);
    let workflow: Workflow = { date, state: 'planning', version: 3, tasks: [], backlog: [], availableMinutes: null, review: null, plan: draft, messages: [
      { id: 'opener', role: 'event', eventType: 'opener', content: 'Morning. What’s on today?' },
      { id: 'u1', role: 'user', content: 'my tasks are: ship slides' },
      { id: 'a1', role: 'assistant', content: 'Slides are on for today.' },
      { id: 'u2', role: 'user', content: 'add one task for sleep early' },
      { id: 'a2', role: 'assistant', content: 'Sleep early is on too.' },
    ] };
    await mockDay(page, { state: 'planning', tasks: [] });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') return route.fulfill({ json: workflow });
      if (path === '/api/day/plan/discard') {
        workflow = { ...workflow, version: 4, plan: null, messages: [...workflow.messages, { id: 'e1', role: 'event', eventType: 'discarded', content: 'Proposal discarded' }] };
        return route.fulfill({ json: workflow });
      }
      return route.fallback();
    });
    await page.goto(`/new?date=${date}`);
    const thread = page.getByRole('region', { name: 'Planning conversation' });
    for (const text of ['Morning. What’s on today?', 'my tasks are: ship slides', 'Slides are on for today.', 'add one task for sleep early', 'Sleep early is on too.']) {
      await expect(thread.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/Conversation ·/)).toHaveCount(0);
    const card = await openPlan(page);
    await expect(card).not.toContainText('Confirm to save');
    await expect(card.getByRole('button', { name: /Revise/ })).toHaveCount(0);
    await card.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Proposal discarded' })).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(thread.getByText('Sleep early is on too.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`three turns build one plan that Confirm saves in full at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDay(page, { state: 'planning', tasks: [] });
    const turns = [
      { text: 'Slides are on for today. Phenyx is already on your list.', items: [{ ref: 'new:1', title: 'Ship slides and prepare for demo', badge: 'new' as const, date }], update: 'Plan updated · Added Ship slides and prepare for demo' },
      { text: 'Sleep early is on too.', items: [{ ref: 'new:2', title: 'Sleep early', badge: 'new' as const, date }], update: 'Plan updated · Added Sleep early' },
      { text: 'Renamed it to demo deck.', items: [], update: 'Plan updated · Edited Ship slides and prepare for demo' },
    ];
    let items: Array<{ ref: string; title: string; badge?: 'new'; date: string }> = [];
    let workflow: Workflow = { date, state: 'planning', version: 1, tasks: [], backlog: [], availableMinutes: null, review: null, plan: null, messages: [] };
    let turn = 0;
    const confirmed: unknown[] = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') return route.fulfill({ json: workflow });
      if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
      if (path === '/api/chat/stream') {
        const body = route.request().postDataJSON();
        const step = turns[turn++];
        items = [...items, ...step.items];
        if (turn === 3) items = items.map(item => item.ref === 'new:1' ? { ...item, title: 'Demo deck' } : item);
        workflow = { ...workflow, version: workflow.version + 1, plan: planView(items), messages: [...workflow.messages,
          { id: `u${turn}`, role: 'user', content: body.content },
          { id: `a${turn}`, role: 'assistant', content: step.text },
          { id: `e${turn}`, role: 'event', eventType: 'plan_update', content: step.update, metadata: { changes: (step.items.length ? step.items : [{ ref: 'new:1', title: 'Demo deck' }]).map(item => ({ ref: item.ref, title: item.title, action: 'Added' })) } },
        ] };
        return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text: step.text, workflow })}\n\n` });
      }
      if (path === '/api/day/plan/confirm') {
        confirmed.push(route.request().postDataJSON());
        workflow = { ...workflow, state: 'active', plan: null, tasks: items.map((item, index) => ({ ...tasksForDay()[0], id: item.ref, title: item.title, sortOrder: index })) };
        return route.fulfill({ json: workflow });
      }
      return route.fallback();
    });
    await page.goto(`/new?date=${date}`);
    const input = page.getByRole('textbox', { name: 'Message about your day' });
    for (const message of ['my tasks are: ship slides and prepare for demo, ship phenyx', 'add one task for sleep early', 'rename slides to demo deck']) {
      await expect(input).toBeEnabled();
      await input.fill(message);
      await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    for (const step of turns) await expect(page.getByRole('button', { name: step.update })).toBeVisible();
    const plan = await openPlan(page);
    await expect(plan.getByRole('region', { name: 'Today' }).locator('li')).toHaveCount(2);
    await expect(plan).toContainText('Demo deck');
    await expect(plan).toContainText('Sleep early');
    await plan.getByRole('button', { name: 'Confirm plan' }).click();
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li')).toHaveCount(2);
    expect(confirmed).toEqual([{ date, draftId: 'draft-1', version: 4 }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
