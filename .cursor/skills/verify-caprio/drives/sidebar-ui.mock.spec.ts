/**
 * Verify sidebar conversation titles and profile menu (mock mode).
 * 
 * Verifies:
 * 1. Sidebar shows conversation sessions (without date/message-count line)
 * 2. Profile menu opens from avatar click
 * 3. Settings link visible in profile dropdown
 * 4. Settings removed from main navigation
 */

import { test, expect } from '@playwright/test';
import { requireMode, localDay, proof, env } from '../lib/caprio';
import { mockDay } from '../e2e/fixtures/day';

test.describe('Sidebar UI and Profile Menu', () => {
  test.beforeEach(async ({ page }) => {
    requireMode('mock');
    
    // Mock the day with multiple chat sessions to show sidebar
    await mockDay(page, {
      planState: 'confirmed',
      tasks: [
        { title: 'Morning workout', status: 'open', plannedForDate: localDay(page) },
        { title: 'Study session', status: 'open', plannedForDate: localDay(page) },
      ],
    });

    // Mock API endpoints
    await page.route('**/api/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            sessionDate: localDay(page),
            title: 'Morning Workout Planning', // Generated title from Mastra
            messageCount: 8,
            updatedAt: new Date().toISOString(),
            state: 'confirmed',
            completedCount: 0,
            carriedCount: 0,
            droppedCount: 0,
            plannedCount: 2,
          },
          {
            sessionDate: '2026-09-13',
            title: 'Study Schedule Review', // Another generated title
            messageCount: 5,
            updatedAt: new Date(Date.now() - 86400000).toISOString(),
            state: 'confirmed',
            completedCount: 2,
            carriedCount: 0,
            droppedCount: 1,
            plannedCount: 3,
          },
        ]),
      });
    });

    await page.route('**/api/**', (route) => route.fallback());
  });

  test('sidebar shows conversation titles without date line', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    // Take screenshot of sidebar
    const sidebar = page.locator('[role="complementary"]').or(page.locator('.sidebar')).or(page.locator('aside'));
    await expect(sidebar).toBeVisible();

    await proof(page, 'sidebar-with-titles');

    // Verify generated titles are visible
    await expect(sidebar).toContainText('Morning Workout Planning');
    await expect(sidebar).toContainText('Study Schedule Review');
    
    // Verify no date/message-count second line is shown
    // (This is a visual check - the spec confirms titles are single-line)
    const sessionItems = sidebar.locator('[role="listitem"]').or(sidebar.locator('.conversation-item'));
    const firstItem = sessionItems.first();
    await expect(firstItem).toContainText('Morning Workout Planning');
    
    // The second line with formatted date should NOT exist
    const itemText = await firstItem.textContent();
    expect(itemText).not.toMatch(/September \d+, \d{4}/i);
    expect(itemText).not.toMatch(/\d+ messages?/i);

    await proof(page, 'sidebar-no-date-line');
  });

  test('profile menu opens and shows Settings link', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    // Find and click profile button (avatar/user button)
    const profileButton = page.getByRole('button', { name: /profile|user|account|menu/i })
      .or(page.locator('button[aria-label*="profile"]'))
      .or(page.locator('button').filter({ hasText: /^\s*[A-Z]{1,2}\s*$/ })); // Avatar with initials

    await expect(profileButton).toBeVisible();
    await proof(page, 'profile-button-visible');

    await profileButton.click();
    
    // Verify dropdown/popover menu opened
    const menu = page.getByRole('menu')
      .or(page.locator('[role="dialog"]'))
      .or(page.locator('.dropdown-menu'));
    await expect(menu).toBeVisible();

    await proof(page, 'profile-menu-open');

    // Verify Settings link exists in the menu
    const settingsLink = menu.getByRole('menuitem', { name: /settings/i })
      .or(menu.getByRole('link', { name: /settings/i }))
      .or(menu.locator('a', { hasText: /settings/i }));
    await expect(settingsLink).toBeVisible();

    await proof(page, 'settings-in-menu');

    // Verify Settings links to /settings
    await expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  test('Settings removed from main navigation', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    // Main navigation should NOT have a Settings link
    const mainNav = page.locator('nav').first();
    const navSettingsLink = mainNav.getByRole('link', { name: /settings/i, exact: false });
    
    // This should not exist or not be visible
    const count = await navSettingsLink.count();
    if (count > 0) {
      await expect(navSettingsLink.first()).not.toBeVisible();
    }

    await proof(page, 'settings-not-in-main-nav');
  });

  test('profile menu closes on outside click', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    const profileButton = page.getByRole('button', { name: /profile|user|account|menu/i })
      .or(page.locator('button[aria-label*="profile"]'))
      .or(page.locator('button').filter({ hasText: /^\s*[A-Z]{1,2}\s*$/ }));

    await profileButton.click();

    const menu = page.getByRole('menu').or(page.locator('[role="dialog"]'));
    await expect(menu).toBeVisible();

    // Click outside the menu
    await page.click('main');

    // Menu should close
    await expect(menu).not.toBeVisible();

    await proof(page, 'profile-menu-closed-on-outside-click');
  });

  test('profile menu closes on Escape key', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');

    const profileButton = page.getByRole('button', { name: /profile|user|account|menu/i })
      .or(page.locator('button[aria-label*="profile"]'))
      .or(page.locator('button').filter({ hasText: /^\s*[A-Z]{1,2}\s*$/ }));

    await profileButton.click();

    const menu = page.getByRole('menu').or(page.locator('[role="dialog"]'));
    await expect(menu).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Menu should close
    await expect(menu).not.toBeVisible();

    await proof(page, 'profile-menu-closed-on-escape');
  });
});
