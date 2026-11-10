import { test, expect, type Page } from '@playwright/test';
import { mockDay, date, historyDay, tasksForDay } from './fixtures/day';
import type { Workflow } from '../src/lib/api';

const history = () => [
  historyDay({ date: '2026-09-13', note: 'Lab took twice as long as I guessed.', done: ['CS 61B lab 6', 'Gym'], carried: ['Update résumé'], dropped: ['Clean desk'] }),
  historyDay({ date: '2026-09-11', wrappedUp: false, done: ['Stats quiz prep'], carried: ['Update résumé'] }),
  historyDay({ date: '2026-09-10', done: ['Call Mom'] }),
];

const dayCard = (page: Page, label: string) => page.getByRole('list', { name: 'Past days' }).getByRole('listitem').filter({ hasText: label });

for (const width of [390, 1440]) {
  test(`History lists what happened to each past day's tasks at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await mockDay(page, { history: history() });
    await page.goto('/today');
    await page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL('/history');
    await expect(page.getByRole('heading', { level: 1, name: 'History', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Past days' }).getByRole('listitem')).toHaveCount(3);

    const sunday = dayCard(page, 'Sunday, September 13');
    await expect(sunday).toContainText('2 done · 1 carried · 1 dropped');
    await expect(sunday.getByRole('group', { name: 'Done' })).toHaveText(/CS 61B lab 6.*Gym/);
    await expect(sunday.getByRole('group', { name: 'Carried' })).toContainText('Update résumé');
    await expect(sunday.getByRole('group', { name: 'Dropped' })).toContainText('Clean desk');
    await expect(sunday).toContainText('Lab took twice as long as I guessed.');
    // Each outcome has its own colour, so the three are easy to tell apart.
    const colours = await Promise.all(['Done', 'Carried', 'Dropped'].map(name => sunday.getByRole('group', { name }).locator('span').evaluate(label => getComputedStyle(label).color)));
    expect(new Set(colours).size).toBe(3);
    await expect(sunday).not.toContainText('Not wrapped up');

    const friday = dayCard(page, 'Friday, September 11');
    await expect(friday).toContainText('1 done · 1 carried · 0 dropped');
    await expect(friday).toContainText('Not wrapped up');
    await expect(friday.getByRole('group', { name: 'Dropped' })).toHaveCount(0);
    // Wrapped up without a note: neither a note nor "Not wrapped up".
    await expect(dayCard(page, 'Thursday, September 10')).not.toContainText('wrapped up');

    // No weekly summary and no search.
    await expect(page.getByText(/Last 7 days/)).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'History', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath(`history-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('History says so when there are no past days', async ({ page }) => {
  await mockDay(page);
  await page.goto('/history');
  await expect(page.getByText('Your past days will show up here.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Past days' })).toHaveCount(0);
});

test('a day that ended before task names were kept shows its counts', async ({ page }) => {
  await mockDay(page, { history: [historyDay({ date: '2026-09-01', taskDetailsAvailable: false, doneCount: 2, carriedCount: 1, droppedCount: 0 })] });
  await page.goto('/history');
  const day = dayCard(page, 'Tuesday, September 1');
  await expect(day).toContainText('2 done · 1 carried · 0 dropped');
  await expect(day).toContainText('Task names weren’t recorded for this day.');
});

for (const width of [390, 1440]) {
  test(`a past day opens read-only with its tasks and Conversation at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const [base] = tasksForDay();
    const archived: Workflow = {
      date: '2026-09-13', state: 'closed', version: 4, plan: null, availableMinutes: null, backlog: [],
      review: { completedCount: 1, carriedToTomorrowCount: 1, droppedCount: 1, notes: 'Lab took twice as long as I guessed.', energyLevel: null },
      tasks: [
        { ...base, id: 'lab', title: 'CS 61B lab 6', completed: true, status: 'completed', plannedForDate: '2026-09-13' },
        { ...base, id: 'resume', title: 'Update résumé', status: 'planned', plannedForDate: date, deferCount: 3 },
        { ...base, id: 'desk', title: 'Clean desk', status: 'dropped', plannedForDate: '2026-09-13' },
      ],
      messages: [
        { id: 'o', role: 'event', eventType: 'opener', content: 'Morning. What’s on today?' },
        { id: 'u', role: 'user', content: 'Lab 6 is due tonight, and I should update my résumé.' },
        { id: 'a', role: 'assistant', content: 'Lab first since it’s due tonight.' },
        { id: 's', role: 'event', eventType: 'plan_saved', content: 'Plan saved · 3 tasks' },
      ],
    };
    const writes = await mockDay(page, { history: history() });
    await page.route('**/api/workflow?date=2026-09-13', route => route.fulfill({ json: archived }));
    await page.goto('/history');
    await dayCard(page, 'Sunday, September 13').getByRole('link', { name: /Sunday, September 13/ }).click();
    await expect(page).toHaveURL('/history/2026-09-13');
    await expect(page.getByRole('heading', { level: 1, name: 'Sunday, September 13, 2026' })).toBeVisible();
    await expect(page.getByText('Read-only', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Done' }).getByRole('listitem')).toHaveText(['CS 61B lab 6']);
    await expect(page.getByRole('region', { name: 'Carried' }).getByRole('listitem')).toHaveText(['Update résumé']);
    await expect(page.getByRole('region', { name: 'Dropped' }).getByRole('listitem')).toHaveText(['Clean desk']);
    await expect(page.getByText('Lab took twice as long as I guessed.')).toBeVisible();

    const conversation = page.getByRole('region', { name: 'Conversation' });
    await expect(conversation).toContainText('Morning. What’s on today?');
    await expect(conversation).toContainText('Lab 6 is due tonight, and I should update my résumé.');
    await expect(conversation).toContainText('Lab first since it’s due tonight.');

    // Nothing here can change the past.
    const main = page.getByRole('main');
    await expect(main.getByRole('textbox')).toHaveCount(0);
    await expect(main.getByRole('checkbox')).toHaveCount(0);
    await expect(main.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'History', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`history-day-${width}.png`), fullPage: true, animations: 'disabled' });

    await page.getByRole('link', { name: 'History', exact: true }).first().click();
    await expect(page).toHaveURL('/history');
    expect(writes).toEqual([]);
  });
}

test('a past day shows how it ended: not wrapped up, wrapped up then continued, or without task names', async ({ page }) => {
  await mockDay(page, { history: history() });
  const [base] = tasksForDay();
  const ended = (review: Partial<NonNullable<Workflow['review']>>, extra: Partial<Workflow> = {}): Workflow => ({
    date: '2026-09-11', state: 'closed', version: 2, plan: null, availableMinutes: null, backlog: [], messages: [],
    tasks: [{ ...base, id: 'quiz', title: 'Stats quiz prep', completed: true, status: 'completed' }],
    review: { completedCount: 1, carriedToTomorrowCount: 0, droppedCount: 0, notes: '', energyLevel: null, ...review }, ...extra,
  });
  const record = (id: string, review: NonNullable<Workflow['review']>) => ({ id, createdAt: '2026-09-11T20:00:00Z', review, tasks: [], taskDetailsAvailable: true });
  let day = ended({ automatic: true });
  await page.route('**/api/workflow?date=2026-09-11', route => route.fulfill({ json: day }));

  await page.goto('/history/2026-09-11');
  await expect(page.getByRole('region', { name: 'Done' }).getByRole('listitem')).toHaveText(['Stats quiz prep']);
  await expect(page.getByText('Not wrapped up', { exact: true })).toBeVisible();
  await expect(page.getByText('No conversation that day.')).toBeVisible();

  // Wrapped up with a note, continued, then ended by Rollover: the note stands.
  const own = { completedCount: 1, carriedToTomorrowCount: 0, droppedCount: 0, notes: 'Quiz went fine.', energyLevel: null };
  day = ended({ automatic: true }, { reviewHistory: [record('first', own), record('second', { ...own, notes: '', automatic: true })] });
  await page.reload();
  await expect(page.getByText('Quiz went fine.', { exact: true })).toBeVisible();
  await expect(page.getByText('Not wrapped up')).toHaveCount(0);

  day = ended({ completedCount: 2 }, { tasks: [], taskDetailsAvailable: false });
  await page.reload();
  await expect(page.getByText('Task names weren’t recorded for this day.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Done' })).toHaveCount(0);
});

test('today, a future day and a malformed date have no History page', async ({ page }) => {
  await mockDay(page, { history: history() });
  for (const value of [date, '2026-09-20', 'yesterday']) {
    await page.goto(`/history/${value}`);
    await expect(page).toHaveURL('/history');
  }
});

test('the old History route and dated Today links lead somewhere sensible', async ({ page }) => {
  await mockDay(page, { history: history() });
  await page.goto('/momentum');
  await expect(page).toHaveURL('/history');
  // Past days live in History now; Today is always the current day.
  await page.goto('/today?date=2026-09-13');
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Monday, September 14', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Add a task to today' })).toBeVisible();
});
