// Features: features/today.md (today-check), features/review.md (review-close),
// features/history.md (history-list). Seeds its own task through Inbox, so it
// runs on a fresh stack run. It CLOSES today in the throwaway DB: run it last.
// Run: control-caprio drive .cursor/skills/verify-caprio/drives/day-loop.stack.spec.ts
import { test, expect } from '@playwright/test';
import { enterAsDemoUser, env, localDay, proof, requireMode, sql } from '../lib/caprio';

test('day loop: check off on Today, close the day in Review, find it in History', async ({ page }) => {
  requireMode('stack');
  const title = `Verify day loop ${env.run}`;
  await enterAsDemoUser(page);
  const today = await localDay(page);
  const nav = page.getByRole('navigation', { name: 'Primary' });

  // Seed: one task on today's plan, created through Inbox.
  await nav.getByRole('link', { name: 'Inbox' }).click();
  await page.getByLabel('What do you need to do?').fill(title);
  await page.getByRole('button', { name: 'Add task' }).click();
  const row = page.getByRole('list', { name: 'Inbox tasks' }).getByRole('listitem').filter({ hasText: title });
  await row.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.getByText(`${title} added to today's plan.`)).toBeVisible();

  // Today: check the task off; the checkbox is server-backed, so wait for the progress value.
  await page.goto(`/today?date=${today}`);
  const progress = page.getByRole('progressbar', { name: 'Tasks completed' });
  const before = Number(await progress.getAttribute('aria-valuenow'));
  await page.getByRole('checkbox', { name: `Mark ${title} complete` }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', String(before + 1));
  await proof(page, '01-today-checked');
  expect(sql(`select status, completed from tasks where title = '${title}'`, '01-db-task.txt')).toBe('completed\tt');

  // Review: unfinished tasks default to Tomorrow; Continue, then Close day.
  await nav.getByRole('link', { name: /^Review/ }).click();
  await expect(page).toHaveURL(/\/review/);
  await expect(page.getByRole('heading', { name: 'Review your tasks' })).toBeVisible();
  await proof(page, '02-review-step1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your day' })).toBeVisible();
  await page.getByRole('button', { name: 'Close day' }).click();
  await expect(page.getByText('Day closed')).toBeVisible();
  await proof(page, '03-review-closed');
  expect(sql(`select state from daily_plans where plan_date = '${today}'`, '03-db-plan.txt')).toBe('closed');
  expect(Number(sql(`select count(*) from day_reviews where plan_date = '${today}'`, '03-db-reviews.txt'))).toBeGreaterThanOrEqual(1);

  // History: the closed day is listed with its outcomes.
  await nav.getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(/\/momentum$/);
  await expect(page.getByRole('region', { name: 'Last 7 days' })).toContainText('Closed');
  await expect(page.getByRole('list', { name: 'Saved days' }).getByRole('link', { name: /^View day for / })).not.toHaveCount(0);
  await proof(page, '04-history');
});
