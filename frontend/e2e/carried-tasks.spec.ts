import { test, expect } from '@playwright/test';
import { conversationDay, date, tasksForDay, planView, openPlan } from './fixtures/day';

for (const width of [390, 1440]) {
  test(`a Stale task in the morning ends up moved to Later in the Draft at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const [base] = tasksForDay();
    const reading = { ...base, id: 'reading', title: 'Read chapter 7', duration: 40, deferCount: 1 };
    const resume = { ...base, id: 'resume', title: 'Update résumé', duration: 45, deferCount: 6 };
    const opener = 'Morning. 2 tasks carried over: Read chapter 7 and Update résumé. Update résumé has carried over for 6 days. What’s on today?';
    const reply = 'The problem set is first. Update résumé has carried over for 6 days, so I moved it to Later.';
    await conversationDay(page, {
      tasks: [reading, resume], opener, carryoverOrigins: { reading: '2026-09-13', resume: '2026-09-08' },
    }, [{
      text: reply,
      plan: planView([{ ref: 'new:1', title: 'Stats problem set', badge: 'new', date, duration: 120 }], {
        carried: [{ ref: reading.id, taskId: reading.id, title: reading.title, date, duration: 40, carried: true, carriedSince: '2026-09-13' }],
        otherDays: [
          { ref: 'new:2', title: 'Study group', badge: 'new', date: '2026-09-15' },
          { ref: resume.id, taskId: resume.id, title: resume.title, date, inbox: true, badge: 'moved', duration: 45, carried: true, carriedSince: '2026-09-08' },
        ],
      }),
    }]);
    await page.goto('/');
    await expect(page).toHaveURL('/conversation');
    await expect(page.getByText(opener, { exact: true })).toBeVisible();

    await page.getByRole('textbox', { name: 'Message about your day' }).fill('Stats problem set is due at 5, about two hours.');
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page.getByText(reply, { exact: true })).toBeVisible();

    const plan = await openPlan(page);
    // Later holds undated work and work dated for a future Day, labelled with that day.
    const later = plan.getByRole('region', { name: 'Later' });
    await expect(later.locator('li')).toHaveText([/Study group.*Tuesday, September 15.*New/, /Update résumé.*Moved/]);
    await expect(later.locator('li').nth(1)).not.toContainText('September');
    await expect(plan.getByRole('region', { name: 'Carried forward' }).locator('li')).toHaveText(/Read chapter 7/);
    await expect(plan.getByText('Inbox')).toHaveCount(0);
    await expect(plan.getByRole('region', { name: 'Other days' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`stale-draft-${width}.png`), animations: 'disabled' });

    await plan.getByRole('button', { name: 'Confirm plan' }).click();
    await expect(page).toHaveURL('/today');
    await expect(page.locator('.today-page')).toContainText('Read chapter 7');
    await expect(page.locator('.today-page')).not.toContainText('Update résumé');
  });
}
