import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outputDir = '/opt/cursor/artifacts';
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ 
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();

// Mock session storage (demo user)
await page.addInitScript(() => {
  localStorage.setItem('caprio-session', JSON.stringify({
    user: { id: 'demo', email: 'demo@caprio.app', name: 'Demo User' },
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
});

// Mock the conversations API
await page.route('**/api/chat/sessions', (route) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sessions: [
        { id: 'conv-1', title: 'Morning workout planning', message_count: 5, last_message_at: '2026-09-14T08:15:00Z' },
        { id: 'conv-2', title: 'Exam preparation schedule', message_count: 8, last_message_at: '2026-09-14T10:00:00Z' },
        { id: 'conv-3', title: 'Project deadline discussion', message_count: 12, last_message_at: '2026-09-14T11:45:00Z' },
      ],
    }),
  });
});

// Mock workflow API
await page.route('**/api/workflow', (route) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      date: '2026-09-14',
      state: 'planning',
      version: 1,
      messages: [],
      tasks: [],
      backlog: [],
      proposal: null,
    }),
  });
});

try {
  await page.goto('http://127.0.0.1:4180/today');
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.waitForTimeout(2000);
  
  // Screenshot 1: Sidebar with conversations
  await page.screenshot({ 
    path: `${outputDir}/sidebar-conversations-single-line.png`,
    fullPage: true 
  });
  console.log('✓ Captured sidebar with conversations');

  // Screenshot 2: Open profile menu
  const profileButton = await page.locator('button').filter({ hasText: /user/i }).or(page.locator('button[aria-label*="menu"]')).first();
  if (await profileButton.isVisible({ timeout: 5000 })) {
    await profileButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ 
      path: `${outputDir}/profile-menu-opened-authenticated.png`,
      fullPage: true 
    });
    console.log('✓ Captured profile menu opened');
  } else {
    console.log('⚠ Profile button not found');
  }

  await browser.close();
  console.log('Done! Screenshots in', outputDir);
} catch (error) {
  console.error('Error:', error.message);
  await browser.close();
  process.exit(1);
}
