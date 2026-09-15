import { test, expect } from '@playwright/test';
import { date, mockDay, titles } from './fixtures/day';

test('login opens today and historical review can return without a redirect or mutation', async ({ page }) => {
  const writes = await mockDay(page, { oldestUnclosedDate: '2026-09-06' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('link', { name: 'Review unfinished day' }).click();
  await expect(page).toHaveURL(/\/review\?date=2026-09-06&reopen=1$/);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(`/review?date=${date}`);
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await page.getByRole('link', { name: 'View day', exact: true }).click();
  await expect(page).toHaveURL(`/today?date=${date}`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test('planner drafts survive date selection, browser history and page navigation', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto(`/new?date=${date}&intent=interrupt&seed=Meeting%20ran%20late`);
  const input = page.getByRole('textbox', { name: 'Message about your day' });
  await expect(input).toHaveValue('Meeting ran late');
  await expect(page).not.toHaveURL(/seed=/);
  await input.fill('Keep my unsubmitted planning notes');
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page).toHaveURL('/new?date=2026-09-15');
  await expect(input).toHaveValue('');
  await input.fill('A separate draft for tomorrow');
  await page.goBack();
  await expect(input).toHaveValue('Keep my unsubmitted planning notes');
  await page.goForward();
  await expect(input).toHaveValue('A separate draft for tomorrow');
  await page.getByRole('link', { name: 'View day', exact: true }).click();
  await page.goBack();
  await expect(input).toHaveValue('A separate draft for tomorrow');
  expect(writes).toEqual([]);
});

test('review outcomes and notes stay with their selected date until explicitly closed', async ({ page }) => {
  const writes = await mockDay(page);
  await page.goto(`/review?date=${date}`);
  for (const title of titles) await page.getByRole('button', { name: `Done: ${title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('textbox', { name: /Notes for tomorrow/ }).fill('Keep these notes for this day');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
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
  test(`shared header and mobile navigation fit every workspace route at ${width}px`, async ({ page }, info) => {
    test.setTimeout(60_000); // This case loads ten routes; each assertion keeps its normal timeout.
    await page.setViewportSize({ width, height: 844 });
    await mockDay(page, { collapsed: false });
    for (const route of ['/today', '/new', '/capture', '/review?date=2026-09-06', '/momentum', '/settings', '/settings/categories', '/settings/notifications', '/settings/voice', '/missing']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('.app-topbar')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
      expect(await page.locator('.app-topbar').evaluate(header => [...header.querySelectorAll('a,button,h1')].filter(e => e.getClientRects().length).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })), route).toBe(true);
      if (width < 768) await expect(page.getByRole('navigation', { name: 'Mobile primary' })).toBeVisible();
    }
    await page.goto('/new');
    if (width < 768) {
      await page.getByRole('button', { name: 'Open conversation history' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').press('Escape');
      await expect(page.getByRole('button', { name: 'Open conversation history' })).toBeFocused();
      const composer = await page.getByRole('textbox', { name: 'Message about your day' }).boundingBox();
      const nav = await page.getByRole('navigation', { name: 'Mobile primary' }).boundingBox();
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y);
    } else {
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    }
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
  await page.goto('/new');
  await page.setViewportSize({ width: 390, height: 480 });
  const composer = page.getByRole('textbox', { name: 'Message about your day' });
  await composer.fill('Visible while typing');
  const box = await composer.boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Mobile primary' }).boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
});
