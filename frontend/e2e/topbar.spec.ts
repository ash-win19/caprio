import { test, expect } from '@playwright/test';
import { date, mockDay, titles } from './fixtures/day';

test('login opens today with no recovery notice, and a historical review can return without a redirect or mutation', async ({ page }) => {
  const writes = await mockDay(page, { oldestUnclosedDate: '2026-09-06' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('link', { name: 'Review unfinished day' })).toHaveCount(0);
  await page.goto('/review?date=2026-09-06&reopen=1');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(`/review?date=${date}`);
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await page.getByRole('link', { name: 'View day', exact: true }).click();
  await expect(page).toHaveURL(`/today?date=${date}`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('planner drafts survive browser history and page navigation', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto(`/conversation?date=${date}&intent=interrupt&seed=Meeting%20ran%20late`);
  const input = page.getByRole('textbox', { name: 'Message about your day' });
  await expect(input).toHaveValue('Meeting ran late');
  await expect(page).not.toHaveURL(/seed=/);
  await input.fill('Keep my unsubmitted planning notes');
  await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
  await expect(page).toHaveURL('/today');
  await page.goBack();
  await expect(input).toHaveValue('Keep my unsubmitted planning notes');
  await page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL('/momentum');
  await page.goBack();
  await expect(input).toHaveValue('Keep my unsubmitted planning notes');
  expect(writes).toEqual([]);
});

test('review outcomes and notes stay with their selected date until explicitly closed', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto(`/review?date=${date}`);
  for (const title of titles) await page.getByRole('button', { name: `Done: ${title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Add a reflection' }).click();
  await page.getByRole('textbox', { name: /Notes for tomorrow/ }).fill('Keep these notes for this day');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('textbox', { name: /Notes for tomorrow/ })).toHaveValue('Keep these notes for this day');
  await page.getByRole('link', { name: 'View day', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: /Notes for tomorrow/ })).toHaveValue('Keep these notes for this day');
  expect(writes).toEqual([]);
});

test('date picker clears one-time context, rejects a future review, and restores focus', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto('/review?date=2026-09-06&reopen=1');
  await page.getByRole('button', { name: /^Choose day,/ }).click();
  const picker = page.getByLabel('Choose a day', { exact: true });
  await picker.fill('2026-09-15');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'View day' })).toBeDisabled();
  await picker.fill('2026-09-13');
  await page.getByRole('dialog').getByRole('button', { name: 'View day' }).click();
  await expect(page).toHaveURL('/review?date=2026-09-13');
  await page.getByRole('button', { name: /^Choose day,/ }).click();
  await picker.press('Escape');
  await expect(page.getByRole('button', { name: /^Choose day,/ })).toBeFocused();
  expect(writes).toEqual([]);
});

for (const width of [320, 390, 768, 1024]) {
  test(`the app bar and page header fit every workspace route at ${width}px`, async ({ page }, info) => {
    test.setTimeout(60_000); // This case loads ten routes; each assertion keeps its normal timeout.
    await page.setViewportSize({ width, height: 844 });
    await mockDay(page);
    for (const route of ['/today', '/conversation', '/capture', '/review?date=2026-09-06', '/momentum', '/settings', '/settings/categories', '/settings/notifications', '/settings/voice', '/missing']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('.app-topbar')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
      for (const bar of ['.app-bar', '.app-topbar']) {
        expect(await page.locator(bar).evaluate(header => [...header.querySelectorAll('a,button,h1')].filter(e => e.getClientRects().length).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })), `${bar} ${route}`).toBe(true);
      }
      await expect(page.getByRole('navigation', { name: 'App' })).toBeVisible();
    }
    await page.goto('/conversation');
    const composer = await page.getByRole('textbox', { name: 'Message about your day' }).boundingBox();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: info.outputPath(`topbar-${width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('large text and a reduced mobile viewport keep date controls and the composer reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockDay(page);
  await page.goto('/review?date=2025-12-31');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByRole('button', { name: /^Choose day,/ })).toContainText('2025');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/conversation');
  await page.setViewportSize({ width: 390, height: 480 });
  const composer = page.getByRole('textbox', { name: 'Message about your day' });
  await composer.fill('Visible while typing');
  const box = await composer.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(480);
});

test('enlarged text on a short phone screen leaves the conversation readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  const opener = 'Morning. Two tasks carried over. What is on today?';
  await mockDay(page, { opener });
  await page.goto('/conversation');
  const composer = page.getByRole('textbox', { name: 'Message about your day' });
  await expect(composer).toBeEnabled();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  // The opener can be scrolled fully into view without a bar or the composer covering it.
  const message = page.getByText(opener, { exact: true });
  // Retried, because the thread's own scroll to its latest message can land after ours.
  await expect.poll(async () => {
    await message.evaluate(element => element.scrollIntoView({ block: 'center' }));
    const box = (await message.boundingBox())!;
    return box.y >= 0 && box.y + box.height <= 480;
  }).toBe(true);
  const uncovered = await message.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return [0.2, 0.5, 0.8].every(at => element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height * at)));
  });
  expect(uncovered).toBe(true);
  await composer.scrollIntoViewIfNeeded();
  await composer.fill('Still reachable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
