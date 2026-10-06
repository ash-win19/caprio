// Feature: features/inbox.md (inbox-capture, inbox-persist, inbox-add-to-today).
// Run: control-caprio up && control-caprio drive .cursor/skills/verify-caprio/drives/inbox-capture.stack.spec.ts
import { test, expect } from '@playwright/test';
import { enterAsDemoUser, env, localDay, proof, requireMode, sql } from '../lib/caprio';

test('inbox: capture a task, see it persist, then add it to today', async ({ page }) => {
  requireMode('stack');
  const title = `Verify inbox ${env.run}`;
  const rowQuery = `select status, planned_for_date from tasks where title = '${title}'`;

  await enterAsDemoUser(page);
  const today = await localDay(page);

  // Reach Inbox from primary navigation, as a user does.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Inbox' }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  expect(sql(rowQuery), 'no task with this title before the run').toBe('');

  const form = page.getByRole('form', { name: 'Add an inbox task' });
  await form.getByLabel('What do you need to do?').fill(title);
  await proof(page, '01-inbox-draft');
  await form.getByRole('button', { name: 'Add task' }).click();

  await expect(page.getByText('Task saved to your inbox.')).toBeVisible();
  const row = page.getByRole('list', { name: 'Inbox tasks' }).getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();
  await proof(page, '02-inbox-saved');
  expect(sql(rowQuery, '02-db-after-capture.txt')).toBe(`backlog\t${today}`);

  // A second view of the stored value: reload and find it again.
  await page.reload();
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.getByText(`${title} added to today's plan.`)).toBeVisible();
  await expect(row).toHaveCount(0);
  await proof(page, '03-inbox-added-to-today');
  expect(sql(rowQuery, '03-db-after-add-to-today.txt')).toBe(`planned\t${today}`);

  // The task now appears on Today's checklist (the View tasks route for today).
  await page.goto(`/today?date=${today}`);
  await expect(page.getByRole('list', { name: 'Remaining tasks' })).toContainText(title);
  await proof(page, '04-today-list');
});
