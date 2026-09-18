import { test, expect } from '@playwright/test';
import { mockDay, date, tasksForDay } from './fixtures/day';
import type { Workflow, ChangeReceipt } from '../src/lib/api';

for (const width of [390, 1440]) {
  test(`conversation saves to the same checklist and restores it with Undo at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockDay(page);
    const original = tasksForDay().slice(0, 1);
    let workflow: Workflow = { date, state: 'active', version: 1, messages: [], tasks: original, backlog: [], proposal: null, availableMinutes: 30, review: null, changeReceipts: [] };
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    let requestId = '';
    let saved = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/workflow') return route.fulfill({ json: workflow });
      if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
      if (path === '/api/chat/stream') {
        const body = route.request().postDataJSON();
        writes.push({ path, body }); requestId = body.requestId;
        const receipt: ChangeReceipt = { id: 'change-1', requestId, summary: 'Added 2 tasks', changes: [
          { taskId: 'publishing', title: 'Fix Headlines publishing', action: 'Added', date },
          { taskId: 'demo', title: 'Prepare tomorrow’s demo', action: 'Added', date },
        ], affectedDates: [date], canUndo: true, undone: false };
        if (!saved) {
          saved = true;
          workflow = { ...workflow, version: 2, tasks: [...original,
            { ...original[0], id: 'publishing', title: receipt.changes[0].title, description: 'Preserve the Headlines brand and use Cozad’s feedback.', duration: 120, sortOrder: 1 },
            { ...original[0], id: 'demo', title: receipt.changes[1].title, duration: 120, sortOrder: 2 },
          ], messages: [{ id: 'u1', role: 'user', content: body.content }, { id: 'a1', role: 'assistant', content: 'Both tasks belong to this day.' }], changeReceipts: [receipt] };
          // Simulate losing the response after the server commits. Retry must
          // recover the committed turn instead of making another task.
          return route.abort('connectionreset');
        }
        return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text: 'Both tasks belong to this day.', workflow, appliedChange: receipt })}\n\n` });
      }
      if (path === '/api/task-changes/change-1/undo') {
        writes.push({ path, body: {} });
        workflow = { ...workflow, version: 3, tasks: original, changeReceipts: [{ ...workflow.changeReceipts![0], undone: true, canUndo: false }] };
        return route.fulfill({ json: workflow });
      }
      return route.fallback();
    });
    await page.goto(`/new?date=${date}&taskId=referenced-inbox-task`);
    const checklist = page.getByRole('region', { name: 'Saved checklist' });
    await expect(checklist).toHaveCount(0);
    await expect(page.getByText('1 remaining', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message about your day' }).fill('I have to fix Headlines publishing and prepare tomorrow’s demo. Two hours each.');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    const receipts = page.getByRole('region', { name: 'Saved task changes' });
    await expect(receipts).toContainText('Added 2 tasks');
    await expect(page.getByText('3 remaining', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm plan' })).toHaveCount(0);
    await page.getByRole('link', { name: 'View tasks', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li')).toHaveCount(3);
    await expect(page.locator('.today-page')).toContainText('280 min estimated remaining');
    const publishing = page.getByRole('listitem').filter({ hasText: 'Fix Headlines publishing' });
    await publishing.locator('summary').click();
    await expect(publishing.getByText('Preserve the Headlines brand and use Cozad’s feedback.')).toBeVisible();
    await page.goBack();
    await expect(receipts).toContainText('Added 2 tasks');
    expect(writes[0].body).toMatchObject({ contractVersion: 2, date, taskId: 'referenced-inbox-task' });
    expect(requestId).toBeTruthy();
    await page.reload();
    await expect(receipts).toContainText('Added 2 tasks');
    expect(writes.filter(write => write.path === '/api/chat/stream')).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`conversation-saved-${width}.png`), animations: 'disabled' });
    await receipts.getByRole('button', { name: 'Undo added 2 tasks' }).click();
    await expect(receipts.getByText('Undone', { exact: true })).toBeVisible();
    await expect(page.getByText('1 remaining', { exact: true })).toBeVisible();
    await expect(receipts.getByRole('button', { name: 'Undo added 2 tasks' })).toBeDisabled();
    await page.getByRole('link', { name: 'View tasks', exact: true }).click();
    await expect(page).toHaveURL(`/today?date=${date}`);
    await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li')).toHaveCount(1);
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
