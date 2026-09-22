import { test, expect } from '@playwright/test';
import { mockDay, date, tasksForDay } from './fixtures/day';
import type { Workflow } from '../src/lib/api';

for (const width of [390, 1440]) {
  test(`conversation draft requires confirm before checklist changes at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockDay(page);
    const original = tasksForDay().slice(0, 1);
    let workflow: Workflow = { date, state: 'active', version: 1, messages: [], tasks: original, backlog: [], proposal: null, availableMinutes: 30, review: null, changeReceipts: [] };
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') return route.fulfill({ json: workflow });
      if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
      if (path === '/api/chat/stream') {
        const body = route.request().postDataJSON();
        writes.push({ path, body });
        workflow = { ...workflow, version: 2, messages: [{ id: 'u1', role: 'user', content: body.content }, { id: 'a1', role: 'assistant', content: 'Review this draft.' }],
          proposal: { id: 'draft-1', summary: 'Add two tasks to this day.', availableMinutes: 30, tasks: [],
            operations: [
              { kind: 'create', date, fields: { title: 'Fix Headlines publishing', description: 'Preserve the Headlines brand and use Cozad’s feedback.' } },
              { kind: 'create', date, fields: { title: 'Prepare tomorrow’s demo' } },
            ] } };
        return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text: 'Review this draft.', workflow })}\n\n` });
      }
      if (path === '/api/day/plan/confirm') {
        writes.push({ path, body: route.request().postDataJSON() });
        workflow = { ...workflow, version: 3, state: 'active', proposal: null, tasks: [...original,
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
    const proposal = page.getByRole('region', { name: 'Proposed plan' });
    await expect(proposal).toBeVisible();
    await expect(proposal.getByRole('button', { name: 'Confirm plan' })).toBeVisible();
    await expect(page.getByText('1 remaining', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Saved task changes' })).toHaveCount(0);
    expect(writes[0].body).toMatchObject({ contractVersion: 2, date, taskId: 'referenced-inbox-task' });
    await proposal.getByRole('button', { name: 'Confirm plan' }).click();
    // Confirm opens bare /today for local today (fixture clock = date) so overnight tabs are not pinned.
    await expect(page).toHaveURL('/today');
    await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li')).toHaveCount(3);
    await expect(page.locator('.today-page')).toContainText('280 min estimated remaining');
    const publishing = page.getByRole('listitem').filter({ hasText: 'Fix Headlines publishing' });
    await publishing.locator('summary').click();
    await expect(publishing.getByText('Preserve the Headlines brand and use Cozad’s feedback.')).toBeVisible();
    expect(writes.find(write => write.path === '/api/day/plan/confirm')?.body).toMatchObject({ date, proposalId: 'draft-1' });
    expect(writes.filter(write => write.path === '/api/chat/stream')).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`conversation-confirmed-${width}.png`), animations: 'disabled' });
  });
}

test('an operation suggestion names the existing task without claiming unrelated removals', async ({ page }) => {
  const tasks = tasksForDay();
  await mockDay(page, { tasks, proposal: { id: 'suggestion', summary: 'Move research to tomorrow?', availableMinutes: 30, tasks: [],
    operations: [{ kind: 'move', taskId: tasks[1].id, date: '2026-09-15' }], taskTitles: { [tasks[1].id]: tasks[1].title },
  } });
  await page.goto(`/new?date=${date}`);
  const proposal = page.getByRole('region', { name: 'Proposed plan' });
  await expect(proposal.getByRole('list', { name: 'Suggested task changes' })).toContainText(tasks[1].title);
  await expect(proposal).not.toContainText('Deferred or removed');
  await expect(proposal.getByRole('button', { name: 'Confirm plan' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved task changes' })).toHaveCount(0);
});
