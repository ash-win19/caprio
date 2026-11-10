import { test, expect } from '@playwright/test';
import { mockDay } from './fixtures/day';

for (const width of [390, 1440]) {
  test(`a brand-new account goes straight to the Conversation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // No tasks, no categories, never planned, first open on this device.
    const writes = await mockDay(page, { state: 'planning', tasks: [], firstVisit: true, opener: 'Morning. What’s on today?' });
    await page.goto('/');
    await expect(page).toHaveURL('/conversation');
    await expect(page.getByText('Morning. What’s on today?', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message about your day' })).toBeEnabled();
    await expect(page.getByText(/categories|Set up|Get started/i)).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test('the old setup and Settings routes lead to Today', async ({ page }) => {
  await mockDay(page);
  for (const route of ['/onboarding', '/onboarding/prefs', '/settings', '/settings/categories', '/settings/notifications', '/settings/voice']) {
    await page.goto(route);
    await expect(page, route).toHaveURL('/today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  }
});

test('a new account that opens an old setup link still starts in the Conversation', async ({ page }) => {
  await mockDay(page, { state: 'planning', tasks: [], firstVisit: true });
  await page.goto('/onboarding');
  await expect(page).toHaveURL('/conversation');
});
