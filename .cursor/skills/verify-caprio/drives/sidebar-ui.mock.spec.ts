import { test, expect } from '@playwright/test';
import { requireMode, proof } from '../lib/caprio';
import { mockDay, date, tasksForDay } from '../e2e/fixtures/day';

test.beforeEach(async ({ page }) => {
  requireMode('mock');
  
  // Set up mock session and pin clock
  await mockDay(page, {
    date,
    tasks: tasksForDay(),
  });
  
  // Mock the conversations list API  
  await page.route('**/api/chat/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: [
          {
            id: 'conv-1',
            title: 'Morning workout planning',
            message_count: 5,
            last_message_at: '2026-09-14T08:15:00Z',
          },
          {
            id: 'conv-2',
            title: 'Exam preparation schedule',
            message_count: 8,
            last_message_at: '2026-09-14T10:00:00Z',
          },
          {
            id: 'conv-3',
            title: 'Project deadline discussion',
            message_count: 12,
            last_message_at: '2026-09-14T11:45:00Z',
          },
        ],
      }),
    });
  });
  
  // Navigate to Today page
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
});

test('sidebar shows conversation titles without date/count line', async ({ page }) => {
  await proof(page, 'sidebar-conversation-list-expanded');
  
  // Check that conversations are visible
  await expect(page.locator('[aria-label="Primary"]')).toBeVisible();
  
  // Verify conversation titles are shown (single line)
  const conv1 = page.locator('text=Morning workout planning').first();
  await expect(conv1).toBeVisible();
  
  const conv2 = page.locator('text=Exam preparation schedule').first();
  await expect(conv2).toBeVisible();
  
  // Check that date/message count are NOT rendered
  // The second line was removed, so conversations should be compact
  const conversationItems = page.locator('[aria-label="Primary"] a[href^="/plan/"]');
  const first = conversationItems.first();
  
  // Get bounding box to verify single-line height (approximate)
  const box = await first.boundingBox();
  if (box) {
    // Single-line items should be roughly 40-60px tall, not 60-80px
    expect(box.height).toBeLessThan(70);
  }
});

test('profile menu opens and contains Settings link', async ({ page }) => {
  // Find and click profile button
  const profileButton = page.locator('button').filter({ hasText: /account menu/i }).first();
  await expect(profileButton).toBeVisible();
  
  await profileButton.click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  
  await proof(page, 'profile-menu-opened');
  
  // Verify Settings link is in the menu
  const settingsLink = page.locator('[role="menuitem"] a[href="/settings"]');
  await expect(settingsLink).toBeVisible();
  await expect(settingsLink).toHaveText(/Settings/i);
});

test('profile menu closes with Escape key', async ({ page }) => {
  const profileButton = page.locator('button').filter({ hasText: /account menu/i }).first();
  await profileButton.click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  
  // Press Escape
  await page.keyboard.press('Escape');
  
  // Verify menu is closed
  await expect(page.locator('[role="menu"]')).not.toBeVisible();
  
  await proof(page, 'profile-menu-closed-after-escape');
});

test('profile menu closes when clicking outside', async ({ page }) => {
  const profileButton = page.locator('button').filter({ hasText: /account menu/i }).first();
  await profileButton.click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  
  // Click outside the menu
  await page.locator('main').click({ position: { x: 100, y: 100 } });
  
  // Verify menu is closed
  await expect(page.locator('[role="menu"]')).not.toBeVisible();
  
  await proof(page, 'profile-menu-closed-after-outside-click');
});

test('sidebar collapses and profile menu still works', async ({ page }) => {
  // Collapse sidebar
  const collapseButton = page.locator('button[aria-label="Collapse sidebar"]').first();
  await collapseButton.click();
  await page.waitForTimeout(500); // Wait for animation
  
  await proof(page, 'sidebar-collapsed');
  
  // Open profile menu in collapsed state
  const profileButton = page.locator('button').filter({ hasText: /account menu/i }).first();
  await profileButton.click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  
  await proof(page, 'profile-menu-in-collapsed-sidebar');
  
  // Verify Settings link works
  const settingsLink = page.locator('[role="menuitem"] a[href="/settings"]');
  await expect(settingsLink).toBeVisible();
});

test('Settings navigation leads to settings page', async ({ page }) => {
  // Open profile menu
  const profileButton = page.locator('button').filter({ hasText: /account menu/i }).first();
  await profileButton.click();
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  
  // Click Settings link
  const settingsLink = page.locator('[role="menuitem"] a[href="/settings"]');
  await settingsLink.click();
  
  // Wait for navigation
  await page.waitForURL('**/settings');
  await page.waitForLoadState('networkidle');
  
  await proof(page, 'settings-page-from-profile-menu');
  
  // Verify we're on the settings page
  await expect(page).toHaveURL(/\/settings$/);
});
