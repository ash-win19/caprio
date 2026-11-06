import { expect, test, type Page } from '@playwright/test';
import { proof, requireMode } from '../lib/caprio';
import { mockDay, date, tasksForDay } from '../e2e/fixtures/day';
import type { Workflow } from '../src/lib/api';

async function mockBackendWithSessions(page: Page) {
  const base = tasksForDay()[0];
  const workflow: Workflow = { 
    date, 
    state: 'planning', 
    version: 1, 
    messages: [], 
    tasks: [], 
    backlog: [], 
    proposal: null, 
    availableMinutes: null, 
    review: null, 
    changeReceipts: [] 
  };
  
  const sessions = [
    { sessionDate: '2026-09-14', title: 'Planning team priorities', messageCount: 5, updatedAt: '2026-09-14T10:00:00Z', state: 'active', completedCount: 0, carriedCount: 0, droppedCount: 0, plannedCount: 3 },
    { sessionDate: '2026-09-13', title: 'Project deadlines discussion', messageCount: 3, updatedAt: '2026-09-13T15:30:00Z', state: 'closed', completedCount: 2, carriedCount: 1, droppedCount: 0, plannedCount: 3 },
    { sessionDate: '2026-09-12', title: 'Daily plan', messageCount: 2, updatedAt: '2026-09-12T09:00:00Z', state: 'closed', completedCount: 1, carriedCount: 0, droppedCount: 0, plannedCount: 1 },
  ];

  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workflow') return route.fulfill({ json: workflow });
    if (path === '/api/tasks') return route.fulfill({ json: { tasks: workflow.tasks } });
    if (path === '/api/chat/sessions') return route.fulfill({ json: { sessions } });
    return route.fallback();
  });
}

test('sidebar-ui: shows single-line conversation labels and profile menu', async ({ page }) => {
  requireMode('mock');
    await mockDay(page, { state: 'planning', tasks: [], firstVisit: false });
    await mockBackendWithSessions(page);
    
    // Go to a page with the conversation sidebar
    await page.goto('/new');
    
    // Wait for sidebar to be visible
    await page.waitForSelector('[aria-label="Primary"]');
    
    // Step 1: Capture sidebar with single-line conversation labels
    await proof(page, 'sidebar-with-single-line-labels');
    
    // Verify single-line conversation items
    const conversations = page.locator('button:has(svg + span)').filter({ hasText: 'Planning team priorities' });
    await expect(conversations.first()).toBeVisible();
    
    // Verify no second line with date/message count
    const conversationText = await conversations.first().textContent();
    expect(conversationText).not.toContain('Sep');
    expect(conversationText).not.toContain('messages');
    
    // Step 2: Click profile menu button
    await page.click('button[aria-label*="account menu"]');
    await page.waitForSelector('[role="menu"]', { state: 'visible' });
    
    // Capture opened profile menu
    await proof(page, 'profile-menu-opened');
    
    // Verify Settings is in the dropdown
    const settingsLink = page.locator('[role="menuitem"] a[href="/settings"]');
    await expect(settingsLink).toBeVisible();
    await expect(settingsLink).toContainText('Settings');
    
    // Step 3: Test keyboard navigation - Escape closes menu
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).not.toBeVisible();
    await proof(page, 'profile-menu-closed-with-escape');
    
    // Step 4: Test outside click closes menu
    await page.click('button[aria-label*="account menu"]');
    await page.waitForSelector('[role="menu"]', { state: 'visible' });
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('[role="menu"]')).not.toBeVisible();
    
    // Step 5: Verify Settings navigation works
    await page.click('button[aria-label*="account menu"]');
    await page.waitForSelector('[role="menu"]', { state: 'visible' });
    await page.click('[role="menuitem"] a[href="/settings"]');
    await page.waitForURL('**/settings');
    expect(page.url()).toContain('/settings');
    await proof(page, 'settings-page-from-profile-menu');
  });

test('sidebar-ui: profile menu works in collapsed sidebar', async ({ page }) => {
  requireMode('mock');
  await mockDay(page, { state: 'planning', tasks: [], firstVisit: false });
  await mockBackendWithSessions(page);
  await page.goto('/new');
  
  // Collapse the sidebar
  const collapseButton = page.locator('button[aria-label="Collapse sidebar"]');
  if (await collapseButton.isVisible()) {
    await collapseButton.click();
  }
  
  await page.waitForSelector('button[aria-label="Expand sidebar"]');
  
  // Click profile menu in collapsed state
  await page.click('button[aria-label*="account menu"]');
  await page.waitForSelector('[role="menu"]', { state: 'visible' });
  
  await proof(page, 'profile-menu-collapsed-sidebar');
  
  // Verify Settings link is accessible
  const settingsLink = page.locator('[role="menuitem"] a[href="/settings"]');
  await expect(settingsLink).toBeVisible();
});
