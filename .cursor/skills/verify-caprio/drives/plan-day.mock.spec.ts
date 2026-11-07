// Feature: features/plan-day.md (plan-compose, plan-draft, plan-confirm, plan-discard).
// Mock mode only: the Caprio Daily Planner (Mastra) needs a GROQ_API_KEY that local
// checkouts do not have, so the API is answered in the browser using the repo's own
// e2e fixture (frontend/e2e/fixtures/day.ts). Asserts the contract that chat never
// writes tasks; only Confirm plan / Discard proposal do.
// Run: control-caprio up --mode mock && control-caprio drive .cursor/skills/verify-caprio/drives/plan-day.mock.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { mockDay, date, tasksForDay } from '../e2e/fixtures/day';
import type { Workflow } from '../src/lib/api';
import { proof, requireMode, saveEvidence } from '../lib/caprio';

const DUMP = 'Essay draft for history due Friday, problem set 4, email Prof. Lee about the lab. About 6 hours outside class.';

async function plannerBackend(page: Page) {
  const base = tasksForDay()[0];
  let workflow: Workflow = { date, state: 'planning', version: 1, messages: [], tasks: [], backlog: [], proposal: null, availableMinutes: null, review: null, changeReceipts: [] };
  const writes: Array<{ path: string; body: unknown }> = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workflow') return route.fulfill({ json: workflow });
    if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
    if (path === '/api/chat/stream') {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      workflow = { ...workflow, version: 2, availableMinutes: 360,
        messages: [{ id: 'u1', role: 'user', content: body.content }, { id: 'a1', role: 'assistant', content: 'Here is a draft for your 6 hours.' }],
        proposal: { id: 'draft-1', summary: 'Three tasks for today.', availableMinutes: 360, tasks: [], operations: [
          { kind: 'create', date, fields: { title: 'Essay draft for history', duration: 150 } },
          { kind: 'create', date, fields: { title: 'Problem set 4', duration: 120 } },
          { kind: 'create', date, fields: { title: 'Email Prof. Lee about the lab', duration: 10 } },
        ] } };
      return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ text: 'Here is a draft for your 6 hours.', workflow })}\n\n` });
    }
    if (path === '/api/day/plan/confirm') {
      writes.push({ path, body: route.request().postDataJSON() });
      const created = [['essay', 'Essay draft for history', 150], ['pset', 'Problem set 4', 120], ['email', 'Email Prof. Lee about the lab', 10]] as const;
      workflow = { ...workflow, version: 3, state: 'active', proposal: null,
        tasks: created.map(([id, title, duration], sortOrder) => ({ ...base, id, title, duration, sortOrder })) };
      return route.fulfill({ json: workflow });
    }
    if (path === '/api/day/plan/discard') {
      writes.push({ path, body: route.request().postDataJSON() });
      workflow = { ...workflow, version: 3, proposal: null };
      return route.fulfill({ json: workflow });
    }
    return route.fallback();
  });
  return writes;
}

async function sendDump(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL('/new');
  const input = page.getByRole('textbox', { name: 'Message about your day' });
  await input.fill(DUMP);
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  const proposal = page.getByRole('region', { name: 'Proposed plan' });
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText('Essay draft for history');
  return proposal;
}

test('plan-confirm: a dump becomes a draft plan, and only Confirm plan saves it', async ({ page }) => {
  requireMode('mock');
  await mockDay(page, { state: 'planning', tasks: [], firstVisit: true });
  const writes = await plannerBackend(page);
  const proposal = await sendDump(page);
  await expect(proposal.getByRole('button', { name: 'Confirm plan' })).toBeVisible();
  await expect(proposal.getByRole('button', { name: 'Discard proposal' })).toBeVisible();
  expect(writes.map(w => w.path), 'chat alone writes nothing but the message').toEqual(['/api/chat/stream']);
  await proof(page, '01-draft-plan');

  await proposal.getByRole('button', { name: 'Confirm plan' }).click();
  await expect(page).toHaveURL('/today');
  await expect(page.getByRole('list', { name: 'Remaining tasks' }).locator(':scope > li')).toHaveCount(3);
  await proof(page, '02-today-after-confirm');
  expect(writes.find(w => w.path === '/api/day/plan/confirm')?.body).toMatchObject({ date, proposalId: 'draft-1' });
  saveEvidence('confirm-writes.json', JSON.stringify(writes, null, 2));
});

test('plan-discard: Discard proposal clears the draft and saves no tasks', async ({ page }) => {
  requireMode('mock');
  await mockDay(page, { state: 'planning', tasks: [], firstVisit: true });
  const writes = await plannerBackend(page);
  const proposal = await sendDump(page);
  await proposal.getByRole('button', { name: 'Discard proposal' }).click();
  await expect(page.getByRole('region', { name: 'Proposed plan' })).toHaveCount(0);
  await expect(page).toHaveURL('/new');
  await proof(page, '03-after-discard');
  expect(writes.map(w => w.path)).toEqual(['/api/chat/stream', '/api/day/plan/discard']);
  saveEvidence('discard-writes.json', JSON.stringify(writes, null, 2));
});
